'use strict';

/**
 * DM Override vs Automation conflict tests.
 *
 * These tests verify the *ordering semantics* when DM manual actions
 * and automation presets interact on the same targets.  The ground
 * rule is: last write wins and all writes are relative deltas — there
 * is no silent overwrite between a DM direct edit and an automation
 * firing at the same time.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, insertCharacter } from './helpers/testDb.js';
import { applyDamageEvent, applyBuffEvent, getSessionState } from '../lib/rulesIntegration.js';
import { applyPartyEffect, processTurnTriggers, getCombatTimeline } from '../lib/effectEngine.js';

describe('DM overrides vs automation', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  // ── 1. Automation heal → DM damage: net is heal-then-damage ───────────────
  it('automation heals then DM damages — final HP reflects both in order', () => {
    const id = insertCharacter(db, { max_hp: 40, current_hp: 20 });

    // Automation heals 10 HP (turn trigger)
    db.prepare(`
      INSERT INTO automation_presets
        (name, preset_type, trigger_phase, effects_json, targets_json, is_active)
      VALUES ('Regenerate', 'turn_trigger', 'start_of_turn', ?, '"party"', 1)
    `).run(JSON.stringify([{ type: 'heal', value: 10 }]));

    processTurnTriggers(db, 'start_of_turn', null, 1, 0);
    // HP: 20 + 10 = 30

    // DM then manually applies 5 damage
    applyDamageEvent(db, id, 5, 'slashing');
    // HP: 30 - 5 = 25

    expect(getSessionState(db, id).currentHp).toBe(25);
  });

  // ── 2. DM override HP → automation fires after — delta is on top ──────────
  it('automation delta applies on top of a prior DM manual HP change', () => {
    const id = insertCharacter(db, { max_hp: 40, current_hp: 40 });

    // DM reduces HP to 15 (simulating a direct edit)
    applyDamageEvent(db, id, 25, 'fire');
    expect(getSessionState(db, id).currentHp).toBe(15);

    // Automation fires a 5 HP heal on start_of_turn
    db.prepare(`
      INSERT INTO automation_presets
        (name, preset_type, trigger_phase, effects_json, targets_json, is_active)
      VALUES ('Minor Heal', 'turn_trigger', 'start_of_turn', ?, '"party"', 1)
    `).run(JSON.stringify([{ type: 'heal', value: 5 }]));

    processTurnTriggers(db, 'start_of_turn', null, 1, 0);

    // Should be 15 + 5 = 20, NOT 40 + 5 = 45
    expect(getSessionState(db, id).currentHp).toBe(20);
  });

  // ── 3. DM manually buffs; automation buffs same character — both coexist ───
  it('DM buff and automation buff on same character both appear in activeBuffs', () => {
    const id = insertCharacter(db, { max_hp: 30, current_hp: 30 });

    // DM applies Haste manually
    applyBuffEvent(db, id, { name: 'Haste', sourceName: 'DM' });

    // Automation applies Bless
    db.prepare(`
      INSERT INTO automation_presets
        (name, preset_type, trigger_phase, effects_json, targets_json, is_active)
      VALUES ('Bless Aura', 'turn_trigger', 'start_of_turn', ?, '"party"', 1)
    `).run(JSON.stringify([{ type: 'buff', buffData: { name: 'Bless', sourceName: 'Aura' } }]));

    processTurnTriggers(db, 'start_of_turn', null, 1, 0);

    const buffNames = getSessionState(db, id).activeBuffs.map(b => b.name);
    expect(buffNames).toContain('Haste');
    expect(buffNames).toContain('Bless');
  });

  // ── 4. Inactive preset does nothing regardless of DM state ────────────────
  it('trigger_automation with is_active = 0 does not alter HP', () => {
    const id = insertCharacter(db, { max_hp: 30, current_hp: 30 });

    db.prepare(`
      INSERT INTO automation_presets
        (name, preset_type, trigger_phase, effects_json, targets_json, is_active)
      VALUES ('Disabled Damage', 'turn_trigger', 'start_of_turn', ?, '"party"', 0)
    `).run(JSON.stringify([{ type: 'damage', value: 99 }]));

    // DM sets HP manually to something known
    applyDamageEvent(db, id, 5, 'untyped');
    expect(getSessionState(db, id).currentHp).toBe(25);

    processTurnTriggers(db, 'start_of_turn', null, 1, 0);

    // Still 25 — inactive preset was never applied
    expect(getSessionState(db, id).currentHp).toBe(25);
  });

  // ── 5. apply_party_effect writes effect_events even when mixed with manual ─
  it('effect_events log includes both automation and manual actions in order', () => {
    const id = insertCharacter(db, { max_hp: 40, current_hp: 40 });

    // Manual damage via applyPartyEffect (same path as the socket handler)
    applyPartyEffect(
      db,
      [{ type: 'damage', value: 5, damageType: 'slashing' }],
      [{ id, type: 'character' }],
      'DM', 1, 0, 'action', null
    );

    // Automation heal via turn trigger
    db.prepare(`
      INSERT INTO automation_presets
        (name, preset_type, trigger_phase, effects_json, targets_json, is_active)
      VALUES ('Auto Heal', 'turn_trigger', 'end_of_turn', ?, '"party"', 1)
    `).run(JSON.stringify([{ type: 'heal', value: 3 }]));

    processTurnTriggers(db, 'end_of_turn', null, 1, 1);

    const events = getCombatTimeline(db);
    const types = events.map(e => e.event_type);
    expect(types).toContain('damage');
    expect(types).toContain('heal');
    // Damage event recorded before heal (ordered by id ASC)
    expect(types.indexOf('damage')).toBeLessThan(types.indexOf('heal'));
  });
});
