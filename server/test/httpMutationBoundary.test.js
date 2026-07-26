'use strict';

import { describe, expect, it } from 'vitest';
import { createTestDb, insertCharacter } from './helpers/testDb.js';
import { createHttpMutationBoundary } from '../lib/httpMutationBoundary.js';
import { getCampaignVersion } from '../lib/processedCommands.js';

function responseHarness() {
  return {
    statusCode: 200,
    headers: {},
    headersSent: false,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

describe('httpMutationBoundary', () => {
  it('commits a synchronous REST mutation and replays its response exactly once', () => {
    const db = createTestDb();
    const characterId = insertCharacter(db, { current_hp: 20, max_hp: 20 });
    const boundary = createHttpMutationBoundary({ db });
    const request = {
      method: 'PATCH',
      originalUrl: `/api/characters/${characterId}/hp`,
      headers: { 'idempotency-key': 'rest-hp-1' },
      body: { delta: -5 },
    };
    let executions = 0;
    const run = () => {
      const response = responseHarness();
      boundary(request, response, () => {
        executions += 1;
        db.prepare('UPDATE characters SET current_hp = current_hp - 5 WHERE id = ?').run(characterId);
        response.json({ success: true, hp: 15 });
      });
      return response;
    };

    const first = run();
    const replay = run();

    expect(executions).toBe(1);
    expect(db.prepare('SELECT current_hp FROM characters WHERE id = ?').get(characterId).current_hp).toBe(15);
    expect(getCampaignVersion(db)).toBe(1);
    expect(first.body).toEqual({ success: true, hp: 15 });
    expect(replay.body).toEqual(first.body);
    expect(replay.headers['Idempotency-Replayed']).toBe('true');
  });

  it('rolls back mutations when a synchronous handler returns a server error', () => {
    const db = createTestDb();
    const characterId = insertCharacter(db, { current_hp: 20, max_hp: 20 });
    const boundary = createHttpMutationBoundary({ db });
    const response = responseHarness();

    boundary({
      method: 'PATCH',
      originalUrl: `/api/characters/${characterId}/hp`,
      headers: { 'idempotency-key': 'rest-failure-1' },
      body: { delta: -5 },
    }, response, () => {
      db.prepare('UPDATE characters SET current_hp = 0 WHERE id = ?').run(characterId);
      response.status(500).json({ error: 'simulated failure' });
    });

    expect(response.statusCode).toBe(500);
    expect(db.prepare('SELECT current_hp FROM characters WHERE id = ?').get(characterId).current_hp).toBe(20);
    expect(getCampaignVersion(db)).toBe(0);
  });
});
