// server/lib/rulesIntegration.js
//
// Integration layer between the pure rules engine and your SQLite database.
// This is where DB reads/writes happen. All actual game logic lives in rulesEngine.js.
//
// Drop-in replacement for the applyHpUpdate() and applyCharacterUpdate()
// functions currently in server.js. Import these and use them instead.

'use strict';

const {
  resolveDamage,
  resolveHeal,
  resolveTempHp,
  resolveDeathSave,
  resolveConcentrationChange,
  isConcentrationSpell,
  resolveConcentrationCheckDC,
  resolveCurrentAC,
  applyCondition,
  removeCondition,
  useSpellSlot,
  restoreAllSpellSlots,
  useFeatureCharge,
  shortRestFeatures,
  longRestFeatures,
} = require('./rulesEngine');

// ---------------------------------------------------------------------------
// SESSION STATE HELPERS
// These read/write the session_states table you already have in schema.js
// ---------------------------------------------------------------------------

/**
 * Gets the session state for a character, or creates a default one.
 * @param {object} db - better-sqlite3 db instance
 * @param {number} characterId
 * @returns {object} session state (parsed from JSON columns)
 */
function getSessionState(db, characterId) {
  let state = db.prepare('SELECT * FROM session_states WHERE character_id = ?').get(characterId);

  if (!state) {
    // Create a default session state for this character
    const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
    if (!char) return null;

    db.prepare(`
      INSERT INTO session_states
        (character_id, session_id, current_hp, temp_hp, death_saves_json,
         conditions_json, buffs_json, concentrating_on,
         slots_used_json, hd_used_json, feature_uses_json, active_features_json)
      VALUES (?, NULL, ?, 0, '{"successes":0,"failures":0}', '[]', '[]', NULL, '{}', '{}', '{}', '[]')
    `).run(characterId, char.current_hp);

    state = db.prepare('SELECT * FROM session_states WHERE character_id = ?').get(characterId);
  }

  return parseSessionState(state);
}

/**
 * Parses the JSON string columns of a raw session_states row into a usable object.
 */
function parseSessionState(raw) {
  return {
    characterId: raw.character_id,
    sessionId: raw.session_id,
    currentHp: raw.current_hp,
    tempHp: raw.temp_hp,
    deathSaves: JSON.parse(raw.death_saves_json || '{"successes":0,"failures":0}'),
    activeConditions: JSON.parse(raw.conditions_json || '[]'),
    activeBuffs: JSON.parse(raw.buffs_json || '[]'),
    concentratingOn: raw.concentrating_on,
    spellSlotsUsed: JSON.parse(raw.slots_used_json || '{}'),
    hitDiceUsed: JSON.parse(raw.hd_used_json || '{}'),
    featureUses: JSON.parse(raw.feature_uses_json || '{}'),
    activeFeatures: JSON.parse(raw.active_features_json || '[]'),
  };
}

/**
 * Writes updated session state back to the DB.
 * @param {object} db
 * @param {object} state - parsed session state
 */
function saveSessionState(db, state) {
  db.prepare(`
    UPDATE session_states SET
      current_hp = ?,
      temp_hp = ?,
      death_saves_json = ?,
      conditions_json = ?,
      buffs_json = ?,
      concentrating_on = ?,
      slots_used_json = ?,
      hd_used_json = ?,
      feature_uses_json = ?,
      active_features_json = ?,
      updated_at = datetime('now')
    WHERE character_id = ?
  `).run(
    state.currentHp,
    state.tempHp,
    JSON.stringify(state.deathSaves),
    JSON.stringify(state.activeConditions),
    JSON.stringify(state.activeBuffs),
    state.concentratingOn,
    JSON.stringify(state.spellSlotsUsed),
    JSON.stringify(state.hitDiceUsed),
    JSON.stringify(state.featureUses),
    JSON.stringify(state.activeFeatures),
    state.characterId,
  );

  // Also sync currentHp back to the characters table so broadcastPartyState() still works
  db.prepare('UPDATE characters SET current_hp = ? WHERE id = ?').run(
    state.currentHp,
    state.characterId
  );
}

/**
 * Gets the parsed character data (from data_json column — the pivot column).
 * Falls back to the flat columns if data_json is empty.
 */
function getCharacterData(db, characterId) {
  const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
  if (!char) return null;

  let charData = {};
  if (char.data_json) {
    try {
      charData = JSON.parse(char.data_json);
    } catch (_) {}
  }

  // Merge flat columns as fallbacks for backward compatibility
  return {
    id: char.id,
    name: char.name,
    baseMaxHp: charData.baseMaxHp ?? char.max_hp,
    baseAc: charData.baseAc ?? char.ac,
    abilityScores: charData.abilityScores ?? {},
    spellSlots: charData.spellSlots ?? {},
    spells: charData.spells ?? [],
    features: charData.features ?? [],
    inventory: charData.inventory ?? [],
    ...charData,
  };
}

// ---------------------------------------------------------------------------
// CORE EVENT HANDLERS
// These are the functions to use in server.js socket handlers
// ---------------------------------------------------------------------------

/**
 * APPLY DAMAGE
 * Replaces applyHpUpdate() for damage events.
 * Handles: temp HP absorption, resistance, immunity, vulnerability,
 *          concentration checks, automatic death save mode.
 *
 * @param {object} db
 * @param {number} characterId
 * @param {number} rawAmount - positive integer
 * @param {string} damageType - e.g. 'fire', 'piercing'
 * @param {string[]} [resistances] - override if known; otherwise pulled from character
 * @returns {object} result with newHp, concentrationCheck, log message
 */
function applyDamageEvent(db, characterId, rawAmount, damageType = 'untyped', resistances = null) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };

  // Pull resistances/immunities/vulnerabilities from character data
  // These should be stored in data_json when available; fall back to empty arrays
  const charResistances = resistances ?? (char.resistances || []);
  const charImmunities = char.immunities || [];
  const charVulnerabilities = char.vulnerabilities || [];

  const damageResult = resolveDamage(
    { currentHp: state.currentHp, tempHp: state.tempHp, maxHp: char.baseMaxHp },
    rawAmount,
    damageType,
    charResistances,
    charImmunities,
    charVulnerabilities,
    state.activeConditions
  );

  // Check if concentration is broken
  const concCheck = resolveConcentrationCheckDC(damageResult.damageDealt, state.concentratingOn);

  // Update state
  state.currentHp = damageResult.newCurrentHp;
  state.tempHp = damageResult.newTempHp;

  // If character dropped to 0, clear concentration automatically
  if (state.currentHp === 0 && state.concentratingOn) {
    const concChange = resolveConcentrationChange(state.concentratingOn, null, state.activeBuffs);
    state.concentratingOn = null;
    state.activeBuffs = state.activeBuffs.filter(b => !concChange.droppedBuffIds.includes(b.id));
  }

  saveSessionState(db, state);

  // Build descriptive log message
  let logMsg = `${char.name} took ${damageResult.damageDealt} ${damageType} damage`;
  if (damageResult.modifier === 'immune') logMsg = `${char.name} is immune to ${damageType} damage`;
  else if (damageResult.modifier === 'resistance') logMsg += ` (halved from ${rawAmount})`;
  else if (damageResult.modifier === 'vulnerability') logMsg += ` (doubled from ${rawAmount})`;
  if (damageResult.absorbed > 0) logMsg += `, ${damageResult.absorbed} absorbed by temp HP`;
  logMsg += `. HP: ${state.currentHp}/${char.baseMaxHp}`;

  return {
    success: true,
    newHp: state.currentHp,
    newTempHp: state.tempHp,
    damageDealt: damageResult.damageDealt,
    modifier: damageResult.modifier,
    concentrationCheck: concCheck.required ? { required: true, dc: concCheck.dc } : null,
    droppedToZero: state.currentHp === 0,
    logMessage: logMsg,
  };
}

/**
 * APPLY HEALING
 *
 * @param {object} db
 * @param {number} characterId
 * @param {number} amount
 * @returns {object} result
 */
function applyHealEvent(db, characterId, amount) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };

  const result = resolveHeal(
    { currentHp: state.currentHp, tempHp: state.tempHp, maxHp: char.baseMaxHp },
    amount
  );

  state.currentHp = result.newCurrentHp;
  saveSessionState(db, state);

  return {
    success: true,
    newHp: state.currentHp,
    healed: result.healed,
    logMessage: `${char.name} was healed for ${result.healed} HP. HP: ${state.currentHp}/${char.baseMaxHp}`,
  };
}

/**
 * SET TEMP HP
 * Per 5e rules, temp HP does not stack — only the higher value applies.
 *
 * @param {object} db
 * @param {number} characterId
 * @param {number} amount
 * @returns {object} result
 */
function setTempHpEvent(db, characterId, amount) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };

  const result = resolveTempHp(state.tempHp, amount);
  state.tempHp = result.newTempHp;
  saveSessionState(db, state);

  return {
    success: true,
    newTempHp: state.tempHp,
    replaced: result.replaced,
    logMessage: result.replaced
      ? `${char.name} gained ${amount} temp HP.`
      : `${char.name} already has ${state.tempHp} temp HP (${amount} ignored — not higher).`,
  };
}

/**
 * CAST CONCENTRATION SPELL
 * Drops the old concentration spell and all its buffs, sets new concentration.
 *
 * @param {object} db
 * @param {number} characterId
 * @param {string} spellName
 * @param {number} [slotLevel] - if provided, uses a spell slot
 * @returns {object} result
 */
function castConcentrationSpellEvent(db, characterId, spellName, slotLevel = null) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };

  const concChange = resolveConcentrationChange(
    state.concentratingOn,
    spellName,
    state.activeBuffs
  );

  // Drop old concentration buffs
  state.activeBuffs = state.activeBuffs.filter(
    b => !concChange.droppedBuffIds.includes(b.id)
  );
  state.concentratingOn = spellName;

  // Use spell slot if requested
  if (slotLevel !== null) {
    const slotResult = useSpellSlot(char.spellSlots, state.spellSlotsUsed, slotLevel);
    if (!slotResult.success) {
      return { success: false, error: slotResult.error };
    }
    state.spellSlotsUsed = slotResult.newSlotsUsed;
  }

  saveSessionState(db, state);

  let logMsg = `${char.name} began concentrating on ${spellName}`;
  if (concChange.droppedSpell) {
    logMsg += `, dropping ${concChange.droppedSpell}`;
  }

  return {
    success: true,
    newConcentration: spellName,
    droppedSpell: concChange.droppedSpell,
    droppedBuffIds: concChange.droppedBuffIds,
    logMessage: logMsg,
  };
}

/**
 * DROP CONCENTRATION
 * Voluntarily drops concentration (or called automatically when HP hits 0).
 */
function dropConcentrationEvent(db, characterId) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };

  if (!state.concentratingOn) {
    return { success: true, logMessage: `${char.name} was not concentrating on anything.` };
  }

  const dropped = state.concentratingOn;
  const concChange = resolveConcentrationChange(dropped, null, state.activeBuffs);

  state.activeBuffs = state.activeBuffs.filter(b => !concChange.droppedBuffIds.includes(b.id));
  state.concentratingOn = null;

  saveSessionState(db, state);

  return {
    success: true,
    droppedSpell: dropped,
    droppedBuffIds: concChange.droppedBuffIds,
    logMessage: `${char.name} dropped concentration on ${dropped}.`,
  };
}

/**
 * APPLY CONDITION
 *
 * @param {object} db
 * @param {number} characterId
 * @param {string} condition - e.g. 'prone', 'poisoned'
 * @returns {object} result
 */
function applyConditionEvent(db, characterId, condition) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };

  const result = applyCondition(state.activeConditions, condition);

  if (result.alreadyPresent) {
    return { success: true, alreadyPresent: true, logMessage: `${char.name} already has ${condition}.` };
  }

  state.activeConditions = result.newConditions;
  saveSessionState(db, state);

  return {
    success: true,
    newConditions: state.activeConditions,
    logMessage: `${char.name} is now ${condition}.`,
  };
}

/**
 * REMOVE CONDITION
 *
 * @param {object} db
 * @param {number} characterId
 * @param {string} condition
 * @returns {object} result
 */
function removeConditionEvent(db, characterId, condition) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };

  const result = removeCondition(state.activeConditions, condition);
  state.activeConditions = result.newConditions;
  saveSessionState(db, state);

  return {
    success: true,
    newConditions: state.activeConditions,
    logMessage: result.wasPresent
      ? `${char.name} is no longer ${condition}.`
      : `${char.name} did not have the ${condition} condition.`,
  };
}

/**
 * USE SPELL SLOT
 *
 * @param {object} db
 * @param {number} characterId
 * @param {number} slotLevel
 * @returns {object} result
 */
function useSpellSlotEvent(db, characterId, slotLevel) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };

  const result = useSpellSlot(char.spellSlots, state.spellSlotsUsed, slotLevel);

  if (!result.success) return { success: false, error: result.error };

  state.spellSlotsUsed = result.newSlotsUsed;
  saveSessionState(db, state);

  const used = result.newSlotsUsed[slotLevel];
  const max = char.spellSlots[slotLevel] || 0;

  return {
    success: true,
    slotsUsed: result.newSlotsUsed,
    logMessage: `${char.name} used a level ${slotLevel} spell slot. (${used}/${max} used)`,
  };
}

/**
 * SHORT REST
 * Restores shortRest features. Does NOT restore HP (that's handled by hit dice).
 */
function shortRestEvent(db, characterId) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };

  state.featureUses = shortRestFeatures(state.featureUses, char.features || []);
  saveSessionState(db, state);

  return {
    success: true,
    logMessage: `${char.name} took a short rest. Short-rest features restored.`,
  };
}

/**
 * LONG REST
 * Restores HP to max, all spell slots, all features, clears conditions.
 * Does NOT clear concentration (that's the player's choice).
 */
function longRestEvent(db, characterId) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };

  state.currentHp = char.baseMaxHp;
  state.tempHp = 0;
  state.spellSlotsUsed = restoreAllSpellSlots();
  state.featureUses = longRestFeatures();
  state.hitDiceUsed = {};
  state.deathSaves = { successes: 0, failures: 0 };

  saveSessionState(db, state);

  return {
    success: true,
    newHp: state.currentHp,
    logMessage: `${char.name} completed a long rest. HP and resources fully restored.`,
  };
}

/**
 * GET FULL RESOLVED CHARACTER STATE
 * Combines static character data with live session state.
 * Use this for the broadcastPartyState() payload.
 *
 * @param {object} db
 * @param {number} characterId
 * @returns {object} combined view
 */
function getResolvedCharacterState(db, characterId) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return null;

  const currentAC = resolveCurrentAC(char, state.activeBuffs, state.activeConditions);

  return {
    id: char.id,
    name: char.name,
    classes: char.classes,
    currentHp: state.currentHp,
    maxHp: char.baseMaxHp,
    tempHp: state.tempHp,
    ac: currentAC.finalAC,
    acBreakdown: currentAC.breakdown,
    conditions: state.activeConditions,
    buffs: state.activeBuffs,
    concentratingOn: state.concentratingOn,
    spellSlotsUsed: state.spellSlotsUsed,
    spellSlotsMax: char.spellSlots,
    featureUses: state.featureUses,
    activeFeatures: state.activeFeatures,
    deathSaves: state.deathSaves,
  };
}

module.exports = {
  // DB helpers (expose for testing)
  getSessionState,
  saveSessionState,
  getCharacterData,
  getResolvedCharacterState,

  // Event handlers (use these in server.js)
  applyDamageEvent,
  applyHealEvent,
  setTempHpEvent,
  castConcentrationSpellEvent,
  dropConcentrationEvent,
  applyConditionEvent,
  removeConditionEvent,
  useSpellSlotEvent,
  shortRestEvent,
  longRestEvent,
};
