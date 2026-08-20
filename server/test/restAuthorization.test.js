'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DM_REST_SURFACES,
  PUBLIC_REST_ROUTES,
  ROUTE_CLASS_IDS,
  classifyRestRoute,
  createRestAuthorizationMiddleware,
  readCredential,
} from '../lib/restAuthorization.js';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

describe('REST authorization policy', () => {
  it('has exactly two public method/path pairs', () => {
    expect(PUBLIC_REST_ROUTES).toEqual([
      { method: 'POST', path: '/api/auth/dm', routeClass: 'dm_auth' },
      { method: 'GET', path: '/api/health', routeClass: 'health' },
    ]);
    expect(classifyRestRoute('GET', '/api/auth/dm')).toMatchObject({
      access: 'dm', unauthenticatedStatus: 401,
    });
    expect(classifyRestRoute('POST', '/api/health')).toMatchObject({
      access: 'dm', unauthenticatedStatus: 401,
    });
  });

  it('preserves the established effect-preset denial status', () => {
    expect(classifyRestRoute('POST', '/api/effect-presets')).toMatchObject({
      access: 'dm', unauthenticatedStatus: 403,
    });
  });

  it('returns a controlled denial for wrong-method bootstrap requests', () => {
    const middleware = createRestAuthorizationMiddleware({
      authenticateDm: () => false,
      authenticateAccessGrant: () => null,
    });
    for (const [method, requestPath] of [['GET', '/api/auth/dm'], ['POST', '/api/health']]) {
      const response = {
        statusCode: null,
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(body) {
          this.body = body;
          return this;
        },
      };
      middleware({ method, path: requestPath, headers: {} }, response, () => {
        throw new Error('Wrong-method bootstrap request must not reach a handler.');
      });
      expect(response.statusCode).toBe(401);
      expect(response.body).toMatchObject({ code: 'REST_DM_REQUIRED' });
    }
  });

  it('does not let case variants bypass the API boundary', () => {
    const middleware = createRestAuthorizationMiddleware({
      authenticateDm: () => false,
      authenticateAccessGrant: () => null,
    });
    const response = {
      statusCode: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    };
    let reachedHandler = false;
    middleware({ method: 'GET', path: '/API/characters', headers: {} }, response, () => {
      reachedHandler = true;
    });
    expect(reachedHandler).toBe(false);
    expect(response.statusCode).toBe(401);
  });

  it('matches only explicit path boundaries and ignores query credential claims', () => {
    expect(classifyRestRoute('GET', '/api/characters')).toMatchObject({
      access: 'dm', routeClass: 'characters',
    });
    expect(classifyRestRoute('GET', '/api/characters/1')).toMatchObject({ routeClass: 'characters' });
    expect(classifyRestRoute('GET', '/api/characters-pretender')).toBeNull();
    expect(classifyRestRoute('GET', '/api/future-private')).toBeNull();
  });

  it('accepts only Bearer or X-DM-Token credentials and fails closed on ambiguity', () => {
    const request = headers => ({ headers });
    expect(readCredential(request({}))).toEqual({ state: 'missing', token: null });
    expect(readCredential(request({ authorization: 'Bearer server-token' }))).toEqual({
      state: 'present', token: 'server-token',
    });
    expect(readCredential(request({ 'x-dm-token': 'server-token' }))).toEqual({
      state: 'present', token: 'server-token',
    });
    expect(readCredential(request({ authorization: 'Basic caller-role-dm' }))).toEqual({
      state: 'invalid', token: null,
    });
    expect(readCredential(request({
      authorization: 'Bearer first-token',
      'x-dm-token': 'second-token',
    }))).toEqual({ state: 'invalid', token: null });
  });

  it('covers every production route mount and inline API literal with an allowlisted class', () => {
    const serverSource = fs.readFileSync(path.join(TEST_DIRECTORY, '..', 'server.js'), 'utf8');
    const routePattern = /app\.(use|get|post|put|patch|delete)\(\s*['"](\/api[^'"]*)['"]/g;
    const routes = [...serverSource.matchAll(routePattern)]
      .map(([, operation, routePath]) => ({ method: operation.toUpperCase(), routePath }));

    expect(routes.length).toBeGreaterThan(20);
    for (const route of routes) {
      const classification = classifyRestRoute(route.method, route.routePath);
      expect(classification, `${route.method} ${route.routePath}`).not.toBeNull();
      expect(ROUTE_CLASS_IDS.has(classification.routeClass)).toBe(true);
    }

    for (const surface of DM_REST_SURFACES) {
      expect(serverSource, surface.pathPrefix).toContain(`'${surface.pathPrefix}'`);
    }
  });
});
