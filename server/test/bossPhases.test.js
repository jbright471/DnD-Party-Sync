'use strict';

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from './helpers/testDb.js';
import { configureBossPhases, transitionBossPhase } from '../services/bossPhases.js';

describe('boss phase transitions', () => {
  let db;
  let trackerId;

  beforeEach(() => {
    db = createTestDb();
    const result = db.prepare(`
      INSERT INTO initiative_tracker (
        entity_name, entity_type, initiative, current_hp, max_hp, ac,
        conditions_json, buffs_json, stats_json
      ) VALUES ('Ash Tyrant', 'monster', 18, 40, 100, 17, '["poisoned"]', '[{"id":"mark","name":"Faerie Fire"}]', '{"speed":30}')
    `).run();
    trackerId = Number(result.lastInsertRowid);
  });

  it('preserves conditions and buffs by default while resetting the phase HP pool', () => {
    const configured = configureBossPhases(db, trackerId, [
      { name: 'Bound Form', maxHp: 100, ac: 17 },
      { name: 'Unbound Form', maxHp: 150, ac: 19 },
    ]);
    expect(configured.success).toBe(true);

    const result = transitionBossPhase(db, trackerId);
    const row = db.prepare('SELECT * FROM initiative_tracker WHERE id = ?').get(trackerId);
    expect(result.success).toBe(true);
    expect(row.current_hp).toBe(150);
    expect(row.max_hp).toBe(150);
    expect(JSON.parse(row.conditions_json)).toEqual(['poisoned']);
    expect(JSON.parse(row.buffs_json)).toHaveLength(1);
    expect(row.phase_name).toBe('Unbound Form');
  });

  it('supports proportional HP and explicit effect cleanup', () => {
    configureBossPhases(db, trackerId, [
      { name: 'Bound Form', maxHp: 100, ac: 17 },
      { name: 'Final Form', maxHp: 200, ac: 20, hpMode: 'proportional', clearConditions: true, clearBuffs: true },
    ]);

    transitionBossPhase(db, trackerId);
    const row = db.prepare('SELECT * FROM initiative_tracker WHERE id = ?').get(trackerId);
    expect(row.current_hp).toBe(80);
    expect(JSON.parse(row.conditions_json)).toEqual([]);
    expect(JSON.parse(row.buffs_json)).toEqual([]);
  });
});
