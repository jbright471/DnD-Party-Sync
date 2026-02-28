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

// 5e damage types that can have resistance/immunity/vulnerability
const DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning',
  'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing',
  'thunder',
  // Special: "magical bludgeoning/piercing/slashing" treated separately
  'magical bludgeoning', 'magical piercing', 'magical slashing',
];

// All 5e conditions and their mechanical effects on derived stats
// Used by resolveConditionModifiers()
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
    // Exhaustion is tracked as a level (1-6) not a boolean
    // Effects applied per level by resolveExhaustionPenalties()
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

// All spells that require concentration — used to enforce the concentration rule
// This is not exhaustive but covers the most common ones.
// The definitive source is the `isConcentration` flag on the Character's spells array.
const KNOWN_CONCENTRATION_SPELLS = new Set([
  "bless", "bane", "faerie fire", "hunters mark", "hunter's mark",
  "hex", "hypnotic pattern", "hold person", "hold monster",
  "web", "entangle", "fog cloud", "silence", "darkness",
  "fly", "haste", "slow", "polymorph", "greater invisibility",
  "concentration spell", // generic fallback
  "shield of faith", "spirit guardians", "call lightning",
  "conjure animals", "conjure woodland beings", "wall of fire",
  "heat metal", "barkskin", "moonbeam", "plant growth",
  "magic weapon", "levitate", "suggestion", "zone of truth",
  "protection from evil and good", "protection from evil",
  "aid", "invisibility", "spiritual weapon",
]);

// ---------------------------------------------------------------------------
// HP RESOLUTION
// ---------------------------------------------------------------------------

/**
 * Resolves a damage event against a character's current HP and temp HP.
 * Returns the new HP values — does NOT write to DB.
 *
 * @param {object} currentState - { currentHp, tempHp, maxHp }
 * @param {number} rawDamage - The raw damage amount (positive integer)
 * @param {string} damageType - e.g. 'fire', 'piercing'
 * @param {string[]} resistances - damage types character resists
 * @param {string[]} immunities - damage types character is immune to
 * @param {string[]} vulnerabilities - damage types character is vulnerable to
 * @param {string[]} activeConditions - current conditions (checks for 'petrified')
 * @returns {{ newCurrentHp, newTempHp, damageDealt, absorbed, overkill }}
 */
function resolveDamage(
  currentState,
  rawDamage,
  damageType = 'untyped',
  resistances = [],
  immunities = [],
  vulnerabilities = [],
  activeConditions = []
) {
  const { currentHp, tempHp = 0, maxHp } = currentState;
  const type = damageType.toLowerCase().trim();

  // --- Step 1: Immunity check (damage reduced to 0) ---
  if (immunities.map(i => i.toLowerCase()).includes(type)) {
    return {
      newCurrentHp: currentHp,
      newTempHp: tempHp,
      damageDealt: 0,
      absorbed: 0,
      overkill: 0,
      modifier: 'immune',
    };
  }

  // --- Step 2: Petrified condition grants resistance to all damage ---
  const isPetrified = activeConditions.map(c => c.toLowerCase()).includes('petrified');

  // --- Step 3: Vulnerability check (damage doubled) ---
  const isVulnerable = vulnerabilities.map(v => v.toLowerCase()).includes(type);

  // --- Step 4: Resistance check (damage halved, round down) ---
  // Note: resistance and vulnerability cancel each other out per 5e rules
  const isResistant =
    !isPetrified &&
    resistances.map(r => r.toLowerCase()).includes(type);

  let effectiveDamage = rawDamage;

  if (isPetrified || isResistant) {
    effectiveDamage = Math.floor(rawDamage / 2);
  } else if (isVulnerable) {
    effectiveDamage = rawDamage * 2;
  }

  // --- Step 5: Temp HP absorbs damage first ---
  // Temp HP cannot be healed, only reduced or replaced
  const tempAbsorbed = Math.min(tempHp, effectiveDamage);
  const remainingDamage = effectiveDamage - tempAbsorbed;
  const newTempHp = tempHp - tempAbsorbed;

  // --- Step 6: Apply remaining damage to current HP ---
  const newCurrentHp = Math.max(0, currentHp - remainingDamage);
  const overkill = Math.max(0, remainingDamage - currentHp);

  return {
    newCurrentHp,
    newTempHp,
    damageDealt: effectiveDamage,
    absorbed: tempAbsorbed,
    overkill,
    modifier: isPetrified || isResistant ? 'resistance' : isVulnerable ? 'vulnerability' : 'normal',
  };
}

/**
 * Resolves a heal event. Healing cannot exceed max HP and does NOT restore temp HP.
 *
 * @param {object} currentState - { currentHp, tempHp, maxHp }
 * @param {number} amount - raw healing amount
 * @returns {{ newCurrentHp, newTempHp, healed }}
 */
function resolveHeal(currentState, amount) {
  const { currentHp, tempHp = 0, maxHp } = currentState;
  const newCurrentHp = Math.min(maxHp, currentHp + amount);
  return {
    newCurrentHp,
    newTempHp: tempHp, // healing never modifies temp HP
    healed: newCurrentHp - currentHp,
  };
}

/**
 * Resolves setting temp HP. Per 5e rules, temp HP does not stack —
 * only the higher value applies.
 *
 * @param {number} currentTempHp
 * @param {number} newAmount
 * @returns {{ newTempHp, replaced }}
 */
function resolveTempHp(currentTempHp, newAmount) {
  const newTempHp = Math.max(currentTempHp, newAmount);
  return {
    newTempHp,
    replaced: newAmount > currentTempHp,
  };
}

// ---------------------------------------------------------------------------
// DEATH SAVING THROWS
// ---------------------------------------------------------------------------

/**
 * Resolves a death saving throw result.
 * Returns the new death save state and whether the character stabilized or died.
 *
 * @param {{ successes: number, failures: number }} current
 * @param {boolean} isSuccess
 * @param {boolean} isCriticalFail - nat 1 adds 2 failures
 * @param {boolean} isCriticalSuccess - nat 20 sets HP to 1 (handled separately)
 * @returns {{ successes, failures, stabilized, died, nat20 }}
 */
function resolveDeathSave(current, isSuccess, isCriticalFail = false, isCriticalSuccess = false) {
  let { successes, failures } = current;

  if (isCriticalSuccess) {
    // Nat 20: character regains 1 HP (caller must apply this to HP)
    return { successes: 0, failures: 0, stabilized: true, died: false, nat20: true };
  }

  if (isCriticalFail) {
    failures = Math.min(3, failures + 2);
  } else if (isSuccess) {
    successes = Math.min(3, successes + 1);
  } else {
    failures = Math.min(3, failures + 1);
  }

  const stabilized = successes >= 3;
  const died = failures >= 3;

  // Reset counters if stabilized or dead
  if (stabilized || died) {
    return { successes: 0, failures: 0, stabilized, died, nat20: false };
  }

  return { successes, failures, stabilized: false, died: false, nat20: false };
}

// ---------------------------------------------------------------------------
// CONCENTRATION ENFORCEMENT
// ---------------------------------------------------------------------------

/**
 * Determines what happens when a character casts a new concentration spell.
 * Returns the spells to remove (the old one) and what to set as the new focus.
 *
 * @param {string|null} currentConcentration - current spell name or null
 * @param {string} newSpellName - the new spell being cast
 * @param {object[]} activeBuffs - current active buffs array
 * @returns {{ droppedSpell, droppedBuffIds, newConcentration }}
 */
function resolveConcentrationChange(currentConcentration, newSpellName, activeBuffs = []) {
  const droppedSpell = currentConcentration;

  // Find all buffs that were sourced from the dropped concentration spell
  const droppedBuffIds = droppedSpell
    ? activeBuffs
        .filter(
          b =>
            b.isConcentration &&
            b.sourceName &&
            b.sourceName.toLowerCase() === droppedSpell.toLowerCase()
        )
        .map(b => b.id)
    : [];

  return {
    droppedSpell,       // the spell that was dropped (null if none was active)
    droppedBuffIds,     // buff IDs to remove from session state
    newConcentration: newSpellName,
  };
}

/**
 * Check whether a spell requires concentration.
 * Uses the character's known spells first, falls back to the known list.
 *
 * @param {string} spellName
 * @param {object[]} characterSpells - spells array from Character object
 * @returns {boolean}
 */
function isConcentrationSpell(spellName, characterSpells = []) {
  const lower = spellName.toLowerCase().trim();

  // Check character's own spell list first (most authoritative)
  const known = characterSpells.find(s => s.name.toLowerCase() === lower);
  if (known !== undefined) return known.isConcentration;

  // Fall back to known concentration spells list
  return KNOWN_CONCENTRATION_SPELLS.has(lower);
}

/**
 * Checks if a concentration check is required after taking damage,
 * and returns the DC (10 or half damage, whichever is higher).
 *
 * @param {number} damageTaken - damage after resistances/temp HP
 * @param {string|null} concentratingOn
 * @returns {{ required: boolean, dc: number }}
 */
function resolveConcentrationCheckDC(damageTaken, concentratingOn) {
  if (!concentratingOn || damageTaken === 0) {
    return { required: false, dc: 0 };
  }
  const dc = Math.max(10, Math.floor(damageTaken / 2));
  return { required: true, dc };
}

// ---------------------------------------------------------------------------
// AC RESOLUTION
// ---------------------------------------------------------------------------

/**
 * Resolves the final AC for a character from base + equipment + active buffs.
 * Handles all 5e AC calculation methods.
 *
 * @param {object} character - Character object from DB (parsed data_json)
 * @param {object[]} activeBuffs - ActiveBuff[] from session state
 * @param {string[]} activeConditions - current condition names
 * @returns {{ finalAC, breakdown }}
 */
function resolveCurrentAC(character, activeBuffs = [], activeConditions = []) {
  const scores = character.abilityScores || {};
  const dexMod = getAbilityModifier(scores.DEX || 10);
  const wisMod = getAbilityModifier(scores.WIS || 10);
  const conMod = getAbilityModifier(scores.CON || 10);

  // --- Step 1: Determine base AC from equipped armor ---
  // Start from the stored baseAc (extracted from DDB PDF)
  let baseAC = character.baseAc || 10;
  let acMethod = 'base';

  // Check for specific items in inventory that override AC calculation
  const equippedArmors = (character.inventory || []).filter(item => {
    const name = (item.name || '').toLowerCase();
    // Common armors — extend this list as needed
    return (
      name.includes('leather') ||
      name.includes('studded') ||
      name.includes('chain') ||
      name.includes('scale') ||
      name.includes('breastplate') ||
      name.includes('half plate') ||
      name.includes('ring mail') ||
      name.includes('plate')
    );
  });

  // Special cases: Unarmored Defense (Barbarian/Monk/etc)
  // These are encoded as features; check for them
  const features = character.features || [];
  const unarmoredDefense = features.find(
    f => f.name && f.name.toLowerCase().includes('unarmored defense')
  );

  if (unarmoredDefense && equippedArmors.length === 0) {
    const desc = (unarmoredDefense.description || '').toLowerCase();
    if (desc.includes('constitution')) {
      // Barbarian: 10 + DEX + CON
      baseAC = 10 + dexMod + conMod;
      acMethod = 'unarmored-barbarian';
    } else if (desc.includes('wisdom')) {
      // Monk: 10 + DEX + WIS
      baseAC = 10 + dexMod + wisMod;
      acMethod = 'unarmored-monk';
    }
  }

  // Mage Armor: sets base AC to 13 + DEX if not wearing armor
  const hasMageArmor = activeBuffs.some(
    b => b.sourceName && b.sourceName.toLowerCase() === 'mage armor'
  );
  if (hasMageArmor && equippedArmors.length === 0) {
    baseAC = 13 + dexMod;
    acMethod = 'mage-armor';
  }

  // --- Step 2: Collect AC modifiers from buffs ---
  let acFlatBonus = 0;
  let acSetOverride = null; // e.g. "set AC to 18"
  const breakdown = [{ source: acMethod, value: baseAC }];

  for (const buff of activeBuffs) {
    if (!buff.statAffected || !buff.statAffected.toLowerCase().includes('ac')) continue;

    if (buff.modifierType === 'setAC') {
      // setAC takes the highest (e.g. Shield of Faith can't lower your existing AC)
      const setValue = parseInt(buff.modifierValue, 10);
      if (!isNaN(setValue)) {
        acSetOverride = acSetOverride === null ? setValue : Math.max(acSetOverride, setValue);
        breakdown.push({ source: buff.sourceName, type: 'setAC', value: setValue });
      }
    } else if (buff.modifierType === 'flatBonus') {
      const bonus = parseInt(buff.modifierValue, 10);
      if (!isNaN(bonus)) {
        acFlatBonus += bonus;
        breakdown.push({ source: buff.sourceName, type: 'flatBonus', value: bonus });
      }
    }
  }

  // Shield spell: +5 AC as a reaction, tracked as a buff
  // (already handled via flatBonus buffs — no special case needed)

  // --- Step 3: Condition modifiers ---
  // No conditions directly modify AC in 5e, but prone/restrained
  // affect attacks against the character (handled in attack resolution, not AC)

  // --- Step 4: Resolve final AC ---
  // If a setAC override exists, use it as the new base before adding flat bonuses
  const resolvedBase = acSetOverride !== null ? Math.max(baseAC, acSetOverride) : baseAC;
  const finalAC = resolvedBase + acFlatBonus;

  return {
    finalAC,
    breakdown,
    acMethod,
  };
}

// ---------------------------------------------------------------------------
// CONDITION MANAGEMENT
// ---------------------------------------------------------------------------

/**
 * Adds a condition to a character's condition list.
 * Handles duplicates (a condition can only be applied once).
 *
 * @param {string[]} currentConditions
 * @param {string} condition
 * @returns {{ newConditions, alreadyPresent }}
 */
function applyCondition(currentConditions, condition) {
  const normalized = condition.toLowerCase().trim();
  if (currentConditions.map(c => c.toLowerCase()).includes(normalized)) {
    return { newConditions: currentConditions, alreadyPresent: true };
  }
  return {
    newConditions: [...currentConditions, normalized],
    alreadyPresent: false,
  };
}

/**
 * Removes a condition from the list.
 *
 * @param {string[]} currentConditions
 * @param {string} condition
 * @returns {{ newConditions, wasPresent }}
 */
function removeCondition(currentConditions, condition) {
  const normalized = condition.toLowerCase().trim();
  const filtered = currentConditions.filter(c => c.toLowerCase() !== normalized);
  return {
    newConditions: filtered,
    wasPresent: filtered.length !== currentConditions.length,
  };
}

/**
 * Returns the mechanical effects of all current conditions combined.
 * Used by the frontend to show icons and by the GM to know what applies.
 *
 * @param {string[]} conditions
 * @returns {object} merged effects object
 */
function resolveConditionModifiers(conditions) {
  const result = {
    attacksAdvantage: false,
    attacksDisadvantage: false,
    attacksAgainstAdvantage: false,
    attacksAgainstDisadvantage: false,
    checksDisadvantage: false,
    speedOverride: null,
    halveMoveSpeed: false,
    autoFail: [],
    savingThrowDisadvantage: [],
    noActions: false,
    noReactions: false,
    resistAll: false,
  };

  for (const condition of conditions) {
    const effects = CONDITION_EFFECTS[condition.toLowerCase()];
    if (!effects) continue;

    if (effects.attacksAdvantage) result.attacksAdvantage = true;
    if (effects.attacksDisadvantage) result.attacksDisadvantage = true;
    if (effects.attacksAgainstAdvantage) result.attacksAgainstAdvantage = true;
    if (effects.attacksAgainstDisadvantage) result.attacksAgainstDisadvantage = true;
    if (effects.checksDisadvantage) result.checksDisadvantage = true;
    if (effects.speedOverride !== undefined) {
      // Take the lowest speed override
      result.speedOverride =
        result.speedOverride === null
          ? effects.speedOverride
          : Math.min(result.speedOverride, effects.speedOverride);
    }
    if (effects.halveMoveSpeed) result.halveMoveSpeed = true;
    if (effects.autoFail) result.autoFail.push(...effects.autoFail);
    if (effects.savingThrowDisadvantage) result.savingThrowDisadvantage.push(...effects.savingThrowDisadvantage);
    if (effects.noActions) result.noActions = true;
    if (effects.noReactions) result.noReactions = true;
    if (effects.resistAll) result.resistAll = true;
  }

  // Advantage and disadvantage cancel out in 5e
  if (result.attacksAdvantage && result.attacksDisadvantage) {
    result.attacksAdvantage = false;
    result.attacksDisadvantage = false;
    result.netAttackRoll = 'straight';
  }

  return result;
}

// ---------------------------------------------------------------------------
// SPELL SLOT MANAGEMENT
// ---------------------------------------------------------------------------

/**
 * Uses a spell slot. Returns the updated slots used map.
 * Validates that the slot is available.
 *
 * @param {object} slotsMax - Record<level, maxCount> from Character
 * @param {object} slotsUsed - Record<level, usedCount> from SessionState
 * @param {number} slotLevel
 * @returns {{ newSlotsUsed, success, error }}
 */
function useSpellSlot(slotsMax, slotsUsed, slotLevel) {
  const max = slotsMax[slotLevel] || 0;
  const used = slotsUsed[slotLevel] || 0;
  const remaining = max - used;

  if (remaining <= 0) {
    return {
      newSlotsUsed: slotsUsed,
      success: false,
      error: `No level ${slotLevel} spell slots remaining (${used}/${max} used)`,
    };
  }

  return {
    newSlotsUsed: { ...slotsUsed, [slotLevel]: used + 1 },
    success: true,
    error: null,
  };
}

/**
 * Restores all spell slots (long rest).
 * @returns {object} empty slotsUsed record
 */
function restoreAllSpellSlots() {
  return {};
}

// ---------------------------------------------------------------------------
// FEATURE RESOURCE MANAGEMENT
// ---------------------------------------------------------------------------

/**
 * Uses a charge of a limited-use feature.
 *
 * @param {object} featureUses - Record<name, usedCount>
 * @param {string} featureName
 * @param {object[]} characterFeatures - features array from Character
 * @returns {{ newFeatureUses, success, error, remaining }}
 */
function useFeatureCharge(featureUses, featureName, characterFeatures) {
  const feature = characterFeatures.find(
    f => f.name.toLowerCase() === featureName.toLowerCase()
  );

  if (!feature) {
    return { newFeatureUses: featureUses, success: false, error: `Feature "${featureName}" not found` };
  }

  if (feature.maxUses === null || feature.maxUses === undefined) {
    // Toggle feature — no charge to use
    return { newFeatureUses: featureUses, success: false, error: `"${featureName}" is a toggle, not a charged resource` };
  }

  const used = featureUses[featureName] || 0;
  const remaining = feature.maxUses - used;

  if (remaining <= 0) {
    return {
      newFeatureUses: featureUses,
      success: false,
      error: `No uses of "${featureName}" remaining (${used}/${feature.maxUses})`,
      remaining: 0,
    };
  }

  return {
    newFeatureUses: { ...featureUses, [featureName]: used + 1 },
    success: true,
    error: null,
    remaining: remaining - 1,
  };
}

/**
 * Restores feature uses on a short rest (recharges shortRest features).
 * @param {object} featureUses
 * @param {object[]} characterFeatures
 * @returns {object} newFeatureUses
 */
function shortRestFeatures(featureUses, characterFeatures) {
  const newUses = { ...featureUses };
  for (const feature of characterFeatures) {
    if (feature.resourceType === 'shortRest') {
      delete newUses[feature.name]; // reset to 0 used
    }
  }
  return newUses;
}

/**
 * Restores all feature uses on a long rest.
 * @returns {object} empty featureUses record
 */
function longRestFeatures() {
  return {};
}

// ---------------------------------------------------------------------------
// UTILITY: ABILITY MODIFIERS
// ---------------------------------------------------------------------------

/**
 * Standard 5e ability score modifier formula.
 * @param {number} score
 * @returns {number}
 */
function getAbilityModifier(score) {
  return Math.floor((score - 10) / 2);
}

/**
 * Returns a formatted string like "+3" or "-1".
 * @param {number} score
 * @returns {string}
 */
function formatModifier(score) {
  const mod = getAbilityModifier(score);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  // HP
  resolveDamage,
  resolveHeal,
  resolveTempHp,
  resolveDeathSave,

  // Concentration
  resolveConcentrationChange,
  isConcentrationSpell,
  resolveConcentrationCheckDC,

  // AC
  resolveCurrentAC,

  // Conditions
  applyCondition,
  removeCondition,
  resolveConditionModifiers,
  CONDITION_EFFECTS,

  // Spell slots
  useSpellSlot,
  restoreAllSpellSlots,

  // Feature resources
  useFeatureCharge,
  shortRestFeatures,
  longRestFeatures,

  // Utility
  getAbilityModifier,
  formatModifier,
  DAMAGE_TYPES,
};
