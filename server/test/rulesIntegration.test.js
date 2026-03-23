'use strict';

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, insertCharacter } from './helpers/testDb.js';
import {
  applyDamageEvent,
  applyHealEvent,
  setTempHpEvent,
  castConcentrationSpellEvent,
  applyConditionEvent,
  applyBuffEvent,
  useSpellSlotEvent,
  longRestEvent,
  getSessionState,
  getResolvedCharacterState,
} from '../lib/rulesIntegration.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Return the live session state for a character. */
function state(db, id) {
  return getSessionState(db, id);
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('rulesIntegration', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  // ── 1. Basic damage reduces current HP ────────────────────────────────────
  it('applyDamageEvent reduces current_hp in session_states', () => {
    const id = insertCharacter(db, { max_hp: 40, current_hp: 40 });

    const result = applyDamageEvent(db, id, 10, 'slashing');

    expect(result.success).toBe(true);
    expect(result.newHp).toBe(30);
    expect(state(db, id).currentHp).toBe(30);
  });

  // ── 2. Damage with resistance halves the amount ────────────────────────────
  it('applyDamageEvent halves damage when character has resistance', () => {
    const id = insertCharacter(db, {
      max_hp: 40,
      current_hp: 40,
      resistances: ['fire'],
    });

    const result = applyDamageEvent(db, id, 20, 'fire');

    expect(result.success).toBe(true);
    expect(result.damageDealt).toBe(10);    // halved
    expect(result.modifier).toBe('resistance');
    expect(state(db, id).currentHp).toBe(30);
  });

  // ── 3. Damage with immunity deals 0 ───────────────────────────────────────
  it('applyDamageEvent deals 0 damage when character is immune', () => {
    const id = insertCharacter(db, {
      max_hp: 30,
      current_hp: 30,
      immunities: ['poison'],
    });

    const result = applyDamageEvent(db, id, 15, 'poison');

    expect(result.success).toBe(true);
    expect(result.damageDealt).toBe(0);
    expect(result.modifier).toBe('immune');
    expect(state(db, id).currentHp).toBe(30);   // unchanged
  });

  // ── 4. Heal cannot exceed maxHp ────────────────────────────────────────────
  it('applyHealEvent clamps at maxHp', () => {
    const id = insertCharacter(db, { max_hp: 30, current_hp: 25 });

    const result = applyHealEvent(db, id, 20);  // would overheal to 45

    expect(result.success).toBe(true);
    expect(result.newHp).toBe(30);              // clamped
    expect(result.healed).toBe(5);              // only 5 actually restored
    expect(state(db, id).currentHp).toBe(30);
  });

  // ── 5. Damage on concentrating character returns concentration check data ──
  it('applyDamageEvent signals a concentration check when caster is hit', () => {
    const id = insertCharacter(db, { max_hp: 40, current_hp: 40 });

    // Start concentrating on a spell first
    castConcentrationSpellEvent(db, id, 'Hold Person');
    expect(state(db, id).concentratingOn).toBe('Hold Person');

    const result = applyDamageEvent(db, id, 14, 'bludgeoning');

    expect(result.success).toBe(true);
    expect(result.concentrationCheck).not.toBeNull();
    expect(result.concentrationCheck.dc).toBe(10); // max(10, 14/2) = 10
    // Concentration is NOT auto-dropped here — the server handles the roll
    expect(state(db, id).concentratingOn).toBe('Hold Person');
  });

  // ── 6. castConcentrationSpellEvent drops previous concentration spell ──────
  it('casting a new concentration spell drops the previous one', () => {
    const id = insertCharacter(db, { max_hp: 40, current_hp: 40 });

    castConcentrationSpellEvent(db, id, 'Bless');
    expect(state(db, id).concentratingOn).toBe('Bless');

    const result = castConcentrationSpellEvent(db, id, 'Hold Person');

    expect(result.success).toBe(true);
    expect(result.droppedSpell).toBe('Bless');
    expect(state(db, id).concentratingOn).toBe('Hold Person');
  });

  // ── 7. getResolvedCharacterState returns correct AC with an active buff ─────
  it('getResolvedCharacterState includes buff AC bonuses in finalAC', () => {
    const id = insertCharacter(db, { max_hp: 30, current_hp: 30, ac: 15 });

    // Retrieve base AC
    const before = getResolvedCharacterState(db, id);
    const baseAc = before.ac;

    // Apply Shield of Faith (+2 AC)
    applyBuffEvent(db, id, { name: 'Shield of Faith', sourceName: 'Cleric' });

    const after = getResolvedCharacterState(db, id);
    expect(after.ac).toBe(baseAc + 2);
  });

  // ── 8. longRestEvent restores HP and spell slots ───────────────────────────
  it('longRestEvent restores full HP and clears spell slot usage', () => {
    const id = insertCharacter(db, {
      max_hp: 40,
      current_hp: 40,
      data_json_extra: {
        spellSlots: { 1: 4, 2: 3 },
      },
    });

    // Burn HP and a spell slot
    applyDamageEvent(db, id, 20, 'fire');
    useSpellSlotEvent(db, id, 1);

    expect(state(db, id).currentHp).toBe(20);
    expect(state(db, id).spellSlotsUsed['1']).toBe(1);

    // Long rest
    const result = longRestEvent(db, id);

    expect(result.success).toBe(true);
    expect(result.newHp).toBe(40);
    expect(state(db, id).currentHp).toBe(40);
    expect(state(db, id).spellSlotsUsed).toEqual({});
  });

  // ── Bonus: saveSessionState / getSessionState round-trip ──────────────────
  it('session state round-trips all fields without data loss', () => {
    const id = insertCharacter(db, { max_hp: 30, current_hp: 30 });

    applyConditionEvent(db, id, 'prone');
    applyBuffEvent(db, id, { name: 'Bless', sourceName: 'Cleric' });
    setTempHpEvent(db, id, 5);
    castConcentrationSpellEvent(db, id, 'Bless');

    const s = state(db, id);
    expect(s.activeConditions).toContain('prone');
    expect(s.activeBuffs.length).toBeGreaterThan(0);
    expect(s.tempHp).toBe(5);
    expect(s.concentratingOn).toBe('Bless');
  });
});
