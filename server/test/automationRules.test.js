import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, insertCharacter } from './helpers/testDb.js';
import { getAutomationRules, setAutomationRules } from '../lib/automationRules.js';
import { applyDamageEvent, applyHealEvent, getSessionState, saveSessionState } from '../lib/rulesIntegration.js';
import { processTurnTriggers } from '../services/effects-engine/index.js';

describe('campaign automation rules', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  it('keeps existing automation enabled by default', () => {
    expect(getAutomationRules(db)).toMatchObject({
      automaticUnconscious: true,
      clearUnconsciousOnHeal: true,
      concentrationCleanup: true,
      concentrationChecks: 'automatic',
      conditionDurations: true,
      turnTriggers: true,
      auras: true,
      reactiveHandlers: true,
      initiativeSync: true,
    });
  });

  it('persists partial updates without resetting other rules', () => {
    const updated = setAutomationRules(db, { turnTriggers: false, concentrationChecks: 'prompt' });
    expect(updated.turnTriggers).toBe(false);
    expect(updated.concentrationChecks).toBe('prompt');
    expect(updated.automaticUnconscious).toBe(true);
    expect(getAutomationRules(db)).toEqual(updated);
  });

  it('does not apply or clear unconscious when those policies are disabled', () => {
    const characterId = insertCharacter(db, { current_hp: 5, max_hp: 20 });
    setAutomationRules(db, { automaticUnconscious: false, clearUnconsciousOnHeal: false });

    applyDamageEvent(db, characterId, 10);
    expect(getSessionState(db, characterId).activeConditions).not.toContain('unconscious');

    const state = getSessionState(db, characterId);
    state.activeConditions.push('unconscious');
    saveSessionState(db, state);
    applyHealEvent(db, characterId, 5);
    expect(getSessionState(db, characterId).activeConditions).toContain('unconscious');
  });

  it('skips turn-trigger presets when disabled', () => {
    const characterId = insertCharacter(db);
    db.prepare(`
      INSERT INTO automation_presets (name, preset_type, trigger_phase, effects_json, targets_json)
      VALUES ('Turn Burn', 'turn_trigger', 'start_of_turn', '[{"type":"damage","value":5}]', ?)
    `).run(JSON.stringify([{ id: characterId, type: 'character' }]));
    setAutomationRules(db, { turnTriggers: false });

    expect(processTurnTriggers(db, 'start_of_turn', 1, 1, 0)).toEqual([]);
    expect(getSessionState(db, characterId).currentHp).toBe(40);
  });
});
