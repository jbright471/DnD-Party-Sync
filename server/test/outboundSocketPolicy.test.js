'use strict';

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { Server as SocketServer } from 'socket.io';
import { io as SocketClient } from 'socket.io-client';
import {
  OUTBOUND_EVENT_POLICIES,
  createOutboundSocketDelivery,
} from '../lib/outboundSocketPolicy.js';
import {
  projectInitiativeState,
  projectPartyState,
  projectTimeline,
} from '../lib/clientStateProjection.js';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const CAMPAIGN_EVENTS = [
  'party_state',
  'initiative_state',
  'combat_state_sync',
  'party_loot_state',
  'approval_mode',
  'timeline_update',
  'permissions_state',
  'notes_state',
  'pending_imports_sync',
  'roll_feed_event',
];

function delay(milliseconds = 75) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function collectEvents(socket) {
  const events = [];
  socket.onAny((event, payload) => events.push({ event, payload }));
  return events;
}

function expectNoEvent(events, eventName, sentinelPattern) {
  expect(events.some(({ event }) => event === eventName)).toBe(false);
  if (sentinelPattern) expect(JSON.stringify(events)).not.toMatch(sentinelPattern);
}

async function createPolicyServer() {
  const httpServer = http.createServer();
  const io = new SocketServer(httpServer, { transports: ['polling'] });
  const delivery = createOutboundSocketDelivery(io, {
    getRecipient(socket) {
      const role = socket.handshake.auth?.role;
      return {
        role: ['dm', 'player', 'cast'].includes(role) ? role : 'unauthenticated',
        characterId: role === 'player' ? socket.handshake.auth?.characterId : null,
      };
    },
    projectors: {
      party_state: (payload, recipient) => projectPartyState(payload, recipient),
      initiative_state: (payload, recipient) => projectInitiativeState(payload, {
        ...recipient,
        permissions: { view_monster_hp: 'dm_only' },
      }),
      timeline_update: (payload, recipient) => projectTimeline(payload, recipient),
    },
  });

  const party = [
    { id: 1, name: 'Aria', currentHp: 20, maxHp: 30, inventory: [{ name: 'ARIA_PRIVATE_SENTINEL' }], notes: 'ARIA_NOTES_SENTINEL' },
    { id: 2, name: 'Brom', currentHp: 25, maxHp: 25, inventory: [{ name: 'BROM_PRIVATE_SENTINEL' }], notes: 'BROM_NOTES_SENTINEL' },
  ];
  const initiative = [
    { id: 10, entity_type: 'pc', entity_name: 'Aria', character_id: 1, current_hp: 20, max_hp: 30, ac: 15, is_hidden: 0 },
    { id: 11, entity_type: 'monster', entity_name: 'Visible Wyrm', current_hp: 90, max_hp: 120, ac: 18, hp_status: 'Healthy', is_hidden: 0, stats_json: 'MONSTER_STATS_SENTINEL', boss_phases_json: 'BOSS_INTERNAL_SENTINEL' },
    { id: 12, entity_type: 'monster', entity_name: 'HIDDEN_MONSTER_SENTINEL', current_hp: 40, max_hp: 40, ac: 14, is_hidden: 1 },
  ];
  const timeline = [
    { id: 20, target_type: 'character', target_id: 1, event_type: 'private', description: 'ARIA_TIMELINE_SENTINEL' },
    { id: 21, target_type: 'character', target_id: 2, event_type: 'private', description: 'BROM_TIMELINE_SENTINEL' },
  ];

  io.on('connection', (socket) => {
    if (socket.handshake.auth?.role === 'dm' && !socket.handshake.auth?.skipDmRoom) {
      socket.join('dm_room');
    }
    if (socket.handshake.auth?.voiceRoom === true) socket.join('voice_room');
    delivery.send(socket, 'party_state', party);
    delivery.send(socket, 'initiative_state', initiative);
    delivery.send(socket, 'combat_state_sync', { round: 3, turnIndex: 1 });
    delivery.send(socket, 'party_loot_state', [{ name: 'SHARED_LOOT_SENTINEL' }]);
    delivery.send(socket, 'approval_mode', true);
    delivery.send(socket, 'timeline_update', timeline);
    delivery.send(socket, 'permissions_state', { dm_secret: 'PERMISSIONS_SENTINEL' });
    delivery.send(socket, 'notes_state', [{ text: 'DM_NOTES_SENTINEL' }]);
  });

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', resolve);
  });
  const { port } = httpServer.address();

  return {
    delivery,
    connect(auth = {}) {
      return SocketClient(`http://127.0.0.1:${port}`, {
        auth,
        forceNew: true,
        transports: ['polling'],
      });
    },
    async close() {
      await new Promise(resolve => io.close(() => httpServer.close(resolve)));
    },
  };
}

describe('recipient-aware outbound Socket.io isolation', () => {
  const clients = [];
  const servers = [];

  afterEach(async () => {
    clients.forEach(client => client.disconnect());
    await Promise.all(servers.map(server => server.close()));
  });

  async function connect(server, auth) {
    const client = server.connect(auth);
    const events = collectEvents(client);
    clients.push(client);
    await new Promise(resolve => client.once('connect', resolve));
    await delay();
    return { client, events };
  }

  it('sends an unauthenticated socket no campaign state on connection or broadcast', async () => {
    const server = await createPolicyServer();
    servers.push(server);
    const { events } = await connect(server);

    server.delivery.broadcast('party_state', [{ id: 99, name: 'BROADCAST_PARTY_SENTINEL' }]);
    server.delivery.broadcast('roll_feed_event', { detail: 'DM_ROLL_SENTINEL' });
    server.delivery.dm('pending_imports_sync', [{ incomingData: 'IMPORT_SENTINEL' }]);
    await delay();

    for (const eventName of CAMPAIGN_EVENTS) expectNoEvent(events, eventName);
    expect(JSON.stringify(events)).not.toMatch(/SENTINEL/);
  });

  it('sends cast only the allowlisted contract with deliberate DTO fields', async () => {
    const server = await createPolicyServer();
    servers.push(server);
    const { events } = await connect(server, { role: 'cast' });

    server.delivery.broadcast('roll_feed_event', { detail: 'CAST_DM_ROLL_SENTINEL' });
    server.delivery.broadcast('map_state', { notes: 'CAST_MAP_SENTINEL' });
    await delay();

    expect([...new Set(events.map(({ event }) => event))].sort()).toEqual([
      'combat_state_sync',
      'initiative_state',
      'party_state',
    ]);
    const party = events.find(({ event }) => event === 'party_state').payload;
    const tracker = events.find(({ event }) => event === 'initiative_state').payload;
    expect(party[0]).toEqual({
      id: 1,
      name: 'Aria',
      class: undefined,
      level: undefined,
      currentHp: 20,
      maxHp: 30,
      tempHp: 0,
      ac: 10,
      speed: 30,
      conditions: [],
      concentratingOn: null,
    });
    expect(tracker.map(entry => entry.entity_name)).toEqual(['Aria', 'Visible Wyrm']);
    expect(tracker[1]).toEqual({
      id: 11,
      character_id: null,
      entity_type: 'monster',
      entity_name: 'Visible Wyrm',
      initiative: null,
      hp_status: 'Healthy',
      current_hp: null,
      max_hp: null,
      ac: null,
      is_active: 0,
    });
    expect(JSON.stringify(events)).not.toMatch(/PRIVATE_SENTINEL|NOTES_SENTINEL|HIDDEN_MONSTER_SENTINEL|MONSTER_STATS_SENTINEL|BOSS_INTERNAL_SENTINEL|CAST_DM_ROLL_SENTINEL|CAST_MAP_SENTINEL/);
  });

  it('isolates player-private state while retaining own state and DM administration', async () => {
    const server = await createPolicyServer();
    servers.push(server);
    const aria = await connect(server, { role: 'player', characterId: 1 });
    const brom = await connect(server, { role: 'player', characterId: 2 });
    const dm = await connect(server, { role: 'dm' });

    server.delivery.character(2, 'whisper_received', { message: 'BROM_WHISPER_SENTINEL' });
    expect(server.delivery.socketId(aria.client.id, 'blind_roll_result', {
      characterId: 2,
      result: 'BROM_BLIND_RESULT_SENTINEL',
    })).toBe(false);
    server.delivery.dm('pending_imports_sync', [{ incomingData: 'DM_IMPORT_SENTINEL' }]);
    server.delivery.dm('roll_feed_event', { detail: 'DM_ROLL_SENTINEL' });
    await delay();

    const ariaParty = aria.events.find(({ event }) => event === 'party_state').payload;
    expect(ariaParty[0].inventory).toEqual([{ name: 'ARIA_PRIVATE_SENTINEL' }]);
    expect(ariaParty[1].inventory).toBeUndefined();
    expect(JSON.stringify(aria.events)).not.toMatch(/BROM_PRIVATE_SENTINEL|BROM_NOTES_SENTINEL|BROM_TIMELINE_SENTINEL|BROM_WHISPER_SENTINEL|BROM_BLIND_RESULT_SENTINEL|DM_IMPORT_SENTINEL|DM_ROLL_SENTINEL/);
    expect(brom.events.some(({ event, payload }) => event === 'whisper_received' && payload.message === 'BROM_WHISPER_SENTINEL')).toBe(true);
    expect(dm.events.some(({ event, payload }) => event === 'pending_imports_sync' && payload[0].incomingData === 'DM_IMPORT_SENTINEL')).toBe(true);
    expect(dm.events.some(({ event, payload }) => event === 'roll_feed_event' && payload.detail === 'DM_ROLL_SENTINEL')).toBe(true);
    expect(dm.events.some(({ event, payload }) => event === 'notes_state' && payload[0].text === 'DM_NOTES_SENTINEL')).toBe(true);
    expect(dm.events.some(({ event, payload }) => event === 'permissions_state' && payload.dm_secret === 'PERMISSIONS_SENTINEL')).toBe(true);
    expect(dm.events.some(({ event, payload }) => event === 'approval_mode' && payload === true)).toBe(true);
    expect(aria.events.some(({ event, payload }) => event === 'party_loot_state' && payload[0].name === 'SHARED_LOOT_SENTINEL')).toBe(true);
    const dmParty = dm.events.find(({ event }) => event === 'party_state').payload;
    expect(dmParty[0].inventory[0].name).toBe('ARIA_PRIVATE_SENTINEL');
    expect(dmParty[1].inventory[0].name).toBe('BROM_PRIVATE_SENTINEL');
    expectNoEvent(aria.events, 'pending_imports_sync', /DM_IMPORT_SENTINEL/);
  });

  it('requires authenticated DM room membership for DM-room delivery', async () => {
    const server = await createPolicyServer();
    servers.push(server);
    const dmOutsideRoom = await connect(server, { role: 'dm', skipDmRoom: true });
    dmOutsideRoom.events.length = 0;

    expect(server.delivery.dm('pending_imports_sync', [{ incomingData: 'ROOM_SENTINEL' }])).toBe(0);
    await delay();

    expectNoEvent(dmOutsideRoom.events, 'pending_imports_sync', /ROOM_SENTINEL/);
  });

  it('limits voice state and signaling to authenticated voice-room members', async () => {
    const server = await createPolicyServer();
    servers.push(server);
    const member = await connect(server, { role: 'player', characterId: 1, voiceRoom: true });
    const outsider = await connect(server, { role: 'player', characterId: 2 });
    member.events.length = 0;
    outsider.events.length = 0;

    expect(server.delivery.broadcast('voice_room_state', [{ playerName: 'VOICE_ROOM_SENTINEL' }])).toBe(1);
    expect(server.delivery.socketId(outsider.client.id, 'voice_offer', { offer: 'OUTSIDER_SIGNAL_SENTINEL' })).toBe(false);
    await delay();

    expect(member.events.some(({ event }) => event === 'voice_room_state')).toBe(true);
    expectNoEvent(outsider.events, 'voice_room_state', /VOICE_ROOM_SENTINEL/);
    expectNoEvent(outsider.events, 'voice_offer', /OUTSIDER_SIGNAL_SENTINEL/);
  });

  it('requires every reconnect to re-prove a role without an unauthenticated state window', async () => {
    const server = await createPolicyServer();
    servers.push(server);
    const client = server.connect();
    const events = collectEvents(client);
    clients.push(client);

    await new Promise(resolve => client.once('connect', resolve));
    await delay();
    expect(JSON.stringify(events)).not.toMatch(/SENTINEL/);

    client.disconnect();
    events.length = 0;
    client.auth = { role: 'player', characterId: 1 };
    client.connect();
    await new Promise(resolve => client.once('connect', resolve));
    await delay();
    expect(events.some(({ event }) => event === 'party_state')).toBe(true);

    client.disconnect();
    events.length = 0;
    client.auth = {};
    client.connect();
    await new Promise(resolve => client.once('connect', resolve));
    server.delivery.broadcast('party_state', [{ id: 2, notes: 'RECONNECT_SENTINEL' }]);
    await delay();
    expectNoEvent(events, 'party_state', /RECONNECT_SENTINEL/);
  });

  it('fails closed for an unknown outbound event for every role', async () => {
    const server = await createPolicyServer();
    servers.push(server);
    const recipients = await Promise.all([
      connect(server),
      connect(server, { role: 'cast' }),
      connect(server, { role: 'player', characterId: 1 }),
      connect(server, { role: 'dm' }),
    ]);
    recipients.forEach(({ events }) => { events.length = 0; });

    expect(server.delivery.broadcast('future_campaign_state', { secret: 'UNKNOWN_SENTINEL' })).toBe(0);
    await delay();

    for (const { events } of recipients) {
      expectNoEvent(events, 'future_campaign_state', /UNKNOWN_SENTINEL/);
    }
  });
});

describe('production outbound event policy coverage', () => {
  it('routes every production outbound literal through the centralized policy', () => {
    const serverRoot = path.join(TEST_DIRECTORY, '..');
    const collectJavaScript = directory => fs.readdirSync(directory, { withFileTypes: true })
      .flatMap(entry => {
        if (['node_modules', 'test', 'scripts'].includes(entry.name)) return [];
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectJavaScript(entryPath);
        if (!entry.name.endsWith('.js') || entryPath.endsWith('outboundSocketPolicy.js')) return [];
        return [entryPath];
      });
    const productionFiles = collectJavaScript(serverRoot);
    const sources = productionFiles.map(file => fs.readFileSync(file, 'utf8'));
    const productionEvents = sources.flatMap(source => [
      ...[...source.matchAll(/egress\.(?:broadcast|dm)\(\s*['"]([^'"]+)['"]/g)].map(match => match[1]),
      ...[...source.matchAll(/egress\.(?:send|character|socketId|except)\(\s*[^,\n]+,\s*['"]([^'"]+)['"]/g)].map(match => match[1]),
    ]);
    const dynamicPolicyEvents = [
      'authorization_error',
      'dm_note_created',
      'dm_note_deleted',
      'dm_note_updated',
    ];

    expect(productionEvents.length).toBeGreaterThan(0);
    expect([...new Set([...productionEvents, ...dynamicPolicyEvents])].sort())
      .toEqual(Object.keys(OUTBOUND_EVENT_POLICIES).sort());
    for (const source of sources) {
      expect(source).not.toMatch(/\b(?:io|socket|connectedSocket)\.(?:to\([^\n]+\)\.)?(?:broadcast\.)?emit\s*\(/);
    }
  });
});
