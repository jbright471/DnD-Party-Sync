'use strict';

/**
 * Socket event / race condition tests.
 *
 * These tests spin up a real Socket.io server against an in-memory DB
 * and fire events from multiple concurrent clients to verify:
 *
 *  - Sequential update_hp calls from two clients always produce a
 *    consistent final HP (no double-apply, no lost update).
 *  - apply_party_effect while another client fires update_hp produces
 *    correct net HP for all characters.
 *  - apply_buff followed immediately by apply_condition on the same
 *    character — both persist correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, insertCharacter } from './helpers/testDb.js';
import { createTestServer, emitAndWait } from './helpers/testServer.js';
import { getSessionState } from '../lib/rulesIntegration.js';

describe('socket — event ordering and concurrent mutations', () => {
  let db, server, clientA, clientB;

  beforeEach(async () => {
    db = createTestDb();
    server = await createTestServer(db);
    clientA = server.connect();
    clientB = server.connect();

    // Wait for both sockets to connect before running tests
    await Promise.all([
      new Promise(res => clientA.on('connect', res)),
      new Promise(res => clientB.on('connect', res)),
    ]);
  });

  afterEach(async () => {
    clientA.disconnect();
    clientB.disconnect();
    await server.close();
  });

  // ── 1. Two simultaneous update_hp calls produce correct final HP ───────────
  it('two clients firing update_hp on the same character end at correct HP', async () => {
    // Character starts at 40 HP
    const id = insertCharacter(db, { max_hp: 40, current_hp: 40 });

    // Fire both damage events as close to simultaneously as possible.
    // Each deals 10 damage — final should be 20 (not 30 or 40).
    const [resultA, resultB] = await Promise.all([
      emitAndWait(clientA, 'update_hp', { characterId: id, delta: -10, damageType: 'fire' }, 'update_hp_result'),
      emitAndWait(clientB, 'update_hp', { characterId: id, delta: -10, damageType: 'cold' }, 'update_hp_result'),
    ]);

    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);

    // Read DB directly — must be exactly 20 regardless of event ordering
    const finalHp = getSessionState(db, id).currentHp;
    expect(finalHp).toBe(20);
  });

  // ── 2. apply_party_effect + simultaneous update_hp — all chars correct ─────
  it('party effect and individual update_hp in parallel both apply correctly', async () => {
    const id1 = insertCharacter(db, { name: 'Aria', max_hp: 40, current_hp: 40 });
    const id2 = insertCharacter(db, { name: 'Brom', max_hp: 30, current_hp: 30 });

    // clientA hits the whole party for 10 (fire)
    // clientB simultaneously hits Aria for another 5 (slashing)
    const [, ] = await Promise.all([
      emitAndWait(
        clientA,
        'apply_party_effect',
        { effects: [{ type: 'damage', value: 10, damageType: 'fire' }], targets: 'party' },
        'apply_party_effect_result'
      ),
      emitAndWait(
        clientB,
        'update_hp',
        { characterId: id1, delta: -5, damageType: 'slashing' },
        'update_hp_result'
      ),
    ]);

    // Aria: 40 - 10 (fire) - 5 (slashing) = 25   OR  40 - 5 - 10 = 25 (order irrelevant)
    // Brom: 30 - 10 (fire) = 20
    expect(getSessionState(db, id1).currentHp).toBe(25);
    expect(getSessionState(db, id2).currentHp).toBe(20);
  });

  // ── 3. apply_buff then apply_condition — both persist ─────────────────────
  it('sequential apply_buff and apply_condition on same character both persist', async () => {
    const id = insertCharacter(db, { name: 'Aria' });

    await emitAndWait(
      clientA,
      'apply_buff',
      { characterId: id, buffData: { name: 'Bless', sourceName: 'Cleric' } },
      'apply_buff_result'
    );

    await emitAndWait(
      clientA,
      'apply_condition',
      { characterId: id, condition: 'poisoned' },
      'apply_condition_result'
    );

    const s = getSessionState(db, id);
    expect(s.activeBuffs.map(b => b.name)).toContain('Bless');
    expect(s.activeConditions).toContain('poisoned');
  });

  // ── 4. Two clients apply different buffs concurrently — both persist ───────
  it('two clients applying different buffs simultaneously — both survive', async () => {
    const id = insertCharacter(db, { name: 'Aria' });

    await Promise.all([
      emitAndWait(clientA, 'apply_buff', { characterId: id, buffData: { name: 'Bless' } }, 'apply_buff_result'),
      emitAndWait(clientB, 'apply_buff', { characterId: id, buffData: { name: 'Haste' } }, 'apply_buff_result'),
    ]);

    const buffNames = getSessionState(db, id).activeBuffs.map(b => b.name);
    expect(buffNames).toContain('Bless');
    expect(buffNames).toContain('Haste');
  });
});
