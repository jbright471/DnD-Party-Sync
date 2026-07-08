import { describe, it, expect, beforeEach } from 'vitest';
const Database = require('better-sqlite3');
const { runMigrations } = require('../schema');
const {
  getSessionState,
  getResolvedCharacterState,
  applyConditionEvent,
  applyDamageEvent,
  applyHealEvent,
  applyBuffEvent,
} = require('../lib/rulesIntegration');

describe('Round-Teardown & Severe State Changes', () => {
  let db;

  const setupTestDb = () => {
    db = new Database(':memory:');
    const dbModule = require('../db');
    dbModule.exec = db.exec.bind(db);
    dbModule.prepare = db.prepare.bind(db);
    dbModule.transaction = db.transaction.bind(db);
    runMigrations();
  };

  beforeEach(() => {
    setupTestDb();

    const insertChar = db.prepare(`
      INSERT INTO characters (id, name, class, level, max_hp, current_hp, ac, stats, inventory, data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Create a base character for state teardown testing
    const baseStats = { STR: 14, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 };
    insertChar.run(
      1, 'Test Teardown Char', 'Fighter', 5,
      20, 20, 16,
      JSON.stringify(baseStats),
      '[]',
      JSON.stringify({ baseMaxHp: 20, baseAc: 16 })
    );

    // Initialize session state
    const initSession = db.prepare(`
      INSERT INTO session_states (character_id, current_hp, temp_hp, conditions_json, buffs_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    initSession.run(1, 20, 0, '[]', '[]');
  });

  it('should dissolve concentration buffs and apply unconscious when dropping to 0 HP', () => {
    // 1. Give the character some active buffs and make them concentrate
    const buff = {
      id: 'buff-123',
      name: 'Shield of Faith',
      stat: 'AC',
      modifier: 2,
      source: 'Cleric'
    };
    applyBuffEvent(db, 1, buff);
    
    let state = getSessionState(db, 1);
    state.concentratingOn = 'Bless';
    const updateConcentration = db.prepare('UPDATE session_states SET concentrating_on = ? WHERE character_id = ?');
    updateConcentration.run('Bless', 1);

    // Verify initial setup
    let resolved = getResolvedCharacterState(db, 1);
    expect(resolved.ac).toBe(18); // 16 base + 2 buff
    expect(resolved.concentratingOn).toBe('Bless');

    // 2. Deal lethal damage
    applyDamageEvent(db, 1, 30, 'slashing');

    // 3. Re-evaluate state
    resolved = getResolvedCharacterState(db, 1);
    
    // The character should be unconscious, at 0 HP
    expect(resolved.currentHp).toBe(0);
    // Concentration must be broken on 0 HP
    expect(resolved.concentratingOn).toBe(null);
    expect(resolved.conditions).toContain('unconscious');
    expect(resolved.rollModifiers.attacks.incapacitated).toBe(true);
    expect(resolved.rollModifiers.saving_throws.STR.autoFail).toBe(true);
  });
  
  it('should handle removing conditions that alter stats when unconscious is applied', () => {
    // E.g. Haste provides +2 AC. If we become unconscious, Haste might end, but let's test a simple condition overlap.
    applyConditionEvent(db, 1, 'Restrained');
    
    let resolved = getResolvedCharacterState(db, 1);
    expect(resolved.conditions).toContain('restrained');
    expect(resolved.rollModifiers.attacks.advantage).toBe('disadvantage');
    
    // Apply Unconscious
    applyConditionEvent(db, 1, 'Unconscious');
    resolved = getResolvedCharacterState(db, 1);
    
    expect(resolved.conditions).toContain('unconscious');
    expect(resolved.conditions).toContain('restrained');
    // Both Unconscious and Restrained give disadvantage to attacks, but Unconscious incapacitates
    expect(resolved.rollModifiers.attacks.incapacitated).toBe(true);
    expect(resolved.rollModifiers.saving_throws.STR.autoFail).toBe(true); // From Unconscious STR/DEX saves
  });

  it('should remove automatic unconscious when healing above 0 HP', () => {
    applyDamageEvent(db, 1, 30, 'slashing');

    let resolved = getResolvedCharacterState(db, 1);
    expect(resolved.currentHp).toBe(0);
    expect(resolved.conditions).toContain('unconscious');

    applyHealEvent(db, 1, 5);
    resolved = getResolvedCharacterState(db, 1);

    expect(resolved.currentHp).toBe(5);
    expect(resolved.conditions).not.toContain('unconscious');
    expect(resolved.rollModifiers.attacks.incapacitated).toBe(false);
  });
});
