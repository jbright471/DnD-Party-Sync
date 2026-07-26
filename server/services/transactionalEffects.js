'use strict';

const crypto = require('crypto');
const { applyPartyEffect, resolveTargets } = require('./effects-engine');
const { validateContract } = require('../lib/automationContractRegistry');
const { CommandConflictError, executeTransactionalCommand } = require('../lib/processedCommands');

const SUPPORTED_EFFECT_TYPES = new Set([
  'damage',
  'heal',
  'condition',
  'remove_condition',
  'buff',
]);

function targetKey(target) {
  return target.type === 'monster' ? `initiative:${target.id}` : `character:${target.id}`;
}

function normalizeEffectCommand(input, context = {}) {
  const explicitEnvelope = input?.schemaVersion !== undefined || input?.payload !== undefined;
  const payload = explicitEnvelope ? input.payload : {
    targets: input?.targets,
    effects: input?.effects,
    actor: input?.actor,
  };
  const commandId = input?.commandId || input?.requestId || crypto.randomUUID();
  const command = {
    commandId,
    commandType: input?.commandType || 'effect.party.apply',
    schemaVersion: input?.schemaVersion || '1.0.0',
    expectedCampaignVersion: input?.expectedCampaignVersion ?? null,
    expectedAggregateVersions: input?.expectedAggregateVersions || {},
    actor: input?.actor && typeof input.actor === 'object'
      ? input.actor
      : { type: context.actorType || 'system', id: context.actorId ?? null },
    sessionId: input?.sessionId ?? context.sessionId ?? null,
    payload,
  };
  if (input?.extensions !== undefined) command.extensions = input.extensions;

  if (explicitEnvelope) {
    const validation = validateContract('command-envelope', command);
    if (!validation.valid) {
      throw new CommandConflictError(
        'Command envelope does not match automation contract v1',
        'INVALID_COMMAND_SCHEMA',
        { issues: validation.issues },
      );
    }
  }

  const targetsAreGroup = payload?.targets === 'party' || payload?.targets === 'enemies';
  if (!targetsAreGroup && (!Array.isArray(payload?.targets) || payload.targets.length === 0)) {
    throw new CommandConflictError('No targets specified', 'INVALID_COMMAND');
  }
  if (!Array.isArray(payload?.effects) || payload.effects.length === 0) {
    throw new CommandConflictError('No effects specified', 'INVALID_COMMAND');
  }
  for (const effect of payload.effects) {
    if (!effect || !SUPPORTED_EFFECT_TYPES.has(effect.type)) {
      throw new CommandConflictError(`Unsupported effect type: ${effect?.type || 'missing'}`, 'INVALID_COMMAND');
    }
  }

  return { command, explicitEnvelope };
}

function executeEffectCommand(db, input, context = {}, options = {}) {
  const { command, explicitEnvelope } = normalizeEffectCommand(input, context);
  const payload = command.payload;
  const resolvedTargets = resolveTargets(db, payload.targets === 'party'
    ? 'party'
    : payload.targets.map(target => ({ id: Number(target.id), type: target.type })));
  const uniqueTargets = [...new Map(resolvedTargets.map(target => [targetKey(target), target])).values()];
  if (uniqueTargets.length === 0) throw new CommandConflictError('No valid targets found', 'INVALID_COMMAND');
  if (Array.isArray(payload.targets)) {
    const requestedTargets = new Set(payload.targets.map(target => targetKey({
      id: Number(target.id),
      type: target.type === 'monster' ? 'monster' : 'character',
    })));
    if (uniqueTargets.length !== requestedTargets.size) {
      throw new CommandConflictError('One or more effect targets do not exist', 'INVALID_COMMAND');
    }
  }

  const affectedKeys = uniqueTargets.map(targetKey).sort();
  const suppliedKeys = Object.keys(command.expectedAggregateVersions || {});
  const unrelatedKey = suppliedKeys.find(key => !affectedKeys.includes(key));
  if (unrelatedKey) {
    throw new CommandConflictError(
      `Aggregate expectation ${unrelatedKey} is not affected by this command`,
      'INVALID_COMMAND',
    );
  }
  if (explicitEnvelope) {
    const missingKey = affectedKeys.find(key => command.expectedAggregateVersions[key] === undefined);
    if (missingKey) {
      throw new CommandConflictError(
        `Missing expected version for affected aggregate ${missingKey}`,
        'INVALID_COMMAND',
      );
    }
  }

  const actorName = payload.actor || context.actorName || command.actor?.id || 'System';
  return executeTransactionalCommand(db, {
    commandId: command.commandId,
    commandType: command.commandType,
    schemaVersion: command.schemaVersion,
    actorType: command.actor?.type || context.actorType || 'system',
    actorId: command.actor?.id ?? context.actorId ?? null,
    sessionId: command.sessionId,
    expectedCampaignVersion: command.expectedCampaignVersion,
    aggregates: affectedKeys.map(key => ({
      key,
      expectedVersion: command.expectedAggregateVersions[key] ?? null,
    })),
    payload,
  }, () => {
    const records = applyPartyEffect(
      db,
      payload.effects,
      uniqueTargets.map(({ id, type }) => ({ id, type })),
      actorName,
      context.sessionRound || 0,
      context.turnIndex || 0,
      context.phase || 'action',
      context.sourcePresetId || null,
      command.commandId,
    );
    const failure = records.find(record => !record.success);
    if (failure) throw new Error(failure.logMessage || 'An effect target could not be updated');
    if (records.length === 0) return { success: false, mutated: false, error: 'No effects were applied' };

    const summary = records.map(record => record.logMessage).join(' | ');
    db.prepare(`
      INSERT INTO action_log (timestamp, actor, action_description, status)
      VALUES (datetime('now'), ?, ?, 'applied')
    `).run(actorName, `Party effect applied — ${summary}`);
    return { success: true, groupId: command.commandId, records };
  }, {
    buildDelta: result => ({
      kind: 'effects_applied',
      scopes: ['party', 'initiative', 'timeline', 'action_log'],
      targets: uniqueTargets.map(target => ({ id: target.id, type: target.type })),
      effects: result.records.map(record => ({
        targetId: record.targetId,
        eventType: record.eventType,
        success: record.success,
      })),
    }),
    afterCommit: options.afterCommit,
  });
}

module.exports = {
  executeEffectCommand,
  normalizeEffectCommand,
  targetKey,
};
