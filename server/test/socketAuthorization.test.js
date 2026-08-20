'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPermissionTargetAuthorizer,
  createSocketAuthorizationMiddleware,
  EVENT_CLASSIFICATIONS,
} from '../lib/socketAuthorization.js';
import { createTestDb, insertCharacter } from './helpers/testDb.js';
import { createTestServer, emitAndWait } from './helpers/testServer.js';
import { getSessionState } from '../lib/rulesIntegration.js';
import { setPermissions } from '../lib/permissions.js';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

function waitForAuthorizationError(socket, event, payload = {}) {
  return emitAndWait(socket, event, payload, 'authorization_error');
}

function emitWithAck(socket, event, payload) {
  return new Promise(resolve => socket.emit(event, payload, resolve));
}

describe('Socket.io inbound authorization', () => {
  let db;
  let server;
  let ariaId;
  let bromId;
  const clients = [];

  async function connect(session) {
    const client = server.connect(session);
    clients.push(client);
    await new Promise(resolve => client.on('connect', resolve));
    return client;
  }

  beforeEach(async () => {
    db = createTestDb();
    ariaId = insertCharacter(db, { name: 'Aria', max_hp: 40, current_hp: 40 });
    bromId = insertCharacter(db, { name: 'Brom', max_hp: 30, current_hp: 30 });
    setPermissions(db, {
      cross_player_effects: 'dm_approval',
      loot_claim: 'owner_only',
    });
    server = await createTestServer(db, {
      principals: {
        cast: { accessGrant: { id: 1, role: 'cast', characterId: null, encounterId: 1 } },
        aria: { accessGrant: { id: 2, role: 'player', characterId: ariaId } },
      },
    });
  });

  afterEach(async () => {
    for (const client of clients) client.disconnect();
    await server.close();
  });

  it.each([
    ['unauthenticated', null],
    ['cast', 'cast'],
  ])('denies %s sockets a representative mutation without side effects', async (_label, session) => {
    const client = await connect(session);

    const error = await waitForAuthorizationError(client, 'update_hp', {
      characterId: ariaId,
      delta: -10,
      accessToken: 'must-not-leak',
      dmAuthenticated: true,
      role: 'dm',
    });

    expect(error).toEqual({ code: 'SOCKET_EVENT_FORBIDDEN', message: 'Not authorized for this event.' });
    expect(getSessionState(db, ariaId).currentHp).toBe(40);
  });

  it('denies a player acting on another character without side effects', async () => {
    const player = await connect('aria');

    const error = await waitForAuthorizationError(player, 'update_hp', {
      characterId: bromId,
      delta: -10,
      actor: 'Brom',
    });

    expect(error.code).toBe('SOCKET_CHARACTER_SCOPE_MISMATCH');
    expect(getSessionState(db, bromId).currentHp).toBe(30);
  });

  it('preserves a server-approved cross-player effect without trusting actor identity', async () => {
    setPermissions(db, { cross_player_effects: 'open' });
    const player = await connect('aria');

    const result = await emitAndWait(player, 'update_hp', {
      characterId: bromId,
      delta: -5,
      actor: 'Dungeon Master',
    }, 'update_hp_result');

    expect(result).toMatchObject({ success: true, authorizedActor: 'Aria' });
    expect(getSessionState(db, bromId).currentHp).toBe(25);
  });

  it('preserves an open cross-character loot target while deriving both identities', () => {
    setPermissions(db, { loot_claim: 'open' });
    const socket = {
      accessGrant: { role: 'player', characterId: ariaId },
      emit: vi.fn(),
    };
    const payload = {
      characterId: bromId,
      characterName: 'Dungeon Master',
      actor: 'Dungeon Master',
    };
    const next = vi.fn();
    const resolveCharacterIdentity = characterId => (
      db.prepare('SELECT id, name FROM characters WHERE id = ?').get(characterId) || null
    );
    const authorize = createSocketAuthorizationMiddleware(socket, {
      resolveCharacterIdentity,
      authorizePlayerTarget: createPermissionTargetAuthorizer(db),
    });

    authorize(['claim_loot', payload], next);

    expect(next).toHaveBeenCalledWith();
    expect(payload).toMatchObject({
      characterId: bromId,
      characterName: 'Brom',
      actor: 'Aria',
    });
  });

  it('denies a player including another character in a characterIds mutation', async () => {
    const player = await connect('aria');

    const error = await waitForAuthorizationError(player, 'apply_buff', {
      characterIds: [ariaId, bromId],
      buffData: { name: 'Bless' },
    });

    expect(error.code).toBe('SOCKET_CHARACTER_SCOPE_MISMATCH');
    expect(getSessionState(db, bromId).activeBuffs).toEqual([]);
  });

  it('denies a player invoking a DM-only event without side effects', async () => {
    const player = await connect('aria');

    await waitForAuthorizationError(player, 'apply_party_effect', {
      effects: [{ type: 'damage', value: 10, damageType: 'fire' }],
      targets: 'party',
    });

    expect(getSessionState(db, ariaId).currentHp).toBe(40);
    expect(getSessionState(db, bromId).currentHp).toBe(30);
  });

  it('allows a bound player-self mutation and derives actor identity server-side', async () => {
    const player = await connect('aria');

    const result = await emitAndWait(player, 'update_hp', {
      characterId: ariaId,
      delta: -5,
      actor: 'Dungeon Master',
    }, 'update_hp_result');

    expect(result).toMatchObject({ success: true, authorizedActor: 'Aria' });
    expect(getSessionState(db, ariaId).currentHp).toBe(35);
  });

  it('derives player identity while establishing a validated player role', async () => {
    const player = await connect('aria');

    const result = await emitWithAck(player, 'register_player', { playerName: 'Dungeon Master' });

    expect(result).toEqual({ success: true, playerName: 'Aria' });
  });

  it('allows a DM operation', async () => {
    const dm = await connect('dm');

    const result = await emitAndWait(dm, 'apply_party_effect', {
      effects: [{ type: 'damage', value: 10, damageType: 'fire' }],
      targets: 'party',
    }, 'apply_party_effect_result');

    expect(result).toHaveLength(2);
    expect(getSessionState(db, ariaId).currentHp).toBe(30);
    expect(getSessionState(db, bromId).currentHp).toBe(20);
  });

  it('fails closed for unknown events with a sanitized error', async () => {
    const dm = await connect('dm');

    const error = await waitForAuthorizationError(dm, 'future_unclassified_mutation', {
      dmToken: 'secret-token',
      hiddenState: { bossHp: 1 },
    });

    expect(error).toEqual({ code: 'SOCKET_EVENT_FORBIDDEN', message: 'Not authorized for this event.' });
    expect(JSON.stringify(error)).not.toMatch(/secret|token|boss|future_unclassified/i);
  });

  it('audits a denial using server-derived metadata without retaining the packet payload', () => {
    const auditEvents = [];
    const socket = {
      accessGrant: { id: 17, role: 'player', characterId: ariaId },
    };
    const next = vi.fn();
    const authorize = createSocketAuthorizationMiddleware(socket, {
      emitToSocket: vi.fn(),
      onDenied: event => auditEvents.push(event),
    });

    authorize(['future_unclassified_mutation', {
      accessToken: 'RAW_ACCESS_TOKEN_SENTINEL',
      pin: 'RAW_PIN_SENTINEL',
    }], next);

    expect(auditEvents).toEqual([{
      actorRole: 'player',
      grantId: 17,
      eventName: 'future_unclassified_mutation',
      reasonCode: 'event_not_allowed',
    }]);
    expect(JSON.stringify(auditEvents)).not.toMatch(/RAW_ACCESS_TOKEN_SENTINEL|RAW_PIN_SENTINEL/);
  });
});

describe('production Socket.io event policy coverage', () => {
  it('explicitly classifies every production socket.on event', () => {
    const serverSource = fs.readFileSync(path.join(TEST_DIRECTORY, '..', 'server.js'), 'utf8');
    const productionEvents = [...serverSource.matchAll(/socket\.on\(\s*['"]([^'"]+)['"]/g)]
      .map(match => match[1]);

    expect([...new Set(productionEvents)].sort()).toEqual(Object.keys(EVENT_CLASSIFICATIONS).sort());
    expect(serverSource).toContain('socket.use(createSocketAuthorizationMiddleware(socket,');
  });
});
