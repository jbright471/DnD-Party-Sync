// server/lib/rulesIntegration.js
//
// Integration layer between the pure rules engine and your SQLite database.
// This is where DB reads/writes happen. All actual game logic lives in rulesEngine.js.
//
// Drop-in replacement for the applyHpUpdate() and applyCharacterUpdate()
// functions currently in server.js. Import these and use them instead.

'use strict';

const crypto = require('crypto');
const { getAutomationRules } = require('./automationRules');
const {
  resolveDamage,
  resolveHeal,
  resolveTempHp,
  resolveConcentrationChange,
  resolveConcentrationCheckDC,
  resolveCurrentAC,
  resolveFinalAbilityScores,
  resolveSavingThrows,
  resolveSkills,
  resolveSpeed,
  resolveInitiative,
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
    conditionDurations: JSON.parse(raw.condition_durations_json || '{}'),
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
      condition_durations_json = ?,
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
    JSON.stringify(state.conditionDurations || {}),
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
  const skillProficiencies = char.skill_proficiencies ? (() => { try { return JSON.parse(char.skill_proficiencies); } catch { return {}; } })() : {};
  const saveProficiencies  = char.save_proficiencies  ? (() => { try { return JSON.parse(char.save_proficiencies);  } catch { return {}; } })() : {};
  const attacks = char.attacks ? (() => { try { return JSON.parse(char.attacks); } catch { return []; } })() : [];

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
    skillProficiencies,
    saveProficiencies,
    attacks,
    inventory,
    homebrewInventory,
    tokenImage: char.token_image,
    backstory: char.backstory || charData.backstory || '',
    raw_dndbeyond_json: char.raw_dndbeyond_json,
    ...charData,
    id: char.id, // Explicitly override id to prevent charData (like DDB JSON) from replacing the SQLite ID
    // Override charData spreads with our parsed values so they're always in the right shape
    skillProficiencies,
    saveProficiencies,
    attacks,
  };
}

// ---------------------------------------------------------------------------
// CONCURRENCY & TRANSACTION ISOLATION HELPERS
// ---------------------------------------------------------------------------

/**
 * Executes a function inside an IMMEDIATE transaction to guarantee atomic database updates.
 * If a transaction is already active (e.g. during an AoE or batch operation),
 * it runs the function directly inside the existing transaction context to avoid nested-lock errors.
 */
function runInImmediateTransaction(db, fn) {
  if (db.inTransaction) {
    return fn();
  }
  return db.transaction(fn).immediate();
}

// ---------------------------------------------------------------------------
// CORE EVENT HANDLERS
// ---------------------------------------------------------------------------

function applyDamageEvent(db, characterId, rawAmount, damageType = 'untyped', resistances = null) {
  return runInImmediateTransaction(db, () => {
    const automationRules = getAutomationRules(db);
    const char = getCharacterData(db, characterId);
    const state = getSessionState(db, characterId);
    if (!char || !state) return { success: false, error: 'Character not found' };

    const charResistances = resistances ?? (char.resistances || []);
    const charImmunities = char.immunities || [];
    const charVulnerabilities = char.vulnerabilities || [];

    const featureBuffs = (state.activeFeatures || []).map(f => ({ name: f, isFeature: true }));
    const combinedBuffs = [...(state.activeBuffs || []), ...featureBuffs];

    const damageResult = resolveDamage(
      { currentHp: state.currentHp, tempHp: state.tempHp, maxHp: char.baseMaxHp },
      rawAmount,
      damageType,
      charResistances,
      charImmunities,
      charVulnerabilities,
      state.activeConditions,
      combinedBuffs
    );

    const concCheck = resolveConcentrationCheckDC(damageResult.damageDealt, state.concentratingOn);

    state.currentHp = damageResult.newCurrentHp;
    state.tempHp = damageResult.newTempHp;

    if (automationRules.concentrationCleanup && state.currentHp === 0 && state.concentratingOn) {
      const concChange = resolveConcentrationChange(state.concentratingOn, null, state.activeBuffs);
      state.concentratingOn = null;
      state.activeBuffs = state.activeBuffs.filter(b => !concChange.droppedBuffIds.includes(b.id));
    }

    if (automationRules.automaticUnconscious && state.currentHp === 0 && !state.activeConditions.includes('unconscious')) {
      state.activeConditions = [...state.activeConditions, 'unconscious'];
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
  });
}

function applyHealEvent(db, characterId, amount) {
  return runInImmediateTransaction(db, () => {
    const automationRules = getAutomationRules(db);
    const char = getCharacterData(db, characterId);
    const state = getSessionState(db, characterId);
    if (!char || !state) return { success: false, error: 'Character not found' };

    const result = resolveHeal({ currentHp: state.currentHp, tempHp: state.tempHp, maxHp: char.baseMaxHp }, amount);
    state.currentHp = result.newCurrentHp;
    if (automationRules.clearUnconsciousOnHeal && state.currentHp > 0 && state.activeConditions.includes('unconscious')) {
      state.activeConditions = state.activeConditions.filter(condition => condition !== 'unconscious');
      delete state.conditionDurations.unconscious;
    }
    saveSessionState(db, state);
    return { success: true, newHp: state.currentHp, healed: result.healed, logMessage: `${char.name} was healed for ${result.healed} HP. HP: ${state.currentHp}/${char.baseMaxHp}` };
  });
}

function setTempHpEvent(db, characterId, amount) {
  return runInImmediateTransaction(db, () => {
    const char = getCharacterData(db, characterId);
    const state = getSessionState(db, characterId);
    if (!char || !state) return { success: false, error: 'Character not found' };
    const result = resolveTempHp(state.tempHp, amount);
    state.tempHp = result.newTempHp;
    saveSessionState(db, state);
    return { success: true, newTempHp: state.tempHp, replaced: result.replaced, logMessage: result.replaced ? `${char.name} gained ${amount} temp HP.` : `${char.name} already has ${state.tempHp} temp HP.` };
  });
}

function castConcentrationSpellEvent(db, characterId, spellName, slotLevel = null) {
  return runInImmediateTransaction(db, () => {
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
  });
}

function dropConcentrationEvent(db, characterId) {
  return runInImmediateTransaction(db, () => {
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
  });
}

function applyConditionEvent(db, characterId, condition, durationRounds) {
  return runInImmediateTransaction(db, () => {
    const char = getCharacterData(db, characterId);
    const state = getSessionState(db, characterId);
    if (!char || !state) return { success: false, error: 'Character not found' };

    // Condition immunity check: Heroism grants immunity to Frightened
    const normCond = condition.toLowerCase().trim();
    const hasHeroism = state.activeBuffs.some(b => b.name && b.name.toLowerCase().trim() === 'heroism');
    if (normCond === 'frightened' && hasHeroism) {
      return { success: true, bypassed: true, logMessage: `${char.name} is immune to Frightened due to Heroism.` };
    }

    const result = applyCondition(state.activeConditions, condition);
    if (result.alreadyPresent) return { success: true, alreadyPresent: true, logMessage: `${char.name} already has ${condition}.` };
    state.activeConditions = result.newConditions;
    // Track duration if provided (null/undefined = permanent)
    if (durationRounds != null && durationRounds > 0) {
      state.conditionDurations[condition.toLowerCase().trim()] = durationRounds;
    }
    saveSessionState(db, state);
    const durationStr = durationRounds > 0 ? ` (${durationRounds} rds)` : '';
    return { success: true, newConditions: state.activeConditions, logMessage: `${char.name} is now ${condition}${durationStr}.` };
  });
}

function removeConditionEvent(db, characterId, condition) {
  return runInImmediateTransaction(db, () => {
    const char = getCharacterData(db, characterId);
    const state = getSessionState(db, characterId);
    if (!char || !state) return { success: false, error: 'Character not found' };
    const result = removeCondition(state.activeConditions, condition);
    state.activeConditions = result.newConditions;
    // Clean up duration tracking
    delete state.conditionDurations[condition.toLowerCase().trim()];
    saveSessionState(db, state);
    return { success: true, newConditions: state.activeConditions, logMessage: result.wasPresent ? `${char.name} is no longer ${condition}.` : `${char.name} did not have ${condition}.` };
  });
}

function tickConditionsEvent(db, characterId) {
  return runInImmediateTransaction(db, () => {
    if (!getAutomationRules(db).conditionDurations) {
      return { success: true, expired: [], remaining: [], skipped: true };
    }
    const char = getCharacterData(db, characterId);
    const state = getSessionState(db, characterId);
    if (!char || !state) return { success: false, expired: [], remaining: [] };

    const expired = [];
    const remaining = [];
    const durations = { ...state.conditionDurations };

    for (const [condName, dur] of Object.entries(durations)) {
      const newDur = dur - 1;
      if (newDur <= 0) {
        // Remove the expired condition
        const result = removeCondition(state.activeConditions, condName);
        state.activeConditions = result.newConditions;
        delete durations[condName];
        if (result.wasPresent) expired.push(condName);
      } else {
        durations[condName] = newDur;
        remaining.push({ name: condName, duration: newDur });
      }
    }

    state.conditionDurations = durations;
    saveSessionState(db, state);

    return { success: true, expired, remaining, characterName: char.name };
  });
}

function applyBuffEvent(db, characterId, buffData) {
  return runInImmediateTransaction(db, () => {
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
  });
}

function removeBuffEvent(db, characterId, buffId) {
  return runInImmediateTransaction(db, () => {
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
  });
}

function useSpellSlotEvent(db, characterId, slotLevel) {
  return runInImmediateTransaction(db, () => {
    const char = getCharacterData(db, characterId);
    const state = getSessionState(db, characterId);
    if (!char || !state) return { success: false, error: 'Character not found' };
    const result = useSpellSlot(char.spellSlots, state.spellSlotsUsed, slotLevel);
    if (!result.success) return { success: false, error: result.error };
    state.spellSlotsUsed = result.newSlotsUsed;
    saveSessionState(db, state);
    return { success: true, slotsUsed: result.newSlotsUsed, logMessage: `${char.name} used a level ${slotLevel} spell slot.` };
  });
}

function spendHitDieEvent(db, characterId, dieType) {
  return runInImmediateTransaction(db, () => {
    const char = getCharacterData(db, characterId);
    const state = getSessionState(db, characterId);
    if (!char || !state) return { success: false, error: 'Character not found' };

    const totalDice = (char.hitDice || {})[dieType] || 0;
    const usedDice = (state.hitDiceUsed || {})[dieType] || 0;
    const remaining = totalDice - usedDice;

    if (remaining <= 0) return { success: false, error: `No ${dieType} hit dice remaining` };

    const sides = parseInt(dieType.replace('d', ''));
    const roll = Math.floor(Math.random() * sides) + 1;

    const conScore = (char.abilityScores || {}).CON || 10;
    const conMod = Math.floor((conScore - 10) / 2);
    const healAmount = Math.max(roll + conMod, 1);

    const healResult = resolveHeal(
      { currentHp: state.currentHp, tempHp: state.tempHp, maxHp: char.baseMaxHp },
      healAmount
    );
    state.currentHp = healResult.newCurrentHp;

    state.hitDiceUsed = { ...state.hitDiceUsed, [dieType]: usedDice + 1 };

    saveSessionState(db, state);

    return {
      success: true,
      dieType,
      roll,
      conMod,
      healAmount,
      healed: healResult.healed,
      newHp: state.currentHp,
      maxHp: char.baseMaxHp,
      remaining: remaining - 1,
      logMessage: `${char.name} spent a ${dieType} hit die: rolled ${roll} + ${conMod} CON = ${healAmount} HP healed (${state.currentHp}/${char.baseMaxHp})`,
    };
  });
}

function toggleFeatureEvent(db, characterId, featureName) {
  return runInImmediateTransaction(db, () => {
    const char = getCharacterData(db, characterId);
    const state = getSessionState(db, characterId);
    if (!char || !state) return { success: false, error: 'Character not found' };

    const activeFeatures = new Set(state.activeFeatures || []);
    let isActive = false;
    
    if (activeFeatures.has(featureName)) {
      activeFeatures.delete(featureName);
    } else {
      activeFeatures.add(featureName);
      isActive = true;
    }

    state.activeFeatures = Array.from(activeFeatures);
    saveSessionState(db, state);

    return { 
      success: true, 
      isActive,
      logMessage: `${char.name} ${isActive ? 'activated' : 'deactivated'} ${featureName}.`
    };
  });
}

function shortRestEvent(db, characterId) {
  return runInImmediateTransaction(db, () => {
    const char = getCharacterData(db, characterId);
    const state = getSessionState(db, characterId);
    if (!char || !state) return { success: false, error: 'Character not found' };
    state.featureUses = shortRestFeatures(state.featureUses, char.features || []);
    saveSessionState(db, state);
    return { success: true, logMessage: `${char.name} took a short rest.` };
  });
}

function longRestEvent(db, characterId) {
  return runInImmediateTransaction(db, () => {
    const char = getCharacterData(db, characterId);
    const state = getSessionState(db, characterId);
    if (!char || !state) return null;
    state.currentHp = char.baseMaxHp;
    state.tempHp = 0;
    state.spellSlotsUsed = restoreAllSpellSlots();
    state.featureUses = longRestFeatures();

    const totalHitDice = char.hitDice || {};
    const totalCount = Object.values(totalHitDice).reduce((s, n) => s + n, 0);
    const recoverable = Math.max(Math.floor(totalCount / 2), 1);
    let toRecover = recoverable;
    const newHdUsed = { ...state.hitDiceUsed };
    for (const [dieType, used] of Object.entries(newHdUsed)) {
      if (toRecover <= 0) break;
      const restore = Math.min(used, toRecover);
      newHdUsed[dieType] = used - restore;
      toRecover -= restore;
      if (newHdUsed[dieType] <= 0) delete newHdUsed[dieType];
    }
    state.hitDiceUsed = newHdUsed;

    state.deathSaves = { successes: 0, failures: 0 };
    saveSessionState(db, state);
    return { success: true, newHp: state.currentHp, logMessage: `${char.name} completed a long rest.` };
  });
}

function getResolvedCharacterState(db, characterId) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return null;

  // Integrate Aura-Sync dynamic buffs
  const { getActiveAuras, deduplicateCombinedBuffs } = require('../services/effects-engine/auras');
  const activeAuras = getActiveAuras(db);
  const auraBuffs = [];
  for (const aura of activeAuras) {
    if (aura.active && Array.isArray(aura.targets) && aura.targets.includes(Number(characterId))) {
      auraBuffs.push({
        id: `aura-${aura.id}`,
        name: aura.name,
        sourceName: aura.casterName || 'Aura',
        modifierType: aura.buffData?.modifierType || 'flatBonus',
        statAffected: aura.buffData?.statAffected || null,
        modifierValue: aura.buffData?.modifierValue || null,
        isAura: true,
        auraId: aura.id,
        ...aura.buffData
      });
    }
  }

  const featureBuffs = (state.activeFeatures || []).map(featureName => {
    return {
      id: `feature-${featureName}`,
      name: featureName,
      sourceName: featureName,
      modifierType: 'feature',
      isFeature: true
    };
  });

  const combinedBuffs = deduplicateCombinedBuffs([...(state.activeBuffs || []), ...auraBuffs, ...featureBuffs]);
  const allInventory = [...char.inventory, ...char.homebrewInventory];
  const { finalScores, breakdown: abilityScoresBreakdown } = resolveFinalAbilityScores(char, allInventory, combinedBuffs, state.activeConditions);
  const currentAC = resolveCurrentAC(char, combinedBuffs, state.activeConditions, allInventory);
  const savesResult = resolveSavingThrows(char, combinedBuffs, state.activeConditions, allInventory);
  const skillsResult = resolveSkills(char, combinedBuffs, state.activeConditions, allInventory);
  const speedResult = resolveSpeed(char, combinedBuffs, state.activeConditions, allInventory);
  const initResult = resolveInitiative(char, combinedBuffs, state.activeConditions, allInventory);

  const proficiencyBonus = Math.floor((char.level - 1) / 4) + 2;
  const { getFormattedAbilityModifier, calculateAbilityModifier } = require('../engine/calculators/modifiers');
  const { getAllRollModifiers } = require('../engine/rules-parser');
  const formattedModifiers = {
    STR: getFormattedAbilityModifier(finalScores.STR),
    DEX: getFormattedAbilityModifier(finalScores.DEX),
    CON: getFormattedAbilityModifier(finalScores.CON),
    INT: getFormattedAbilityModifier(finalScores.INT),
    WIS: getFormattedAbilityModifier(finalScores.WIS),
    CHA: getFormattedAbilityModifier(finalScores.CHA),
  };
  const abilityModifiers = {
    STR: calculateAbilityModifier(finalScores.STR),
    DEX: calculateAbilityModifier(finalScores.DEX),
    CON: calculateAbilityModifier(finalScores.CON),
    INT: calculateAbilityModifier(finalScores.INT),
    WIS: calculateAbilityModifier(finalScores.WIS),
    CHA: calculateAbilityModifier(finalScores.CHA),
  };

  const rollModifiers = getAllRollModifiers(state.activeConditions, combinedBuffs);

  return {
    id: char.id,
    name: char.name,
    class: char.class,
    level: char.level,
    proficiencyBonus,
    classes: char.classes || [{ name: char.class, level: char.level }],
    currentHp: state.currentHp,
    maxHp: char.baseMaxHp,
    tempHp: state.tempHp,
    ac: currentAC.finalAC,
    acBreakdown: currentAC.breakdown,
    abilityScores: finalScores,
    abilityScoresBreakdown: abilityScoresBreakdown,
    abilityModifiers,
    formattedModifiers,
    rollModifiers,
    savingThrows: savesResult.finalSaves,
    savingThrowsBreakdown: savesResult.breakdown,
    skills: skillsResult.finalSkills,
    skillsBreakdown: skillsResult.breakdown,
    speed: speedResult.finalSpeed,
    speedBreakdown: speedResult.breakdown,
    initiative: initResult.finalInitiative,
    initiativeBreakdown: initResult.breakdown,
    skillProficiencies: char.skillProficiencies || {},
    saveProficiencies:  char.saveProficiencies  || {},
    conditions: state.activeConditions,
    conditionDurations: state.conditionDurations || {},
    buffs: combinedBuffs,
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
    hitDice: char.hitDice || {},
    hitDiceUsed: state.hitDiceUsed || {},
  };
}

function getCombatStateInspector(db, characterId) {
  const char = getCharacterData(db, characterId);
  const state = getSessionState(db, characterId);
  if (!char || !state) return null;

  const allInventory = [...(char.inventory || []), ...(char.homebrewInventory || [])];
  const acResult = require('./rulesEngine').resolveCurrentAC(char, state.activeBuffs, state.activeConditions, allInventory);
  
  const baseStats = char.abilityScores || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  const finalStats = { ...baseStats };
  const statBreakdowns = {
    STR: [{ source: 'Base', value: baseStats.STR || 10 }],
    DEX: [{ source: 'Base', value: baseStats.DEX || 10 }],
    CON: [{ source: 'Base', value: baseStats.CON || 10 }],
    INT: [{ source: 'Base', value: baseStats.INT || 10 }],
    WIS: [{ source: 'Base', value: baseStats.WIS || 10 }],
    CHA: [{ source: 'Base', value: baseStats.CHA || 10 }]
  };
  
  const MAP = { 'strength': 'STR', 'dexterity': 'DEX', 'constitution': 'CON', 'intelligence': 'INT', 'wisdom': 'WIS', 'charisma': 'CHA' };

  for (const item of allInventory) {
    if (item.equipped && item.stats && item.stats.statBonuses) {
      for (let [stat, bonus] of Object.entries(item.stats.statBonuses)) {
        let s = stat.toUpperCase();
        if (MAP[stat.toLowerCase()]) s = MAP[stat.toLowerCase()];
        if (finalStats[s] !== undefined) {
            finalStats[s] += bonus;
            statBreakdowns[s].push({ source: item.name, value: bonus });
        }
      }
    }
  }

  const { CONDITION_EFFECTS } = require('./rulesEngine');
  const conditions = state.activeConditions.map(cond => {
    return { name: cond, effects: CONDITION_EFFECTS[cond.toLowerCase()] || {} };
  });

  return {
    characterName: char.name,
    ac: acResult,
    abilityScores: {
      final: finalStats,
      breakdown: statBreakdowns
    },
    hp: {
      current: state.currentHp,
      max: char.baseMaxHp,
      temp: state.tempHp
    },
    activeConditions: conditions,
    activeBuffs: state.activeBuffs,
    concentratingOn: state.concentratingOn,
  };
}

module.exports = {
  getSessionState, saveSessionState, getCharacterData, getResolvedCharacterState,
  applyDamageEvent, applyHealEvent, setTempHpEvent, castConcentrationSpellEvent,
  dropConcentrationEvent, applyConditionEvent, removeConditionEvent, tickConditionsEvent,
  useSpellSlotEvent, spendHitDieEvent, toggleFeatureEvent, shortRestEvent, longRestEvent, applyBuffEvent, removeBuffEvent,
  getCombatStateInspector,
};
