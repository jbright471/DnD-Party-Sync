// tests/rulesEngine.test.js
//
// Pure unit tests for the rules engine.
// No database, no Express, no Socket.io — just the math.
// Run with: node tests/rulesEngine.test.js

'use strict';

const {
  resolveDamage,
  resolveHeal,
  resolveTempHp,
  resolveDeathSave,
  resolveConcentrationChange,
  resolveConcentrationCheckDC,
  resolveCurrentAC,
  applyCondition,
  removeCondition,
  resolveConditionModifiers,
  useSpellSlot,
  getAbilityModifier,
} = require('../lib/rulesEngine');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, label = '') {
  if (actual !== expected) {
    throw new Error(`${label} Expected ${expected}, got ${actual}`);
  }
}

// ---------------------------------------------------------------------------
console.log('\n=== ABILITY MODIFIERS ===');
// ---------------------------------------------------------------------------
test('Score 10 → modifier 0', () => assertEqual(getAbilityModifier(10), 0));
test('Score 18 → modifier +4', () => assertEqual(getAbilityModifier(18), 4));
test('Score 9 → modifier -1', () => assertEqual(getAbilityModifier(9), -1));
test('Score 1 → modifier -5', () => assertEqual(getAbilityModifier(1), -5));
test('Score 20 → modifier +5', () => assertEqual(getAbilityModifier(20), 5));

// ---------------------------------------------------------------------------
console.log('\n=== DAMAGE RESOLUTION ===');
// ---------------------------------------------------------------------------

test('Normal damage reduces HP correctly', () => {
  const state = { currentHp: 68, tempHp: 0, maxHp: 68 };
  const result = resolveDamage(state, 15, 'piercing');
  assertEqual(result.newCurrentHp, 53);
  assertEqual(result.newTempHp, 0);
  assertEqual(result.damageDealt, 15);
  assertEqual(result.modifier, 'normal');
});

test('Temp HP absorbs damage first', () => {
  const state = { currentHp: 40, tempHp: 10, maxHp: 68 };
  const result = resolveDamage(state, 15, 'fire');
  // 10 temp absorbed, 5 goes to real HP
  assertEqual(result.newTempHp, 0);
  assertEqual(result.newCurrentHp, 35);
  assertEqual(result.absorbed, 10);
  assertEqual(result.damageDealt, 15);
});

test('Temp HP fully absorbs damage if enough', () => {
  const state = { currentHp: 40, tempHp: 20, maxHp: 68 };
  const result = resolveDamage(state, 15, 'cold');
  assertEqual(result.newTempHp, 5);
  assertEqual(result.newCurrentHp, 40); // HP unchanged
  assertEqual(result.absorbed, 15);
});

test('Resistance halves damage (round down)', () => {
  const state = { currentHp: 68, tempHp: 0, maxHp: 68 };
  const result = resolveDamage(state, 15, 'fire', ['fire']);
  assertEqual(result.damageDealt, 7); // floor(15/2)
  assertEqual(result.newCurrentHp, 61);
  assertEqual(result.modifier, 'resistance');
});

test('Immunity reduces damage to 0', () => {
  const state = { currentHp: 68, tempHp: 0, maxHp: 68 };
  const result = resolveDamage(state, 20, 'poison', [], ['poison']);
  assertEqual(result.damageDealt, 0);
  assertEqual(result.newCurrentHp, 68);
  assertEqual(result.modifier, 'immune');
});

test('Vulnerability doubles damage', () => {
  const state = { currentHp: 68, tempHp: 0, maxHp: 68 };
  const result = resolveDamage(state, 10, 'fire', [], [], ['fire']);
  assertEqual(result.damageDealt, 20);
  assertEqual(result.newCurrentHp, 48);
  assertEqual(result.modifier, 'vulnerability');
});

test('HP cannot go below 0', () => {
  const state = { currentHp: 5, tempHp: 0, maxHp: 68 };
  const result = resolveDamage(state, 100, 'slashing');
  assertEqual(result.newCurrentHp, 0);
  assertEqual(result.overkill, 95);
});

test('Petrified condition grants resistance to all damage', () => {
  const state = { currentHp: 68, tempHp: 0, maxHp: 68 };
  const result = resolveDamage(state, 20, 'slashing', [], [], [], ['petrified']);
  assertEqual(result.damageDealt, 10); // halved
  assertEqual(result.modifier, 'resistance');
});

// ---------------------------------------------------------------------------
console.log('\n=== HEALING ===');
// ---------------------------------------------------------------------------

test('Healing increases HP', () => {
  const state = { currentHp: 30, tempHp: 0, maxHp: 68 };
  const result = resolveHeal(state, 20);
  assertEqual(result.newCurrentHp, 50);
  assertEqual(result.healed, 20);
});

test('Healing cannot exceed max HP', () => {
  const state = { currentHp: 60, tempHp: 0, maxHp: 68 };
  const result = resolveHeal(state, 20);
  assertEqual(result.newCurrentHp, 68);
  assertEqual(result.healed, 8); // only healed 8, not 20
});

test('Healing does not affect temp HP', () => {
  const state = { currentHp: 30, tempHp: 5, maxHp: 68 };
  const result = resolveHeal(state, 10);
  assertEqual(result.newTempHp, 5); // unchanged
});

// ---------------------------------------------------------------------------
console.log('\n=== TEMP HP ===');
// ---------------------------------------------------------------------------

test('Setting temp HP replaces lower value', () => {
  const result = resolveTempHp(5, 12);
  assertEqual(result.newTempHp, 12);
  assertEqual(result.replaced, true);
});

test('Setting temp HP does not replace higher value', () => {
  const result = resolveTempHp(12, 5);
  assertEqual(result.newTempHp, 12);
  assertEqual(result.replaced, false);
});

// ---------------------------------------------------------------------------
console.log('\n=== DEATH SAVES ===');
// ---------------------------------------------------------------------------

test('Three successes = stabilized', () => {
  const result1 = resolveDeathSave({ successes: 2, failures: 0 }, true);
  assertEqual(result1.stabilized, true);
  assertEqual(result1.died, false);
  assertEqual(result1.successes, 0); // reset
});

test('Three failures = dead', () => {
  const result = resolveDeathSave({ successes: 0, failures: 2 }, false);
  assertEqual(result.died, true);
  assertEqual(result.stabilized, false);
});

test('Nat 1 adds 2 failures', () => {
  const result = resolveDeathSave({ successes: 0, failures: 0 }, false, true);
  assertEqual(result.failures, 2);
});

test('Nat 20 = immediate stabilize (nat20: true)', () => {
  const result = resolveDeathSave({ successes: 0, failures: 2 }, true, false, true);
  assertEqual(result.nat20, true);
  assertEqual(result.stabilized, true);
});

// ---------------------------------------------------------------------------
console.log('\n=== CONCENTRATION ===');
// ---------------------------------------------------------------------------

test('Casting new conc spell drops old one', () => {
  const buffs = [
    { id: 'buff-1', sourceName: "Hunter's Mark", isConcentration: true },
    { id: 'buff-2', sourceName: 'Bless', isConcentration: false }, // not conc
  ];
  const result = resolveConcentrationChange("Hunter's Mark", 'Hex', buffs);
  assertEqual(result.droppedSpell, "Hunter's Mark");
  assertEqual(result.droppedBuffIds.length, 1);
  assertEqual(result.droppedBuffIds[0], 'buff-1');
  assertEqual(result.newConcentration, 'Hex');
});

test('Casting conc when none active — droppedSpell is null', () => {
  const result = resolveConcentrationChange(null, 'Bless', []);
  assertEqual(result.droppedSpell, null);
  assertEqual(result.droppedBuffIds.length, 0);
});

test('Conc check DC = max(10, half damage)', () => {
  const check1 = resolveConcentrationCheckDC(14, "Hunter's Mark");
  assertEqual(check1.dc, 10); // floor(14/2) = 7, but max is 10

  const check2 = resolveConcentrationCheckDC(30, "Hunter's Mark");
  assertEqual(check2.dc, 15); // floor(30/2) = 15

  const check3 = resolveConcentrationCheckDC(0, "Hunter's Mark");
  assertEqual(check3.required, false);
});

test('Conc check not required if not concentrating', () => {
  const check = resolveConcentrationCheckDC(20, null);
  assertEqual(check.required, false);
});

// ---------------------------------------------------------------------------
console.log('\n=== AC RESOLUTION ===');
// ---------------------------------------------------------------------------

test('Base AC from character data', () => {
  const char = {
    baseAc: 16,
    abilityScores: { DEX: 18, CON: 14, WIS: 17 },
    features: [],
    inventory: [{ name: 'Studded Leather', quantity: 1, isAttuned: false }],
  };
  const result = resolveCurrentAC(char, [], []);
  assertEqual(result.finalAC, 16);
});

test('Shield of Faith adds +2 AC', () => {
  const char = {
    baseAc: 16,
    abilityScores: { DEX: 18, CON: 14, WIS: 17 },
    features: [],
    inventory: [{ name: 'Studded Leather', quantity: 1 }],
  };
  const buffs = [{
    id: 'buff-shield',
    sourceName: 'Shield of Faith',
    statAffected: 'AC',
    modifierType: 'flatBonus',
    modifierValue: '2',
    isConcentration: true,
  }];
  const result = resolveCurrentAC(char, buffs, []);
  assertEqual(result.finalAC, 18);
});

test('Mage Armor: 13 + DEX mod when unarmored', () => {
  const char = {
    baseAc: 10, // unarmored default
    abilityScores: { DEX: 16, CON: 12, WIS: 10 }, // DEX mod = +3
    features: [],
    inventory: [], // no armor
  };
  const buffs = [{
    id: 'buff-mage',
    sourceName: 'Mage Armor',
    statAffected: 'AC',
    modifierType: 'flatBonus',
    modifierValue: '0',
    isConcentration: false,
  }];
  // Mage armor is handled specially in resolveCurrentAC: 13 + DEX
  const result = resolveCurrentAC(char, buffs, []);
  // Note: Mage Armor sets base to 13 + DEXmod(3) = 16
  assertEqual(result.finalAC, 16);
});

// ---------------------------------------------------------------------------
console.log('\n=== CONDITIONS ===');
// ---------------------------------------------------------------------------

test('applyCondition adds new condition', () => {
  const result = applyCondition(['poisoned'], 'prone');
  assert(result.newConditions.includes('prone'));
  assertEqual(result.alreadyPresent, false);
});

test('applyCondition does not duplicate', () => {
  const result = applyCondition(['prone', 'poisoned'], 'prone');
  assertEqual(result.alreadyPresent, true);
  assertEqual(result.newConditions.length, 2); // unchanged
});

test('removeCondition removes correctly', () => {
  const result = removeCondition(['prone', 'poisoned', 'blinded'], 'poisoned');
  assert(!result.newConditions.includes('poisoned'));
  assertEqual(result.wasPresent, true);
});

test('Condition modifiers: prone gives attack disadvantage', () => {
  const mods = resolveConditionModifiers(['prone']);
  assertEqual(mods.attacksDisadvantage, true);
  assertEqual(mods.halveMoveSpeed, true);
});

test('Condition modifiers: advantage and disadvantage cancel out', () => {
  // Blinded (attacks have disadvantage) + Invisible (attacks have advantage)
  const mods = resolveConditionModifiers(['blinded', 'invisible']);
  assertEqual(mods.attacksAdvantage, false);
  assertEqual(mods.attacksDisadvantage, false);
  assertEqual(mods.netAttackRoll, 'straight');
});

// ---------------------------------------------------------------------------
console.log('\n=== SPELL SLOTS ===');
// ---------------------------------------------------------------------------

test('Using a slot increments used count', () => {
  const slotsMax = { 1: 4, 2: 2 };
  const slotsUsed = { 1: 1 };
  const result = useSpellSlot(slotsMax, slotsUsed, 1);
  assertEqual(result.success, true);
  assertEqual(result.newSlotsUsed[1], 2);
});

test('Using a slot when none remain returns error', () => {
  const slotsMax = { 1: 2 };
  const slotsUsed = { 1: 2 };
  const result = useSpellSlot(slotsMax, slotsUsed, 1);
  assertEqual(result.success, false);
  assert(result.error.includes('No level 1'));
});

test('Using a slot level with no max = error', () => {
  const result = useSpellSlot({ 1: 2 }, {}, 3);
  assertEqual(result.success, false);
});

// ---------------------------------------------------------------------------
console.log('\n=== SUMMARY ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed! ✅\n');
}
