// server/lib/rulesEngine.js
//
// Pure rules engine for D&D 5e mechanics.
// All functions are pure where possible — they take state in, return results out.
// DB writes are handled by the integration layer (rulesIntegration.js), not here.
// This makes the logic fully testable without a database.

'use strict';

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning',
  'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing',
  'thunder',
  'magical bludgeoning', 'magical piercing', 'magical slashing',
];

const CONDITION_EFFECTS = {
  blinded: {
    description: 'Attacks against you have advantage. Your attacks have disadvantage.',
    attacksAgainstAdvantage: true,
    attacksDisadvantage: true,
    autoFail: ['sight-based checks'],
  },
  charmed: {
    description: 'Cannot attack the charmer. Charmer has advantage on social checks.',
    socialAdvantageForCharmer: true,
  },
  deafened: {
    description: 'Cannot hear. Auto-fail hearing checks.',
    autoFail: ['hearing checks'],
  },
  exhaustion: {
    description: 'Cumulative penalties by level (1-6).',
    isLeveled: true,
  },
  frightened: {
    description: 'Disadvantage on checks/attacks while source is in sight. Cannot move closer.',
    attacksDisadvantage: true,
    checksDisadvantage: true,
  },
  grappled: {
    description: 'Speed = 0.',
    speedOverride: 0,
  },
  incapacitated: {
    description: 'Cannot take actions or reactions.',
    noActions: true,
    noReactions: true,
  },
  invisible: {
    description: 'Attacks against you have disadvantage. Your attacks have advantage.',
    attacksAgainstDisadvantage: true,
    attacksAdvantage: true,
  },
  paralyzed: {
    description: 'Incapacitated. Auto-fail STR/DEX saves. Attacks against have advantage. Hits within 5ft are crits.',
    noActions: true,
    noReactions: true,
    autoFail: ['STR', 'DEX'],
    attacksAgainstAdvantage: true,
    critRangeWithin5ft: true,
  },
  petrified: {
    description: 'Incapacitated, can\'t move/speak, unaware. Resistance to all damage. Immune to poison/disease.',
    noActions: true,
    noReactions: true,
    speedOverride: 0,
    resistAll: true,
    attacksAgainstAdvantage: true,
    autoFail: ['STR', 'DEX'],
  },
  poisoned: {
    description: 'Disadvantage on attack rolls and ability checks.',
    attacksDisadvantage: true,
    checksDisadvantage: true,
  },
  prone: {
    description: 'Disadvantage on attacks. Attacks against: advantage within 5ft, disadvantage at range.',
    attacksDisadvantage: true,
    attacksAgainstAdvantageCloseMelee: true,
    attacksAgainstDisadvantageRanged: true,
    halveMoveSpeed: true,
  },
  restrained: {
    description: 'Speed = 0. Disadvantage on attacks. Attacks against have advantage. Disadvantage on DEX saves.',
    speedOverride: 0,
    attacksDisadvantage: true,
    attacksAgainstAdvantage: true,
    savingThrowDisadvantage: ['DEX'],
  },
  stunned: {
    description: 'Incapacitated, can\'t move, can only speak falteringly. Auto-fail STR/DEX saves. Attacks against have advantage.',
    noActions: true,
    noReactions: true,
    speedOverride: 0,
    attacksAgainstAdvantage: true,
    autoFail: ['STR', 'DEX'],
  },
  unconscious: {
    description: 'Incapacitated, can\'t move or speak, unaware. Drop whatever held, fall prone. Auto-fail STR/DEX saves. Attacks against advantage. Hits within 5ft are crits.',
    noActions: true,
    noReactions: true,
    speedOverride: 0,
    prone: true,
    attacksAgainstAdvantage: true,
    critRangeWithin5ft: true,
    autoFail: ['STR', 'DEX'],
  },
};

const BUFF_EFFECTS = {
  'bless': {
    description: '+1d4 to attack rolls and saving throws.',
    attackBonusRoll: '1d4',
    saveBonusRoll: '1d4',
  },
  'haste': {
    description: '+2 AC, advantage on DEX saves, additional action.',
    acBonus: 2,
    saveAdvantage: ['DEX'],
  },
  'shield of faith': {
    description: '+2 AC.',
    acBonus: 2,
  },
  'bane': {
    description: '-1d4 to attack rolls and saving throws.',
    attackBonusRoll: '-1d4',
    saveBonusRoll: '-1d4',
  },
  'rage': {
    description: 'Resistance to bludgeoning, piercing, and slashing damage. Advantage on STR checks/saves.',
    saveAdvantage: ['STR'],
    damageResistance: ['bludgeoning', 'piercing', 'slashing']
  },
  'slow': {
    description: '-2 AC, -2 to DEX saves, speed halved, limited actions.',
    acBonus: -2,
    savePenalty: ['DEX', -2]
  }
};

const KNOWN_CONCENTRATION_SPELLS = new Set([
  "bless", "bane", "faerie fire", "hunters mark", "hunter's mark",
  "hex", "hypnotic pattern", "hold person", "hold monster",
  "web", "entangle", "fog cloud", "silence", "darkness",
  "fly", "haste", "slow", "polymorph", "greater invisibility",
  "concentration spell",
  "shield of faith", "spirit guardians", "call lightning",
  "conjure animals", "conjure woodland beings", "wall of fire",
  "heat metal", "barkskin", "moonbeam", "plant growth",
  "magic weapon", "levitate", "suggestion", "zone of truth",
  "protection from evil and good", "protection from evil",
  "aid", "invisibility", "spiritual weapon",
]);

// ---------------------------------------------------------------------------
// LOGIC
// ---------------------------------------------------------------------------

function resolveDamage(currentState, rawDamage, damageType = 'untyped', resistances = [], immunities = [], vulnerabilities = [], activeConditions = []) {
  const { currentHp, tempHp = 0, maxHp: _maxHp } = currentState;
  const type = damageType.toLowerCase().trim();

  if (immunities.map(i => i.toLowerCase()).includes(type)) {
    return { newCurrentHp: currentHp, newTempHp: tempHp, damageDealt: 0, absorbed: 0, overkill: 0, modifier: 'immune' };
  }

  const isPetrified = activeConditions.map(c => c.toLowerCase()).includes('petrified');
  const isVulnerable = vulnerabilities.map(v => v.toLowerCase()).includes(type);
  const isResistant = !isPetrified && resistances.map(r => r.toLowerCase()).includes(type);

  let effectiveDamage = rawDamage;
  if (isPetrified || isResistant) {
    effectiveDamage = Math.floor(rawDamage / 2);
  } else if (isVulnerable) {
    effectiveDamage = rawDamage * 2;
  }

  const tempAbsorbed = Math.min(tempHp, effectiveDamage);
  const remainingDamage = effectiveDamage - tempAbsorbed;
  const newTempHp = tempHp - tempAbsorbed;
  const newCurrentHp = Math.max(0, currentHp - remainingDamage);
  const overkill = Math.max(0, remainingDamage - currentHp);

  return {
    newCurrentHp, newTempHp, damageDealt: effectiveDamage, absorbed: tempAbsorbed, overkill,
    modifier: isPetrified || isResistant ? 'resistance' : isVulnerable ? 'vulnerability' : 'normal',
  };
}

function resolveHeal(currentState, amount) {
  const { currentHp, tempHp = 0, maxHp } = currentState;
  const newCurrentHp = Math.min(maxHp, currentHp + amount);
  return { newCurrentHp, newTempHp: tempHp, healed: newCurrentHp - currentHp };
}

function resolveTempHp(currentTempHp, newAmount) {
  const newTempHp = Math.max(currentTempHp, newAmount);
  return { newTempHp, replaced: newAmount > currentTempHp };
}

function resolveDeathSave(current, isSuccess, isCriticalFail = false, isCriticalSuccess = false) {
  let { successes, failures } = current;
  if (isCriticalSuccess) return { successes: 0, failures: 0, stabilized: true, died: false, nat20: true };
  if (isCriticalFail) failures = Math.min(3, failures + 2);
  else if (isSuccess) successes = Math.min(3, successes + 1);
  else failures = Math.min(3, failures + 1);

  const stabilized = successes >= 3;
  const died = failures >= 3;
  if (stabilized || died) return { successes: 0, failures: 0, stabilized, died, nat20: false };
  return { successes, failures, stabilized: false, died: false, nat20: false };
}

function resolveConcentrationChange(currentConcentration, newSpellName, activeBuffs = []) {
  const droppedSpell = currentConcentration;
  const droppedBuffIds = droppedSpell
    ? activeBuffs.filter(b => b.isConcentration && b.name && b.name.toLowerCase() === droppedSpell.toLowerCase()).map(b => b.id)
    : [];
  return { droppedSpell, droppedBuffIds, newConcentration: newSpellName };
}

function isConcentrationSpell(spellName, characterSpells = []) {
  const lower = spellName.toLowerCase().trim();
  const known = characterSpells.find(s => s.name.toLowerCase() === lower);
  if (known !== undefined) return known.isConcentration;
  return KNOWN_CONCENTRATION_SPELLS.has(lower);
}

function resolveConcentrationCheckDC(damageTaken, concentratingOn) {
  if (!concentratingOn || damageTaken === 0) return { required: false, dc: 0 };
  const dc = Math.max(10, Math.floor(damageTaken / 2));
  return { required: true, dc };
}

function resolveFinalAbilityScores(character, allInventory = []) {
  const base = character.abilityScores || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  const final = { ...base };
  const MAP = { 'strength': 'STR', 'dexterity': 'DEX', 'constitution': 'CON', 'intelligence': 'INT', 'wisdom': 'WIS', 'charisma': 'CHA' };

  for (const item of allInventory) {
    if (item.equipped && item.stats && item.stats.statBonuses) {
      for (let [stat, bonus] of Object.entries(item.stats.statBonuses)) {
        let s = stat.toUpperCase();
        if (MAP[stat.toLowerCase()]) s = MAP[stat.toLowerCase()];
        if (final[s] !== undefined) final[s] += bonus;
      }
    }
  }
  return final;
}

function resolveCurrentAC(character, activeBuffs = [], _activeConditions = [], allInventory = []) {
  const scores = resolveFinalAbilityScores(character, allInventory);
  const dexMod = getAbilityModifier(scores.DEX || 10);
  const wisMod = getAbilityModifier(scores.WIS || 10);
  const conMod = getAbilityModifier(scores.CON || 10);

  let baseAC = character.baseAc || 10;
  let acMethod = 'imported';

  // Fix known issue where PDF import LLM sometimes extracts ONLY the dex mod as AC
  if (baseAC === dexMod && baseAC < 10) {
    baseAC = 10 + dexMod;
    acMethod = 'imported-fixed';
  }

  const equippedArmors = allInventory.filter(item => {
    if (!item.equipped) return false;
    const name = (item.name || '').toLowerCase();
    return name.includes('leather') || name.includes('studded') || name.includes('chain') ||
      name.includes('scale') || name.includes('breastplate') || name.includes('half plate') ||
      name.includes('ring mail') || name.includes('plate');
  });

  // Calculate unarmored options
  let unarmoredAC = 10 + dexMod;
  let unarmoredMethod = 'unarmored-default';

  const features = character.features || [];
  const unarmoredDefense = features.find(f => f.name && f.name.toLowerCase().includes('unarmored defense'));

  if (unarmoredDefense) {
    const desc = (unarmoredDefense.description || '').toLowerCase();
    if (desc.includes('constitution')) {
      unarmoredAC = 10 + dexMod + conMod;
      unarmoredMethod = 'unarmored-barbarian';
    } else if (desc.includes('wisdom')) {
      unarmoredAC = 10 + dexMod + wisMod;
      unarmoredMethod = 'unarmored-monk';
    }
  }

  const hasMageArmor = activeBuffs.some(b => b.name?.toLowerCase() === 'mage armor' || b.sourceName?.toLowerCase() === 'mage armor');
  if (hasMageArmor) {
    if (13 + dexMod > unarmoredAC) {
      unarmoredAC = 13 + dexMod;
      unarmoredMethod = 'mage-armor';
    }
  }

  // If no armor is equipped, take the best unarmored AC or the imported AC
  if (equippedArmors.length === 0) {
    if (unarmoredAC > baseAC) {
      baseAC = unarmoredAC;
      acMethod = unarmoredMethod;
    }
  } else {
    // If wearing armor, trust the imported baseAC, but fallback if it's completely wrong
    if (baseAC < 10) {
      baseAC = unarmoredAC;
    }
  }

  let acFlatBonus = 0;
  let acSetOverride = null;
  const breakdown = [{ source: acMethod, value: baseAC }];

  for (const item of allInventory) {
    if (item.equipped && item.stats && item.stats.acBonus) {
      acFlatBonus += item.stats.acBonus;
      breakdown.push({ source: item.name, type: 'gear-bonus', value: item.stats.acBonus });
    }
  }

  for (const buff of activeBuffs) {
    const name = (buff.name || '').toLowerCase();
    const effect = BUFF_EFFECTS[name];
    if (effect && effect.acBonus) {
      acFlatBonus += effect.acBonus;
      breakdown.push({ source: name, type: 'buff', value: effect.acBonus });
    }
    if (buff.modifierType === 'setAC') {
      const setValue = parseInt(buff.modifierValue, 10);
      if (!isNaN(setValue)) {
        acSetOverride = acSetOverride === null ? setValue : Math.max(acSetOverride, setValue);
        breakdown.push({ source: buff.sourceName || buff.name, type: 'setAC', value: setValue });
      }
    } else if (buff.modifierType === 'flatBonus' && (buff.statAffected || '').toLowerCase().includes('ac')) {
      const bonus = parseInt(buff.modifierValue, 10);
      if (!isNaN(bonus)) {
        acFlatBonus += bonus;
        breakdown.push({ source: buff.sourceName || buff.name, type: 'flatBonus', value: bonus });
      }
    }
  }

  const resolvedBase = acSetOverride !== null ? Math.max(baseAC, acSetOverride) : baseAC;
  const finalAC = resolvedBase + acFlatBonus;
  return { finalAC, breakdown, acMethod };
}

function applyCondition(currentConditions, condition) {
  const normalized = condition.toLowerCase().trim();
  if (currentConditions.map(c => c.toLowerCase()).includes(normalized)) return { newConditions: currentConditions, alreadyPresent: true };
  return { newConditions: [...currentConditions, normalized], alreadyPresent: false };
}

function removeCondition(currentConditions, condition) {
  const normalized = condition.toLowerCase().trim();
  const filtered = currentConditions.filter(c => c.toLowerCase() !== normalized);
  return { newConditions: filtered, wasPresent: filtered.length !== currentConditions.length };
}

function resolveConditionModifiers(conditions) {
  const result = { attacksAdvantage: false, attacksDisadvantage: false, attacksAgainstAdvantage: false, attacksAgainstDisadvantage: false, checksDisadvantage: false, speedOverride: null, halveMoveSpeed: false, autoFail: [], savingThrowDisadvantage: [], noActions: false, noReactions: false, resistAll: false };
  for (const condition of conditions) {
    const effects = CONDITION_EFFECTS[condition.toLowerCase()];
    if (!effects) continue;
    if (effects.attacksAdvantage) result.attacksAdvantage = true;
    if (effects.attacksDisadvantage) result.attacksDisadvantage = true;
    if (effects.attacksAgainstAdvantage) result.attacksAgainstAdvantage = true;
    if (effects.attacksAgainstDisadvantage) result.attacksAgainstDisadvantage = true;
    if (effects.checksDisadvantage) result.checksDisadvantage = true;
    if (effects.speedOverride !== undefined) result.speedOverride = result.speedOverride === null ? effects.speedOverride : Math.min(result.speedOverride, effects.speedOverride);
    if (effects.halveMoveSpeed) result.halveMoveSpeed = true;
    if (effects.autoFail) result.autoFail.push(...effects.autoFail);
    if (effects.savingThrowDisadvantage) result.savingThrowDisadvantage.push(...effects.savingThrowDisadvantage);
    if (effects.noActions) result.noActions = true;
    if (effects.noReactions) result.noReactions = true;
    if (effects.resistAll) result.resistAll = true;
  }
  if (result.attacksAdvantage && result.attacksDisadvantage) { result.attacksAdvantage = false; result.attacksDisadvantage = false; result.netAttackRoll = 'straight'; }
  return result;
}

function useSpellSlot(slotsMax, slotsUsed, slotLevel) {
  const max = slotsMax[slotLevel] || 0;
  const used = slotsUsed[slotLevel] || 0;
  if (max - used <= 0) return { newSlotsUsed: slotsUsed, success: false, error: `No level ${slotLevel} spell slots remaining` };
  return { newSlotsUsed: { ...slotsUsed, [slotLevel]: used + 1 }, success: true, error: null };
}

function restoreAllSpellSlots() { return {}; }

function useFeatureCharge(featureUses, featureName, characterFeatures) {
  const feature = characterFeatures.find(f => f.name.toLowerCase() === featureName.toLowerCase());
  if (!feature) return { newFeatureUses: featureUses, success: false, error: `Feature "${featureName}" not found` };
  if (feature.maxUses === null) return { newFeatureUses: featureUses, success: false, error: `"${featureName}" is not a charged resource` };
  const used = featureUses[featureName] || 0;
  if (feature.maxUses - used <= 0) return { newFeatureUses: featureUses, success: false, error: `No uses of "${featureName}" remaining`, remaining: 0 };
  return { newFeatureUses: { ...featureUses, [featureName]: used + 1 }, success: true, error: null, remaining: feature.maxUses - used - 1 };
}

function shortRestFeatures(featureUses, characterFeatures) {
  const newUses = { ...featureUses };
  for (const f of characterFeatures) { if (f.resourceType === 'shortRest') delete newUses[f.name]; }
  return newUses;
}

function longRestFeatures() { return {}; }
function getAbilityModifier(score) { return Math.floor((score - 10) / 2); }
function formatModifier(score) { const mod = getAbilityModifier(score); return mod >= 0 ? `+${mod}` : `${mod}`; }

module.exports = {
  resolveDamage, resolveHeal, resolveTempHp, resolveDeathSave,
  resolveConcentrationChange, isConcentrationSpell, resolveConcentrationCheckDC,
  resolveCurrentAC, resolveFinalAbilityScores,
  applyCondition, removeCondition, resolveConditionModifiers, CONDITION_EFFECTS, BUFF_EFFECTS,
  useSpellSlot, restoreAllSpellSlots,
  useFeatureCharge, shortRestFeatures, longRestFeatures,
  getAbilityModifier, formatModifier, DAMAGE_TYPES,
};
