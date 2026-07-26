'use strict';

const crypto = require('crypto');
const { CommandConflictError, executeTransactionalCommand } = require('./processedCommands');

function aggregateKeysForSocket(eventName, payload = {}) {
  const keys = new Set();
  const add = (kind, value) => {
    if (value !== undefined && value !== null && Number.isFinite(Number(value))) keys.add(`${kind}:${Number(value)}`);
  };
  add('character', payload.characterId);
  add('initiative', payload.trackerId ?? payload.entityId);
  add('encounter', payload.encounterId);
  add('map', payload.mapId);
  add('marker', payload.markerId);
  add('loot', payload.lootId);
  add('note', payload.noteId);
  add('automation', payload.presetId ?? payload.auraId);
  for (const value of payload.characterIds || payload.targetCharacterIds || []) add('character', value);
  for (const target of payload.targets || []) {
    add(target?.type === 'monster' ? 'initiative' : 'character', target?.id);
  }
  if (keys.size === 0) keys.add(`socket:${eventName}`);
  return [...keys].sort();
}

function installSocketMutationBoundary(socket, {
  db,
  mutationEvents,
  afterCommit,
  actor,
  sessionId,
}) {
  const originalOn = socket.on.bind(socket);
  socket.on = function transactionalOn(eventName, listener) {
    if (!mutationEvents.has(eventName)) return originalOn(eventName, listener);
    return originalOn(eventName, (...args) => {
      const payload = args.find(value => value && typeof value === 'object' && !Array.isArray(value)) || {};
      const acknowledge = args.find(value => typeof value === 'function');
      const commandId = payload.commandId || payload.requestId || crypto.randomUUID();
      const aggregateKeys = aggregateKeysForSocket(eventName, payload);
      const expectedAggregateVersions = payload.expectedAggregateVersions || {};
      try {
        const outcome = executeTransactionalCommand(db, {
          commandId,
          commandType: `socket.${eventName}`,
          actorType: actor?.(socket, payload)?.type || 'unknown',
          actorId: actor?.(socket, payload)?.id ?? null,
          sessionId: sessionId?.() ?? null,
          expectedCampaignVersion: payload.expectedCampaignVersion ?? null,
          aggregates: aggregateKeys.map(key => ({
            key,
            expectedVersion: expectedAggregateVersions[key] ?? null,
          })),
          payload,
        }, () => {
          const beforeChanges = db.prepare('SELECT total_changes() AS count').get().count;
          const returned = listener(...args);
          if (returned && typeof returned.then === 'function') {
            throw new CommandConflictError(
              `Socket event ${eventName} must use an explicit async command boundary`,
              'ASYNC_COMMAND_BOUNDARY',
            );
          }
          const afterChanges = db.prepare('SELECT total_changes() AS count').get().count;
          const mutated = afterChanges > beforeChanges;
          return { success: true, mutated, eventName };
        }, {
          buildDelta: () => ({
            kind: `socket.${eventName}`,
            scopes: ['party', 'initiative', 'timeline', 'action_log'],
            affectedAggregates: aggregateKeys,
          }),
          afterCommit,
        });

        if (outcome.replayed) {
          const response = {
            success: true,
            commandId: outcome.commandId,
            replayed: true,
            campaignVersion: outcome.campaignVersion,
            aggregateVersions: outcome.aggregateVersions,
          };
          if (typeof acknowledge === 'function') acknowledge(response);
          socket.emit('command_result', response);
        }
        return outcome;
      } catch (error) {
        const response = {
          success: false,
          commandId,
          error: error.message,
          code: error.code || 'COMMAND_FAILED',
          details: error.details || undefined,
        };
        if (typeof acknowledge === 'function') acknowledge(response);
        socket.emit('command_result', response);
        return null;
      }
    });
  };
  return () => { socket.on = originalOn; };
}

module.exports = {
  aggregateKeysForSocket,
  installSocketMutationBoundary,
};
