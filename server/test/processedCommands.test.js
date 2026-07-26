'use strict';

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, insertCharacter } from './helpers/testDb.js';
import { applyDamageEvent, getSessionState } from '../lib/rulesIntegration.js';
import {
  CommandConflictError,
  executeProcessedCommand,
  executeTransactionalCommand,
  getCampaignVersion,
  getStateDeltas,
  pruneProcessedCommands,
} from '../lib/processedCommands.js';

describe('processedCommands', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  it('commits a repeated command no more than once and returns the stored result', () => {
    const characterId = insertCharacter(db, { current_hp: 40, max_hp: 40 });
    const command = {
      commandId: 'damage-1',
      commandType: 'character.hp.update',
      aggregateKey: `character:${characterId}`,
      payload: { characterId, delta: -10, damageType: 'fire' },
    };

    const first = executeProcessedCommand(db, command, () => applyDamageEvent(db, characterId, 10, 'fire'));
    const replay = executeProcessedCommand(db, command, () => applyDamageEvent(db, characterId, 10, 'fire'));

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.result).toEqual(first.result);
    expect(getSessionState(db, characterId).currentHp).toBe(30);
    expect(db.prepare('SELECT COUNT(*) AS count FROM processed_commands').get().count).toBe(1);
  });

  it('rejects reuse of a command ID with a different payload', () => {
    executeProcessedCommand(db, {
      commandId: 'same-id',
      commandType: 'test.command',
      payload: { value: 1 },
    }, () => ({ success: true }));

    expect(() => executeProcessedCommand(db, {
      commandId: 'same-id',
      commandType: 'test.command',
      payload: { value: 2 },
    }, () => ({ success: true }))).toThrow(CommandConflictError);
  });

  it('rolls back the receipt and mutation when execution fails', () => {
    const characterId = insertCharacter(db, { current_hp: 40, max_hp: 40 });

    expect(() => executeProcessedCommand(db, {
      commandId: 'failed-command',
      commandType: 'character.hp.update',
      aggregateKey: `character:${characterId}`,
      payload: { characterId, delta: -10 },
    }, () => {
      applyDamageEvent(db, characterId, 10, 'fire');
      throw new Error('simulated failure');
    })).toThrow('simulated failure');

    expect(getSessionState(db, characterId).currentHp).toBe(40);
    expect(db.prepare('SELECT * FROM processed_commands WHERE command_id = ?').get('failed-command')).toBeUndefined();
  });

  it('enforces expected aggregate versions for conflicting set operations', () => {
    executeProcessedCommand(db, {
      commandId: 'version-1',
      commandType: 'resource.set',
      aggregateKey: 'character:1',
      expectedVersion: 0,
      payload: { value: 1 },
    }, () => ({ value: 1 }));

    try {
      executeProcessedCommand(db, {
        commandId: 'version-2',
        commandType: 'resource.set',
        aggregateKey: 'character:1',
        expectedVersion: 0,
        payload: { value: 2 },
      }, () => ({ value: 2 }));
      throw new Error('Expected a stale aggregate version error');
    } catch (error) {
      expect(error).toMatchObject({ code: 'STALE_AGGREGATE_VERSION' });
    }
  });

  it('stores rejected results without advancing the aggregate version', () => {
    const outcome = executeProcessedCommand(db, {
      commandId: 'rejected-command',
      commandType: 'character.resource.use',
      aggregateKey: 'character:1',
      payload: { amount: 1 },
    }, () => ({ success: false, error: 'Resource unavailable' }));

    expect(outcome.result).toEqual({ success: false, error: 'Resource unavailable' });
    expect(outcome.aggregateVersion).toBe(0);
    expect(db.prepare('SELECT version FROM aggregate_versions WHERE aggregate_key = ?').get('character:1')).toBeUndefined();
  });

  it('commits multiple aggregate versions, the campaign clock, audit, and delta atomically', () => {
    const first = executeTransactionalCommand(db, {
      commandId: 'multi-aggregate-1',
      commandType: 'effect.party.apply',
      expectedCampaignVersion: 0,
      expectedAggregateVersions: {
        'character:1': 0,
        'character:2': 0,
      },
      payload: { targets: [1, 2], amount: 4 },
    }, () => ({ success: true, affected: [1, 2] }), {
      buildDelta: result => ({ kind: 'effects_applied', affected: result.affected }),
    });

    expect(first).toMatchObject({
      replayed: false,
      campaignVersion: 1,
      aggregateVersions: { 'character:1': 1, 'character:2': 1 },
    });
    expect(getCampaignVersion(db)).toBe(1);
    expect(getStateDeltas(db, 0)).toEqual([expect.objectContaining({
      campaignVersion: 1,
      commandId: 'multi-aggregate-1',
      changes: { kind: 'effects_applied', affected: [1, 2] },
    })]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM command_audit_events').get().count).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM command_aggregates').get().count).toBe(2);
  });

  it('rejects stale campaign and per-aggregate expectations independently', () => {
    executeTransactionalCommand(db, {
      commandId: 'seed-version',
      commandType: 'character.update',
      aggregates: [{ key: 'character:1', expectedVersion: 0 }],
      payload: {},
    }, () => ({ success: true }));

    expect(() => executeTransactionalCommand(db, {
      commandId: 'stale-campaign',
      commandType: 'character.update',
      expectedCampaignVersion: 0,
      aggregates: [{ key: 'character:2', expectedVersion: 0 }],
      payload: {},
    }, () => ({ success: true }))).toThrow(expect.objectContaining({ code: 'STALE_CAMPAIGN_VERSION' }));

    expect(() => executeTransactionalCommand(db, {
      commandId: 'stale-character',
      commandType: 'character.update',
      expectedCampaignVersion: 1,
      aggregates: [{ key: 'character:1', expectedVersion: 0 }],
      payload: {},
    }, () => ({ success: true }))).toThrow(expect.objectContaining({ code: 'STALE_AGGREGATE_VERSION' }));
  });

  it('runs post-commit delivery once and never for replayed commands', () => {
    const delivered = [];
    const command = {
      commandId: 'delivery-once',
      commandType: 'character.update',
      aggregateKey: 'character:1',
      payload: { value: 2 },
    };
    const options = { afterCommit: outcome => delivered.push(outcome.stateDelta) };

    executeTransactionalCommand(db, command, () => ({ success: true }), options);
    executeTransactionalCommand(db, command, () => ({ success: true }), options);

    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ campaignVersion: 1, commandId: 'delivery-once' });
  });

  it('prunes old committed receipts without touching recent commands', () => {
    executeProcessedCommand(db, {
      commandId: 'recent',
      commandType: 'test.command',
      payload: {},
    }, () => ({ ok: true }));
    db.prepare("UPDATE processed_commands SET created_at = datetime('now', '-90 days') WHERE command_id = 'recent'").run();

    pruneProcessedCommands(db, { maxAgeDays: 30 });

    expect(db.prepare("SELECT 1 FROM processed_commands WHERE command_id = 'recent'").get()).toBeUndefined();
  });
});
