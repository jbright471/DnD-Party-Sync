'use strict';

const crypto = require('crypto');
const { CommandConflictError, executeTransactionalCommand } = require('./processedCommands');

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function commandTypeFor(req) {
  const segments = String(req.originalUrl || req.url || req.path || '')
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map(segment => (/^\d+$/.test(segment) ? 'item' : segment.replace(/[^a-zA-Z0-9_]+/g, '_').toLowerCase()))
    .filter(Boolean);
  return ['http', String(req.method || 'post').toLowerCase(), ...segments].join('.');
}

function aggregateKeysFor(req) {
  const path = String(req.originalUrl || req.url || req.path || '').split('?')[0];
  const body = req.body || {};
  const keys = new Set();
  const patterns = [
    ['character', /\/characters\/(\d+)/],
    ['initiative', /\/initiative\/(\d+)/],
    ['encounter', /\/encounters\/(\d+)/],
    ['map', /\/maps\/(\d+)/],
    ['marker', /\/markers\/(\d+)/],
    ['npc', /\/npcs\/(\d+)/],
    ['loot', /\/loot\/(\d+)/],
    ['quest', /\/quests\/(\d+)/],
    ['note', /\/(?:dm-)?notes\/(\d+)/],
    ['automation', /\/automation\/(\d+)/],
    ['homebrew', /\/homebrew\/(\d+)/],
  ];
  for (const [kind, pattern] of patterns) {
    const match = path.match(pattern);
    if (match) keys.add(`${kind}:${Number(match[1])}`);
  }

  const bodyIds = [
    ['character', body.characterId],
    ['initiative', body.trackerId || body.entityId],
    ['encounter', body.encounterId],
    ['map', body.mapId],
    ['marker', body.markerId],
    ['loot', body.lootId],
    ['quest', body.questId],
    ['note', body.noteId],
  ];
  for (const [kind, id] of bodyIds) {
    if (id !== undefined && id !== null && Number.isFinite(Number(id))) keys.add(`${kind}:${Number(id)}`);
  }
  if (keys.size === 0) {
    const collection = path.split('/').filter(Boolean)[1] || 'campaign';
    keys.add(`collection:${collection}`);
  }
  return [...keys].sort();
}

function createHttpMutationBoundary({ db, afterCommit, shouldSkip, sessionId }) {
  return function httpMutationBoundary(req, res, next) {
    if (!MUTATION_METHODS.has(String(req.method || '').toUpperCase()) || shouldSkip?.(req)) return next();

    const body = req.body || {};
    const headers = req.headers || {};
    const commandId = String(headers['idempotency-key'] || body.commandId || body.requestId || crypto.randomUUID());
    const aggregateKeys = aggregateKeysFor(req);
    const expectedAggregateVersions = body.expectedAggregateVersions || {};
    const headerCampaignVersion = headers['x-expected-campaign-version'];
    const expectedCampaignVersion = body.expectedCampaignVersion
      ?? (headerCampaignVersion === undefined ? null : Number(headerCampaignVersion));
    req.commandId = commandId;

    const originalJson = res.json.bind(res);
    let captured = null;
    res.json = function captureJson(responseBody) {
      captured = { status: res.statusCode || 200, body: responseBody };
      return res;
    };

    try {
      const outcome = executeTransactionalCommand(db, {
        commandId,
        commandType: commandTypeFor(req),
        actorType: 'integration',
        actorId: null,
        sessionId: typeof sessionId === 'function' ? sessionId(req) : null,
        expectedCampaignVersion,
        aggregates: aggregateKeys.map(key => ({
          key,
          expectedVersion: expectedAggregateVersions[key] ?? null,
        })),
        payload: body,
      }, () => {
        next();
        if (!captured) {
          throw new CommandConflictError(
            'This asynchronous route must commit through an explicit transaction orchestrator',
            'ASYNC_COMMAND_BOUNDARY',
          );
        }
        if (captured.status >= 500) throw new Error(captured.body?.error || 'Mutation handler failed');
        const success = captured.status < 400 && captured.body?.success !== false;
        return {
          success,
          mutated: success,
          httpStatus: captured.status,
          response: captured.body,
        };
      }, {
        buildDelta: () => ({
          kind: commandTypeFor(req),
          scopes: ['party', 'initiative', 'timeline', 'action_log'],
          affectedAggregates: aggregateKeys,
        }),
        afterCommit,
      });

      const response = outcome.result || {};
      res.json = originalJson;
      res.setHeader?.('X-Command-ID', outcome.commandId);
      res.setHeader?.('X-Campaign-Version', String(outcome.campaignVersion));
      if (outcome.replayed) res.setHeader?.('Idempotency-Replayed', 'true');
      if (typeof res.status === 'function') res.status(response.httpStatus || 200);
      return originalJson(response.response);
    } catch (error) {
      res.json = originalJson;
      if (res.headersSent) return;
      const status = error instanceof CommandConflictError ? 409 : 500;
      if (typeof res.status === 'function') res.status(status);
      return originalJson({
        success: false,
        error: error.message,
        code: error.code || 'COMMAND_FAILED',
        details: error.details || undefined,
      });
    }
  };
}

function executePreparedHttpMutation(db, req, {
  aggregateKeys,
  commandType = commandTypeFor(req),
  execute,
  buildDelta,
  afterCommit,
}) {
  const body = req.body || {};
  const headers = req.headers || {};
  const commandId = String(headers['idempotency-key'] || body.commandId || body.requestId || crypto.randomUUID());
  const keys = [...new Set(aggregateKeys || aggregateKeysFor(req))].sort();
  const expectedAggregateVersions = body.expectedAggregateVersions || {};
  const headerCampaignVersion = headers['x-expected-campaign-version'];
  return executeTransactionalCommand(db, {
    commandId,
    commandType,
    actorType: 'integration',
    actorId: null,
    expectedCampaignVersion: body.expectedCampaignVersion
      ?? (headerCampaignVersion === undefined ? null : Number(headerCampaignVersion)),
    aggregates: keys.map(key => ({ key, expectedVersion: expectedAggregateVersions[key] ?? null })),
    payload: body,
  }, execute, {
    buildDelta: buildDelta || (() => ({
      kind: commandType,
      scopes: ['party', 'initiative', 'timeline', 'action_log'],
      affectedAggregates: keys,
    })),
    afterCommit,
  });
}

module.exports = {
  aggregateKeysFor,
  commandTypeFor,
  createHttpMutationBoundary,
  executePreparedHttpMutation,
};
