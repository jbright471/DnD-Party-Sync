// server/lib/rulesIntegration.js
//
// Integration layer between the pure rules engine and your SQLite database.
// This is where DB reads/writes happen. All actual game logic lives in rulesEngine.js.
//
// Drop-in replacement for the applyHpUpdate() and applyCharacterUpdate()
// functions currently in server.js. Import these and use them instead.

'use strict';

const crypto = require('crypto');
const {
  resolveDamage,
  resolveHeal,
  resolveTempHp,
  resolveConcentrationChange,
  resolveConcentrationCheckDC,
  resolveCurrentAC,
  resolveFinalAbilityScores,
  applyCondition,
  removeCondition,
  useSpellSlot,
  restoreAllSpellSlots,
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
    } catch (_) { }
  }

  const inventory = char.inventory ? JSON.parse(char.inventory) : [];
  const homebrewInventory = char.homebrew_inventory ? JSON.parse(char.homebrew_inventory) : [];
  const abilityScores = charData.abilityScores ?? (char.stats ? JSON.parse(char.stats) : {});
  const spellSlots = charData.spellSlots ?? (char.spell_slots ? JSON.parse(char.spell_slots) : {});
  const spells = charData.spells ?? (char.spells ? JSON.parse(char.spells) : []);
  const features = charData.features ?? (char.features ? JSON.parse(char.features) : []);
  const skills = charData.skills ?? (char.skills ? JSON.parse(char.skills) : []);

  return {
    id: char.id,
    name: char.name,
    class: char.class,
    level: char.level,
    baseMaxHp: charData.baseMaxHp ?? char.max_hp,
    baseAc: charData.baseAc ?? char.ac,
    abilityScores,
    spellSlots,
    spells,
    features,
    skills,
    inventory,
    homebrewInventory,
    tokenImage: char.token_image,
    backstory: char.backstory || charData.backstory || '',
    raw_dndbeyond_json: char.raw_dndbeyond_json,
    ...charData,
    id: char.id, // Explicitly override id to prevent charData (like DDB JSON) from replacing the SQLite ID
  };
}

// ---------------------------------------------------------------------------
// CORE EVENT HANDLERS
// ---------------------------------------------------------------------------

function applyDamageEvent(db, characterId, rawAmount, damageType = 'untyped', resistances = null) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };

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

  const concCheck = resolveConcentrationCheckDC(damageResult.damageDealt, state.concentratingOn);

  state.currentHp = damageResult.newCurrentHp;
  state.tempHp = damageResult.newTempHp;

  if (state.currentHp === 0 && state.concentratingOn) {
    const concChange = resolveConcentrationChange(state.concentratingOn, null, state.activeBuffs);
    state.concentratingOn = null;
    state.activeBuffs = state.activeBuffs.filter(b => !concChange.droppedBuffIds.includes(b.id));
  }

  saveSessionState(db, state);

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

function applyHealEvent(db, characterId, amount) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };

  const result = resolveHeal({ currentHp: state.currentHp, tempHp: state.tempHp, maxHp: char.baseMaxHp }, amount);
  state.currentHp = result.newCurrentHp;
  saveSessionState(db, state);
  return { success: true, newHp: state.currentHp, healed: result.healed, logMessage: `${char.name} was healed for ${result.healed} HP. HP: ${state.currentHp}/${char.baseMaxHp}` };
}

function setTempHpEvent(db, characterId, amount) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };
  const result = resolveTempHp(state.tempHp, amount);
  state.tempHp = result.newTempHp;
  saveSessionState(db, state);
  return { success: true, newTempHp: state.tempHp, replaced: result.replaced, logMessage: result.replaced ? `${char.name} gained ${amount} temp HP.` : `${char.name} already has ${state.tempHp} temp HP.` };
}

function castConcentrationSpellEvent(db, characterId, spellName, slotLevel = null) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };
  const concChange = resolveConcentrationChange(state.concentratingOn, spellName, state.activeBuffs);
  state.activeBuffs = state.activeBuffs.filter(b => !concChange.droppedBuffIds.includes(b.id));
  state.concentratingOn = spellName;
  if (slotLevel !== null) {
    const slotResult = useSpellSlot(char.spellSlots, state.spellSlotsUsed, slotLevel);
    if (!slotResult.success) return { success: false, error: slotResult.error };
    state.spellSlotsUsed = slotResult.newSlotsUsed;
  }
  saveSessionState(db, state);
  return { success: true, newConcentration: spellName, droppedSpell: concChange.droppedSpell, droppedBuffIds: concChange.droppedBuffIds, logMessage: `${char.name} began concentrating on ${spellName}${concChange.droppedSpell ? `, dropping ${concChange.droppedSpell}` : ''}` };
}

function dropConcentrationEvent(db, characterId) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };
  if (!state.concentratingOn) return { success: true, logMessage: `${char.name} was not concentrating.` };
  const dropped = state.concentratingOn;
  const concChange = resolveConcentrationChange(dropped, null, state.activeBuffs);
  state.activeBuffs = state.activeBuffs.filter(b => !concChange.droppedBuffIds.includes(b.id));
  state.concentratingOn = null;
  saveSessionState(db, state);
  return { success: true, droppedSpell: dropped, droppedBuffIds: concChange.droppedBuffIds, logMessage: `${char.name} dropped concentration on ${dropped}.` };
}

function applyConditionEvent(db, characterId, condition) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };
  const result = applyCondition(state.activeConditions, condition);
  if (result.alreadyPresent) return { success: true, alreadyPresent: true, logMessage: `${char.name} already has ${condition}.` };
  state.activeConditions = result.newConditions;
  saveSessionState(db, state);
  return { success: true, newConditions: state.activeConditions, logMessage: `${char.name} is now ${condition}.` };
}

function removeConditionEvent(db, characterId, condition) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };
  const result = removeCondition(state.activeConditions, condition);
  state.activeConditions = result.newConditions;
  saveSessionState(db, state);
  return { success: true, newConditions: state.activeConditions, logMessage: result.wasPresent ? `${char.name} is no longer ${condition}.` : `${char.name} did not have ${condition}.` };
}

function applyBuffEvent(db, characterId, buffData) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!state || !char) return { success: false };

  const newBuff = {
    id: crypto.randomUUID ? crypto.randomUUID() : `buff-${Date.now()}-${Math.random()}`,
    name: buffData.name,
    sourceName: buffData.sourceName || 'System',
    isConcentration: !!buffData.isConcentration,
    timestamp: new Date().toISOString()
  };

  state.activeBuffs.push(newBuff);
  saveSessionState(db, state);
  return { success: true, buff: newBuff, logMessage: `Applied ${buffData.name} to ${char.name}.` };
}

function removeBuffEvent(db, characterId, buffId) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!state || !char) return { success: false };

  const originalCount = state.activeBuffs.length;
  state.activeBuffs = state.activeBuffs.filter(b => b.id !== buffId && b.name !== buffId);

  if (state.activeBuffs.length !== originalCount) {
    saveSessionState(db, state);
    return { success: true, logMessage: `Removed buff from ${char.name}.` };
  }
  return { success: false };
}

function useSpellSlotEvent(db, characterId, slotLevel) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };
  const result = useSpellSlot(char.spellSlots, state.spellSlotsUsed, slotLevel);
  if (!result.success) return { success: false, error: result.error };
  state.spellSlotsUsed = result.newSlotsUsed;
  saveSessionState(db, state);
  return { success: true, slotsUsed: result.newSlotsUsed, logMessage: `${char.name} used a level ${slotLevel} spell slot.` };
}

function shortRestEvent(db, characterId) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return { success: false, error: 'Character not found' };
  state.featureUses = shortRestFeatures(state.featureUses, char.features || []);
  saveSessionState(db, state);
  return { success: true, logMessage: `${char.name} took a short rest.` };
}

function longRestEvent(db, characterId) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return null;
  state.currentHp = char.baseMaxHp;
  state.tempHp = 0;
  state.spellSlotsUsed = restoreAllSpellSlots();
  state.featureUses = longRestFeatures();
  state.hitDiceUsed = {};
  state.deathSaves = { successes: 0, failures: 0 };
  saveSessionState(db, state);
  return { success: true, newHp: state.currentHp, logMessage: `${char.name} completed a long rest.` };
}

function getResolvedCharacterState(db, characterId) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return null;

  const currentAC = resolveCurrentAC(char, state.activeBuffs, state.activeConditions, [...char.inventory, ...char.homebrewInventory]);
  const finalScores = resolveFinalAbilityScores(char, [...char.inventory, ...char.homebrewInventory]);

  return {
    id: char.id,
    name: char.name,
    classes: char.classes || [{ name: char.class, level: char.level }],
    currentHp: state.currentHp,
    maxHp: char.baseMaxHp,
    tempHp: state.tempHp,
    ac: currentAC.finalAC,
    acBreakdown: currentAC.breakdown,
    abilityScores: finalScores,
    skills: char.skills,
    conditions: state.activeConditions,
    buffs: state.activeBuffs,
    concentratingOn: state.concentratingOn,
    spellSlotsUsed: state.spellSlotsUsed,
    spellSlotsMax: char.spellSlots,
    featureUses: state.featureUses,
    activeFeatures: state.activeFeatures,
    deathSaves: state.deathSaves,
    inventory: char.inventory,
    homebrewInventory: char.homebrewInventory,
    attacks: char.attacks || [],
    tokenImage: char.tokenImage,
    spells: char.spells,
    features: char.features,
    backstory: char.backstory,
    raw_dndbeyond_json: char.raw_dndbeyond_json,
  };
}

module.exports = {
  getSessionState, saveSessionState, getCharacterData, getResolvedCharacterState,
  applyDamageEvent, applyHealEvent, setTempHpEvent, castConcentrationSpellEvent,
  dropConcentrationEvent, applyConditionEvent, removeConditionEvent, useSpellSlotEvent,
  shortRestEvent, longRestEvent, applyBuffEvent, removeBuffEvent
};
