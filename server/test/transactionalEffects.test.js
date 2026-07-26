'use strict';

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, insertCharacter } from './helpers/testDb.js';
import { executeEffectCommand } from '../services/transactionalEffects.js';
import { getCampaignVersion, getStateDeltas } from '../lib/processedCommands.js';
import { getSessionState } from '../lib/rulesIntegration.js';

describe('transactionalEffects', () => {
  let db;
  let firstCharacter;
  let secondCharacter;

  beforeEach(() => {
    db = createTestDb();
    firstCharacter = insertCharacter(db, { name: 'Aster', current_hp: 30, max_hp: 30 });
    secondCharacter = insertCharacter(db, { name: 'Bram', current_hp: 25, max_hp: 25 });
  });

  function envelope(overrides = {}) {
    return {
      commandId: '123e4567-e89b-42d3-a456-426614174000',
      commandType: 'effect.party.apply',
      schemaVersion: '1.0.0',
      expectedCampaignVersion: 0,
      expectedAggregateVersions: {
        [`character:${firstCharacter}`]: 0,
        [`character:${secondCharacter}`]: 0,
      },
      actor: { type: 'dm', id: 'DM' },
      payload: {
        targets: [
          { id: firstCharacter, type: 'character' },
          { id: secondCharacter, type: 'character' },
        ],
        effects: [{ type: 'damage', value: 5, damageType: 'fire' }],
        actor: 'DM',
      },
      ...overrides,
    };
  }

  it('applies every target, audit record, version, and delta in one command', () => {
    const delivered = [];
    const outcome = executeEffectCommand(db, envelope(), {}, {
      afterCommit: committed => delivered.push(committed.stateDelta),
    });

    expect(getSessionState(db, firstCharacter).currentHp).toBe(25);
    expect(getSessionState(db, secondCharacter).currentHp).toBe(20);
    expect(outcome.aggregateVersions).toEqual({
      [`character:${firstCharacter}`]: 1,
      [`character:${secondCharacter}`]: 1,
    });
    expect(getCampaignVersion(db)).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM effect_events').get().count).toBe(2);
    expect(db.prepare('SELECT COUNT(*) AS count FROM command_audit_events').get().count).toBe(1);
    expect(getStateDeltas(db, 0)).toHaveLength(1);
    expect(delivered).toHaveLength(1);
  });

  it('replays the stored outcome without a second mutation, audit, or delivery', () => {
    const delivered = [];
    const command = envelope();
    executeEffectCommand(db, command, {}, { afterCommit: () => delivered.push('sent') });
    const replay = executeEffectCommand(db, command, {}, { afterCommit: () => delivered.push('sent') });

    expect(replay.replayed).toBe(true);
    expect(getSessionState(db, firstCharacter).currentHp).toBe(25);
    expect(db.prepare('SELECT COUNT(*) AS count FROM effect_events').get().count).toBe(2);
    expect(delivered).toEqual(['sent']);
  });

  it('rejects a missing target before applying any target mutation', () => {
    const command = envelope({
      payload: {
        targets: [
          { id: firstCharacter, type: 'character' },
          { id: 99999, type: 'character' },
        ],
        effects: [{ type: 'damage', value: 5 }],
        actor: 'DM',
      },
      expectedAggregateVersions: {
        [`character:${firstCharacter}`]: 0,
        'character:99999': 0,
      },
    });

    expect(() => executeEffectCommand(db, command)).toThrow('One or more effect targets do not exist');
    expect(getSessionState(db, firstCharacter).currentHp).toBe(30);
    expect(getCampaignVersion(db)).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM effect_events').get().count).toBe(0);
  });
});
