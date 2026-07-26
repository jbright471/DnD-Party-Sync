'use strict';

import { describe, expect, it } from 'vitest';
import { createTestDb, insertCharacter } from './helpers/testDb.js';
import { installSocketMutationBoundary } from '../lib/socketMutationBoundary.js';
import { getCampaignVersion } from '../lib/processedCommands.js';

class FakeSocket {
  constructor() {
    this.handlers = new Map();
    this.emitted = [];
    this.id = 'socket-1';
  }
  on(event, listener) { this.handlers.set(event, listener); return this; }
  emit(event, payload) { this.emitted.push({ event, payload }); return this; }
  trigger(event, ...args) { return this.handlers.get(event)(...args); }
}

describe('socketMutationBoundary', () => {
  it('wraps a legacy synchronous socket mutation in one replay-safe transaction', () => {
    const db = createTestDb();
    const characterId = insertCharacter(db, { current_hp: 20, max_hp: 20 });
    const socket = new FakeSocket();
    const deliveries = [];
    let executions = 0;
    installSocketMutationBoundary(socket, {
      db,
      mutationEvents: new Set(['legacy_hp']),
      afterCommit: outcome => deliveries.push(outcome.stateDelta),
    });
    socket.on('legacy_hp', payload => {
      executions += 1;
      db.prepare('UPDATE characters SET current_hp = current_hp + ? WHERE id = ?').run(payload.delta, payload.characterId);
    });
    const payload = { commandId: 'socket-command-1', characterId, delta: -5 };

    socket.trigger('legacy_hp', payload);
    socket.trigger('legacy_hp', payload);

    expect(executions).toBe(1);
    expect(db.prepare('SELECT current_hp FROM characters WHERE id = ?').get(characterId).current_hp).toBe(15);
    expect(getCampaignVersion(db)).toBe(1);
    expect(deliveries).toHaveLength(1);
    expect(socket.emitted.some(item => item.event === 'command_result' && item.payload.replayed)).toBe(true);
  });
});
