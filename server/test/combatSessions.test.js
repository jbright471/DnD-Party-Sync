import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/testDb.js';
import {
  archiveActiveCombatSession,
  getCombatTimeline,
  listCombatSessions,
  reverseEvent,
  startCombatSession,
  writeAuditEvent,
} from '../services/effects-engine/index.js';
import {
  applyConditionEvent,
  applyDamageEvent,
  applyHealEvent,
  removeConditionEvent,
} from '../lib/rulesIntegration.js';

describe('combat session archives', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  it('keeps completed encounter events separate from the next encounter', () => {
    const first = startCombatSession(db, { encounterId: 7, name: 'Goblin Ambush' });
    writeAuditEvent(db, {
      sessionRound: 1,
      turnIndex: 0,
      eventType: 'damage',
      actor: 'DM',
      targetId: 1,
      targetName: 'Goblin',
      payload: { value: 4 },
      description: 'Goblin took 4 damage',
    });
    archiveActiveCombatSession(db, 3);

    const second = startCombatSession(db, { encounterId: 8, name: 'Bridge Fight' });
    writeAuditEvent(db, {
      sessionRound: 1,
      turnIndex: 0,
      eventType: 'heal',
      actor: 'Cleric',
      targetId: 2,
      targetName: 'Fighter',
      payload: { value: 5 },
      description: 'Fighter recovered 5 HP',
    });

    expect(getCombatTimeline(db).map(event => event.event_type)).toEqual(['heal']);
    expect(getCombatTimeline(db, 200, first.id).map(event => event.event_type)).toEqual(['damage']);
    expect(getCombatTimeline(db, 200, second.id).map(event => event.event_type)).toEqual(['heal']);

    const sessions = listCombatSessions(db);
    expect(sessions).toHaveLength(2);
    expect(sessions.find(session => session.id === first.id)).toMatchObject({ status: 'archived', total_rounds: 3, event_count: 1 });
    expect(sessions.find(session => session.id === second.id)).toMatchObject({ status: 'active', event_count: 1 });
  });

  it('rejects reversal attempts against archived events', () => {
    startCombatSession(db, { name: 'Finished Fight' });
    const eventId = writeAuditEvent(db, {
      sessionRound: 1,
      turnIndex: 0,
      eventType: 'damage',
      actor: 'DM',
      targetId: 1,
      targetName: 'Target',
      payload: { value: 4 },
      description: 'Target took 4 damage',
    });
    archiveActiveCombatSession(db, 1);

    const result = reverseEvent(
      db,
      eventId,
      'DM',
      applyDamageEvent,
      applyHealEvent,
      applyConditionEvent,
      removeConditionEvent,
    );

    expect(result).toEqual({ success: false, error: 'Archived combat events are read-only' });
  });
});
