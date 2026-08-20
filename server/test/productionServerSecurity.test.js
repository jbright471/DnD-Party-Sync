'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { io as SocketClient } from 'socket.io-client';
import { insertCharacter } from './helpers/testDb.js';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.join(TEST_DIRECTORY, '..');
const ALLOWED_ORIGIN = 'https://ally.example.test';
const DM_PIN = 'correct-horse-42';

function delay(milliseconds = 100) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function onceWithTimeout(emitter, event, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    emitter.once(event, (...args) => {
      clearTimeout(timeout);
      resolve(args.length > 1 ? args : args[0]);
    });
  });
}

function startProductionServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: SERVER_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
      DB_PATH: databasePath,
      DM_PIN,
      ALLOWED_ORIGINS: ALLOWED_ORIGIN,
      HTTP_JSON_LIMIT: '1kb',
      SOCKET_MAX_MESSAGE_BYTES: '4096',
      DM_AUTH_MAX_ATTEMPTS: '2',
      DM_AUTH_WINDOW_MS: '60000',
      SOCKET_CONNECTION_MAX_ATTEMPTS: '100',
      SOCKET_EVENT_MAX_MESSAGES: '6',
      SOCKET_EVENT_WINDOW_MS: '60000',
      DISABLE_SCHEDULED_JOBS: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${stderr}`)), 10_000);
    child.stdout.on('data', chunk => {
      const match = chunk.toString().match(/localhost:(\d+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve({ baseUrl: `http://127.0.0.1:${match[1]}`, port: Number(match[1]) });
    });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before readiness (${code}): ${stderr}`));
    });
  });

  return { child, ready, stderr: () => stderr };
}

async function stopChild(child) {
  if (child.exitCode != null) return;
  const exited = onceWithTimeout(child, 'exit', 5_000).catch(() => null);
  child.kill();
  await exited;
}

function request(baseUrl, pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      Origin: ALLOWED_ORIGIN,
      ...(options.headers || {}),
    },
  });
}

async function connectSocket(baseUrl, { auth = {}, origin = ALLOWED_ORIGIN } = {}) {
  const socket = SocketClient(baseUrl, {
    autoConnect: false,
    auth,
    extraHeaders: origin ? { Origin: origin } : {},
    forceNew: true,
    reconnection: false,
    transports: ['polling'],
  });
  const events = [];
  socket.onAny((event, payload) => events.push({ event, payload }));
  socket.connect();
  await onceWithTimeout(socket, 'connect');
  await delay();
  return { socket, events };
}

describe('actual production server security integration', () => {
  let temporaryRoot;
  let databasePath;
  let processHandle;
  let baseUrl;
  let dmToken;
  let ariaId;
  let bromId;
  let ariaGrant;
  let bromGrant;
  let castGrant;
  const clients = [];

  beforeAll(async () => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arcane-ally-r1d-'));
    databasePath = path.join(temporaryRoot, 'integration.db');
    processHandle = startProductionServer(databasePath);
    ({ baseUrl } = await processHandle.ready);

    const db = new Database(databasePath);
    ariaId = Number(insertCharacter(db, { name: 'Aria' }));
    bromId = Number(insertCharacter(db, { name: 'Brom' }));
    db.prepare('UPDATE characters SET inventory = ? WHERE id = ?')
      .run(JSON.stringify([{ name: 'ARIA_PRIVATE_SENTINEL' }]), ariaId);
    db.prepare('UPDATE characters SET inventory = ? WHERE id = ?')
      .run(JSON.stringify([{ name: 'BROM_PRIVATE_SENTINEL' }]), bromId);
    db.prepare("INSERT INTO party_notes (title, content) VALUES ('Secret', 'DM_NOTE_SENTINEL')").run();
    db.prepare(`
      INSERT INTO quests (title, description, dm_secrets, is_public, rewards)
      VALUES ('Hidden integration quest', 'HIDDEN_DESCRIPTION_SENTINEL', 'HIDDEN_SECRET_SENTINEL', 0, '')
    `).run();
    db.close();

    const authResponse = await request(baseUrl, '/api/auth/dm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: DM_PIN }),
    });
    ({ token: dmToken } = await authResponse.json());
    const grantHeaders = {
      authorization: `Bearer ${dmToken}`,
      'content-type': 'application/json',
    };
    ariaGrant = await request(baseUrl, '/api/access-grants/player', {
      method: 'POST', headers: grantHeaders, body: JSON.stringify({ characterId: ariaId }),
    }).then(response => response.json());
    bromGrant = await request(baseUrl, '/api/access-grants/player', {
      method: 'POST', headers: grantHeaders, body: JSON.stringify({ characterId: bromId }),
    }).then(response => response.json());
    castGrant = await request(baseUrl, '/api/access-grants/cast', {
      method: 'POST', headers: grantHeaders, body: JSON.stringify({}),
    }).then(response => response.json());
  }, 20_000);

  afterAll(async () => {
    clients.forEach(client => client.disconnect());
    await stopChild(processHandle.child);
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });

  it('refuses insecure production startup before opening a listener', () => {
    const insecureDatabase = path.join(temporaryRoot, 'insecure.db');
    const result = spawnSync(process.execPath, ['server.js'], {
      cwd: SERVER_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: '0',
        DB_PATH: insecureDatabase,
        DM_PIN: '',
        ALLOWED_ORIGINS: '',
        DISABLE_SCHEDULED_JOBS: 'true',
      },
      encoding: 'utf8',
      timeout: 5_000,
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/DM_PIN/);
    expect(fs.existsSync(insecureDatabase)).toBe(false);
  });

  it('rejects unauthenticated REST reads, writes, exports, files, AI, and hidden-state switches without side effects', async () => {
    const cases = [
      ['character read', '/api/characters'],
      ['case-variant character read', '/API/characters'],
      ['encounter export', '/api/encounters/999/export'],
      ['map file', '/api/maps/file/UNAUTHENTICATED_FILE_SENTINEL.png'],
      ['hidden quest query', '/api/quests?isDm=true'],
      ['offline character bundle', `/api/offline-bundle?characterId=${ariaId}`],
    ];

    for (const [_label, pathname] of cases) {
      const response = await request(baseUrl, pathname);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'REST_DM_REQUIRED' });
    }

    for (const pathname of ['/api/chat', '/api/lore']) {
      const response = await request(baseUrl, pathname, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'REST_DM_REQUIRED' });
    }

    const verificationDb = new Database(databasePath, { readonly: true });
    const before = verificationDb
      .prepare("SELECT COUNT(*) AS count FROM quests WHERE title = 'UNAUTHENTICATED_WRITE_SENTINEL'")
      .get().count;
    const deniedWrite = await request(baseUrl, '/api/quests?dmToken=QUERY_TOKEN_SENTINEL&role=dm&isDm=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dm-pin': DM_PIN, 'x-role': 'dm' },
      body: JSON.stringify({
        title: 'UNAUTHENTICATED_WRITE_SENTINEL',
        isDm: true,
        role: 'dm',
      }),
    });
    expect(deniedWrite.status).toBe(401);
    const after = verificationDb
      .prepare("SELECT COUNT(*) AS count FROM quests WHERE title = 'UNAUTHENTICATED_WRITE_SENTINEL'")
      .get().count;
    const hiddenQuest = verificationDb
      .prepare("SELECT dm_secrets FROM quests WHERE title = 'Hidden integration quest'")
      .get();
    verificationDb.close();
    expect(after).toBe(before);
    expect(hiddenQuest.dm_secrets).toBe('HIDDEN_SECRET_SENTINEL');
  });

  it('forbids player and cast grants from REST and denies unclassified API paths', async () => {
    for (const grant of [ariaGrant, castGrant]) {
      const response = await request(baseUrl, '/api/characters', {
        headers: { authorization: `Bearer ${grant.token}` },
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'REST_DM_REQUIRED' });
    }

    const deniedPlayerWrite = await request(baseUrl, '/api/quests', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ariaGrant.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'PLAYER_REST_WRITE_SENTINEL' }),
    });
    expect(deniedPlayerWrite.status).toBe(403);

    for (const headers of [{}, { authorization: `Bearer ${dmToken}` }]) {
      const response = await request(
        baseUrl,
        '/api/future-private/TOKEN_PATH_SENTINEL?token=QUERY_SECRET_SENTINEL',
        { headers },
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'REST_ROUTE_UNCLASSIFIED' });
    }

    const db = new Database(databasePath, { readonly: true });
    expect(db.prepare("SELECT COUNT(*) AS count FROM quests WHERE title = 'PLAYER_REST_WRITE_SENTINEL'").get().count).toBe(0);
    const rows = db.prepare(`
      SELECT event_type, actor_role, route_class, outcome, source_address, reason_code
      FROM security_audit_events
      WHERE event_type = 'rest_authorization_denied'
      ORDER BY id
    `).all();
    db.close();
    expect(rows.some(row => row.actor_role === 'player' && row.reason_code === 'access_grant_forbidden')).toBe(true);
    expect(rows.some(row => row.actor_role === 'cast' && row.reason_code === 'access_grant_forbidden')).toBe(true);
    expect(rows.some(row => row.route_class === 'unclassified_api')).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/TOKEN_PATH_SENTINEL|QUERY_SECRET_SENTINEL|QUERY_TOKEN_SENTINEL|correct-horse-42/);
  });

  it('keeps only bootstrap endpoints public and honors valid, invalid, and revoked DM sessions', async () => {
    const health = await request(baseUrl, '/api/health');
    expect(health.status).toBe(200);

    const bearerAccess = await request(baseUrl, '/api/characters', {
      headers: { authorization: `Bearer ${dmToken}` },
    });
    const compatibilityAccess = await request(baseUrl, '/api/characters', {
      headers: { 'x-dm-token': dmToken },
    });
    const invalidAccess = await request(baseUrl, '/api/characters', {
      headers: { authorization: 'Bearer INVALID_DM_TOKEN_SENTINEL' },
    });
    expect(bearerAccess.status).toBe(200);
    expect(compatibilityAccess.status).toBe(200);
    expect(invalidAccess.status).toBe(401);

    const priorToken = dmToken;
    const replacement = await request(baseUrl, '/api/auth/dm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: DM_PIN }),
    }).then(response => response.json());
    dmToken = replacement.token;

    const revokedAccess = await request(baseUrl, '/api/characters', {
      headers: { authorization: `Bearer ${priorToken}` },
    });
    const replacementAccess = await request(baseUrl, '/api/characters', {
      headers: { authorization: `Bearer ${dmToken}` },
    });
    expect(revokedAccess.status).toBe(401);
    expect(replacementAccess.status).toBe(200);
  });

  it('enforces HTTP origin, body-size, DM-auth rate, and redacted audit controls', async () => {
    const deniedOrigin = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://evil.example.test' },
    });
    const allowedOrigin = await request(baseUrl, '/api/health');
    const rawPinBypass = await request(baseUrl, '/api/dm-notes', {
      headers: { 'x-dm-pin': DM_PIN },
    });
    const oversized = await request(baseUrl, '/api/auth/dm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: 'OVERSIZED_PIN_SENTINEL'.repeat(100) }),
    });
    const firstFailure = await request(baseUrl, '/api/auth/dm', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: 'RAW_PIN_SENTINEL' }),
    });
    const secondFailure = await request(baseUrl, '/api/auth/dm', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: 'RAW_PIN_SENTINEL' }),
    });
    const rateLimited = await request(baseUrl, '/api/auth/dm', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: 'RAW_PIN_SENTINEL' }),
    });

    expect(deniedOrigin.status).toBe(403);
    expect(allowedOrigin.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
    expect(rawPinBypass.status).toBe(403);
    expect(oversized.status).toBe(413);
    expect([firstFailure.status, secondFailure.status, rateLimited.status]).toEqual([401, 401, 429]);
    expect(rateLimited.headers.get('retry-after')).toBeTruthy();

    const db = new Database(databasePath, { readonly: true });
    const rows = db.prepare('SELECT * FROM security_audit_events ORDER BY id').all();
    db.close();
    expect(rows.some(row => row.event_type === 'http_origin_denied')).toBe(true);
    expect(rows.some(row => row.event_type === 'dm_auth_rate_limited')).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/RAW_PIN_SENTINEL|OVERSIZED_PIN_SENTINEL|correct-horse-42/);
  });

  it('proves role isolation, revocation, reconnect, origin, message-rate, and size controls', async () => {
    const unauthenticated = await connectSocket(baseUrl);
    const cast = await connectSocket(baseUrl, {
      auth: { accessFlow: 'cast', accessToken: castGrant.token },
    });
    const aria = await connectSocket(baseUrl, {
      auth: { accessFlow: 'companion', accessToken: ariaGrant.token },
    });
    const brom = await connectSocket(baseUrl, {
      auth: { accessFlow: 'companion', accessToken: bromGrant.token },
    });
    const dm = await connectSocket(baseUrl);
    clients.push(unauthenticated.socket, cast.socket, aria.socket, brom.socket, dm.socket);

    const joined = onceWithTimeout(dm.socket, 'dm_room_joined');
    dm.socket.emit('dm_join_room', { dmToken });
    await joined;
    await delay();

    expect(JSON.stringify(unauthenticated.events)).not.toMatch(/party_state|DM_NOTE_SENTINEL|PRIVATE_SENTINEL/);
    expect([...new Set(cast.events.map(event => event.event))].sort()).toEqual([
      'combat_state_sync', 'initiative_state', 'party_state',
    ]);
    const ariaParty = aria.events.find(event => event.event === 'party_state').payload;
    expect(ariaParty.find(character => character.id === ariaId).inventory[0].name).toBe('ARIA_PRIVATE_SENTINEL');
    expect(ariaParty.find(character => character.id === bromId).inventory).toBeUndefined();
    expect(JSON.stringify(aria.events)).not.toMatch(/BROM_PRIVATE_SENTINEL|DM_NOTE_SENTINEL/);
    expect(dm.events.some(event => event.event === 'notes_state' && JSON.stringify(event.payload).includes('DM_NOTE_SENTINEL'))).toBe(true);

    const unknownDenied = onceWithTimeout(aria.socket, 'authorization_error');
    aria.socket.emit('future_unclassified_mutation', { token: 'PACKET_TOKEN_SENTINEL' });
    expect(await unknownDenied).toMatchObject({ code: 'SOCKET_EVENT_FORBIDDEN' });

    const rejectedOrigin = SocketClient(baseUrl, {
      autoConnect: false,
      extraHeaders: { Origin: 'https://evil.example.test' },
      forceNew: true,
      reconnection: false,
      transports: ['polling'],
    });
    rejectedOrigin.connect();
    await expect(onceWithTimeout(rejectedOrigin, 'connect_error')).resolves.toBeTruthy();
    rejectedOrigin.disconnect();

    const revokedNotice = onceWithTimeout(brom.socket, 'access_denied');
    const revokedDisconnect = onceWithTimeout(brom.socket, 'disconnect');
    const revokeResponse = await request(baseUrl, `/api/access-grants/${bromGrant.grant.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${dmToken}` },
    });
    expect(revokeResponse.status).toBe(200);
    await revokedNotice;
    await revokedDisconnect;
    const revokedClient = SocketClient(baseUrl, {
      autoConnect: false,
      auth: { accessFlow: 'companion', accessToken: bromGrant.token },
      extraHeaders: { Origin: ALLOWED_ORIGIN },
      forceNew: true,
      reconnection: false,
      transports: ['polling'],
    });
    revokedClient.connect();
    await expect(onceWithTimeout(revokedClient, 'connect_error')).resolves.toBeTruthy();
    revokedClient.disconnect();

    aria.socket.disconnect();
    aria.events.length = 0;
    aria.socket.auth = {};
    aria.socket.connect();
    await onceWithTimeout(aria.socket, 'connect');
    await delay();
    expect(aria.events.some(event => event.event === 'party_state')).toBe(false);

    const rateLimited = onceWithTimeout(dm.socket, 'authorization_error');
    for (let index = 0; index < 7; index += 1) dm.socket.emit('refresh_party');
    expect(await rateLimited).toMatchObject({ code: 'SOCKET_RATE_LIMITED' });

    const oversizedGrant = await request(baseUrl, '/api/access-grants/player', {
      method: 'POST',
      headers: { authorization: `Bearer ${dmToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ characterId: ariaId }),
    }).then(response => response.json());
    const oversizedClient = await connectSocket(baseUrl, {
      auth: { accessFlow: 'companion', accessToken: oversizedGrant.token },
    });
    clients.push(oversizedClient.socket);
    const oversizedDisconnect = onceWithTimeout(oversizedClient.socket, 'disconnect');
    oversizedClient.socket.emit('dice_roll', { blob: 'x'.repeat(10_000) });
    await oversizedDisconnect;

    const db = new Database(databasePath, { readonly: true });
    const rows = db.prepare('SELECT * FROM security_audit_events ORDER BY id').all();
    db.close();
    expect(rows.some(row => row.event_type === 'socket_authorization_denied')).toBe(true);
    expect(rows.some(row => row.event_type === 'socket_event_rate_limited')).toBe(true);
    expect(rows.some(row => row.event_type === 'access_grant_revoked')).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/PACKET_TOKEN_SENTINEL|access_token|correct-horse-42/);
  }, 30_000);
});
