'use strict';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'http';
import { createTestDb, insertCharacter } from './helpers/testDb.js';
import {
  bindSocketAccessGrant,
  createAccessGrantService,
  migrateAccessGrants,
} from '../lib/accessGrants.js';
import { createAccessGrantRouter } from '../routes/accessGrants.js';

function startHttpServer(db, service) {
  const app = express();
  app.use(express.json());
  app.use('/api/access-grants', createAccessGrantRouter({
    db,
    service,
    requireDm: token => token === 'valid-dm-token',
  }));

  const server = http.createServer(app);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}/api/access-grants`,
        close: () => new Promise(done => server.close(done)),
      });
    });
  });
}

describe('access grant credential foundation', () => {
  let db;
  let service;

  beforeEach(() => {
    db = createTestDb();
    migrateAccessGrants(db);
    service = createAccessGrantService(db);
  });

  afterEach(() => db.close());

  it('persists only a SHA-256 digest, never the raw 256-bit token', () => {
    const characterId = insertCharacter(db);

    const issued = service.createGrant({ role: 'player', characterId });
    const row = db.prepare('SELECT * FROM access_grants WHERE id = ?').get(issued.grant.id);

    expect(Buffer.from(issued.token, 'base64url')).toHaveLength(32);
    expect(row.token_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(row)).not.toContain(issued.token);
  });

  it('binds a player grant to its one server-verified character scope', () => {
    const ownedCharacterId = insertCharacter(db, { name: 'Owned' });
    const otherCharacterId = insertCharacter(db, { name: 'Other' });
    const issued = service.createGrant({ role: 'player', characterId: ownedCharacterId });
    const socket = {
      handshake: {
        auth: {
          accessToken: issued.token,
          role: 'dm',
          characterId: otherCharacterId,
        },
      },
    };

    const binding = bindSocketAccessGrant(socket, service);

    expect(binding).toMatchObject({ role: 'player', characterId: ownedCharacterId });
    expect(socket.accessGrant).toMatchObject({ role: 'player', characterId: ownedCharacterId });
  });

  it('keeps cast grants read-only and distinct from player grants', () => {
    const characterId = insertCharacter(db);
    const player = service.createGrant({ role: 'player', characterId });
    const cast = service.createGrant({ role: 'cast' });

    expect(service.authenticate(player.token)).toMatchObject({ role: 'player', characterId });
    expect(service.authenticate(cast.token)).toMatchObject({ role: 'cast', characterId: null });
    expect(service.authenticate(cast.token, { requiredRole: 'player' })).toBeNull();
  });

  it('rejects invalid and revoked tokens', () => {
    const characterId = insertCharacter(db);
    const issued = service.createGrant({ role: 'player', characterId });

    expect(service.authenticate('not-a-token')).toBeNull();
    service.revokeGrant(issued.grant.id);
    expect(service.authenticate(issued.token)).toBeNull();
  });

  it('rotates atomically so the prior bearer token is invalid immediately', () => {
    const characterId = insertCharacter(db);
    const original = service.createGrant({ role: 'player', characterId });

    const rotated = service.rotateGrant(original.grant.id);

    expect(service.authenticate(original.token)).toBeNull();
    expect(service.authenticate(rotated.token)).toMatchObject({
      role: 'player',
      characterId,
      rotatedFromId: original.grant.id,
    });
  });
});

describe('DM-only access grant administration', () => {
  let db;
  let service;
  let httpServer;

  beforeEach(async () => {
    db = createTestDb();
    migrateAccessGrants(db);
    service = createAccessGrantService(db);
    httpServer = await startHttpServer(db, service);
  });

  afterEach(async () => {
    await httpServer.close();
    db.close();
  });

  it('rejects grant creation without a valid DM session', async () => {
    const characterId = insertCharacter(db);

    const response = await fetch(`${httpServer.baseUrl}/player`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ characterId }),
    });

    expect(response.status).toBe(401);
    expect(db.prepare('SELECT COUNT(*) AS count FROM access_grants').get().count).toBe(0);
  });

  it('rejects grant listing, rotation, and revocation without a valid DM session', async () => {
    const characterId = insertCharacter(db);
    const issued = service.createGrant({ role: 'player', characterId });

    const [listResponse, rotateResponse, revokeResponse] = await Promise.all([
      fetch(httpServer.baseUrl),
      fetch(`${httpServer.baseUrl}/${issued.grant.id}/rotate`, { method: 'POST' }),
      fetch(`${httpServer.baseUrl}/${issued.grant.id}`, { method: 'DELETE' }),
    ]);

    expect([listResponse.status, rotateResponse.status, revokeResponse.status]).toEqual([401, 401, 401]);
    expect(service.authenticate(issued.token)).toMatchObject({ id: issued.grant.id });
  });

  it('creates scoped links for a DM and validates character scope server-side', async () => {
    const characterId = insertCharacter(db);
    const headers = {
      authorization: 'Bearer valid-dm-token',
      'content-type': 'application/json',
    };

    const invalidResponse = await fetch(`${httpServer.baseUrl}/player`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ characterId: 99999 }),
    });
    const response = await fetch(`${httpServer.baseUrl}/player`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ characterId }),
    });
    const payload = await response.json();

    expect(invalidResponse.status).toBe(404);
    expect(response.status).toBe(201);
    expect(payload.link).toMatch(new RegExp(`^/companion/${characterId}#access_token=`));
    expect(service.authenticate(payload.token)).toMatchObject({ role: 'player', characterId });
  });

  it('creates read-only cast grants and lets a DM rotate and revoke either role', async () => {
    const headers = {
      authorization: 'Bearer valid-dm-token',
      'content-type': 'application/json',
    };
    const encounterId = db.prepare(
      "INSERT INTO encounters (name, monsters) VALUES ('Test Encounter', '[]')",
    ).run().lastInsertRowid;
    const createdResponse = await fetch(`${httpServer.baseUrl}/cast`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ encounterId }),
    });
    const created = await createdResponse.json();
    const invalidScopeResponse = await fetch(`${httpServer.baseUrl}/cast`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ encounterId: 99999 }),
    });

    const rotatedResponse = await fetch(`${httpServer.baseUrl}/${created.grant.id}/rotate`, {
      method: 'POST',
      headers,
    });
    const rotated = await rotatedResponse.json();
    const rotatedGrant = service.authenticate(rotated.token);
    const revokeResponse = await fetch(`${httpServer.baseUrl}/${rotated.grant.id}`, {
      method: 'DELETE',
      headers,
    });

    expect(createdResponse.status).toBe(201);
    expect(invalidScopeResponse.status).toBe(404);
    expect(created.link).toMatch(new RegExp(`^/encounter/${encounterId}/cast#access_token=`));
    expect(service.authenticate(created.token)).toBeNull();
    expect(rotatedGrant).toMatchObject({ role: 'cast', encounterId });
    expect(revokeResponse.status).toBe(200);
    expect(service.authenticate(rotated.token)).toBeNull();
  });
});
