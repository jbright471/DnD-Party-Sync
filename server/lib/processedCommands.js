'use strict';

const crypto = require('crypto');

const CURRENT_SCHEMA_VERSION = '1.0.0';

class CommandConflictError extends Error {
  constructor(message, code = 'COMMAND_CONFLICT', details = null) {
    super(message);
    this.name = 'CommandConflictError';
    this.code = code;
    this.details = details;
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashPayload(payload) {
  return crypto.createHash('sha256').update(stableStringify(payload ?? null)).digest('hex');
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeAggregates(command) {
  const byKey = new Map();
  const add = (key, expectedVersion = null) => {
    if (typeof key !== 'string' || !key.trim()) return;
    const normalizedExpected = expectedVersion === undefined || expectedVersion === null
      ? null
      : Number(expectedVersion);
    if (normalizedExpected !== null && (!Number.isSafeInteger(normalizedExpected) || normalizedExpected < 0)) {
      throw new CommandConflictError(
        `Invalid expected version for aggregate ${key}`,
        'INVALID_COMMAND',
        { aggregateKey: key, expectedVersion },
      );
    }
    const existing = byKey.get(key);
    if (existing !== undefined && existing !== normalizedExpected) {
      throw new CommandConflictError(
        `Conflicting expected versions were supplied for aggregate ${key}`,
        'INVALID_COMMAND',
        { aggregateKey: key },
      );
    }
    byKey.set(key, normalizedExpected);
  };

  if (Array.isArray(command.aggregates)) {
    for (const aggregate of command.aggregates) add(aggregate?.key, aggregate?.expectedVersion);
  }
  if (Array.isArray(command.aggregateKeys)) {
    for (const key of command.aggregateKeys) add(key, command.expectedAggregateVersions?.[key]);
  }
  if (command.expectedAggregateVersions && typeof command.expectedAggregateVersions === 'object') {
    for (const [key, version] of Object.entries(command.expectedAggregateVersions)) add(key, version);
  }
  if (command.aggregateKey) add(command.aggregateKey, command.expectedVersion);

  return [...byKey.entries()]
    .map(([key, expectedVersion]) => ({ key, expectedVersion }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function validateCommand(command) {
  if (!command?.commandId || typeof command.commandId !== 'string' || !command.commandId.trim()) {
    throw new CommandConflictError('commandId is required', 'INVALID_COMMAND');
  }
  if (!command.commandType || typeof command.commandType !== 'string' || !command.commandType.trim()) {
    throw new CommandConflictError('commandType is required', 'INVALID_COMMAND');
  }
  if (command.expectedCampaignVersion !== undefined && command.expectedCampaignVersion !== null) {
    const version = Number(command.expectedCampaignVersion);
    if (!Number.isSafeInteger(version) || version < 0) {
      throw new CommandConflictError('expectedCampaignVersion must be a non-negative integer', 'INVALID_COMMAND');
    }
  }
}

function isRejected(result) {
  return result?.success === false || result?.mutation?.success === false;
}

function isSkipped(result) {
  return result?.mutated === false || result?.mutation?.mutated === false;
}

function readAggregateVersions(db, aggregates) {
  const select = db.prepare('SELECT version FROM aggregate_versions WHERE aggregate_key = ?');
  return Object.fromEntries(aggregates.map(({ key }) => [key, select.get(key)?.version ?? 0]));
}

function buildReplay(row) {
  const aggregateVersions = parseJson(row.aggregate_versions_json, {});
  const firstVersion = row.aggregate_version
    ?? aggregateVersions[Object.keys(aggregateVersions)[0]]
    ?? null;
  return {
    commandId: row.command_id,
    replayed: true,
    campaignVersion: row.campaign_version ?? 0,
    aggregateVersion: firstVersion,
    aggregateVersions,
    result: parseJson(row.result_json, null),
    stateDelta: parseJson(row.delta_json, null),
  };
}

/**
 * Execute a state-changing command exactly once.
 *
 * The mutation, receipt, affected aggregate versions, campaign clock, general
 * audit event, and reconnect delta are committed in one IMMEDIATE SQLite
 * transaction. Any side effect supplied as `afterCommit` runs once and only
 * after the transaction succeeds.
 */
function executeTransactionalCommand(db, command, execute, options = {}) {
  validateCommand(command);
  const aggregates = normalizeAggregates(command);
  const schemaVersion = command.schemaVersion || CURRENT_SCHEMA_VERSION;
  const expectedCampaignVersion = command.expectedCampaignVersion ?? null;
  const payloadHash = hashPayload(command.payload);

  const transaction = db.transaction(() => {
    const existing = db.prepare('SELECT * FROM processed_commands WHERE command_id = ?').get(command.commandId);
    if (existing) {
      if (existing.command_type !== command.commandType || existing.payload_hash !== payloadHash) {
        throw new CommandConflictError('Command ID was already used with a different payload');
      }
      return buildReplay(existing);
    }

    const campaignRow = db.prepare('SELECT version FROM campaign_clock WHERE id = 1').get();
    const currentCampaignVersion = campaignRow?.version ?? 0;
    if (expectedCampaignVersion !== null && Number(expectedCampaignVersion) !== currentCampaignVersion) {
      throw new CommandConflictError(
        `Expected campaign version ${expectedCampaignVersion}, received ${currentCampaignVersion}`,
        'STALE_CAMPAIGN_VERSION',
        { expectedVersion: Number(expectedCampaignVersion), actualVersion: currentCampaignVersion },
      );
    }

    const beforeVersions = readAggregateVersions(db, aggregates);
    for (const { key, expectedVersion } of aggregates) {
      if (expectedVersion !== null && expectedVersion !== beforeVersions[key]) {
        throw new CommandConflictError(
          `Expected aggregate ${key} at version ${expectedVersion}, received ${beforeVersions[key]}`,
          'STALE_AGGREGATE_VERSION',
          { aggregateKey: key, expectedVersion, actualVersion: beforeVersions[key] },
        );
      }
    }

    const firstAggregate = aggregates[0] || null;
    db.prepare(`
      INSERT INTO processed_commands
        (command_id, command_type, actor_type, actor_id, session_id, aggregate_key,
         expected_version, expected_campaign_version, payload_hash, status, schema_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?)
    `).run(
      command.commandId,
      command.commandType,
      command.actorType || 'unknown',
      command.actorId === undefined || command.actorId === null ? null : String(command.actorId),
      command.sessionId ?? null,
      firstAggregate?.key ?? null,
      firstAggregate?.expectedVersion ?? null,
      expectedCampaignVersion,
      payloadHash,
      schemaVersion,
    );

    const result = execute({
      campaignVersion: currentCampaignVersion,
      aggregateVersions: { ...beforeVersions },
    });
    const rejected = isRejected(result);
    const skipped = isSkipped(result);
    const mutated = !rejected && !skipped;
    const campaignVersion = mutated ? currentCampaignVersion + 1 : currentCampaignVersion;
    const afterVersions = {};

    const upsertVersion = db.prepare(`
      INSERT INTO aggregate_versions (aggregate_key, version, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(aggregate_key) DO UPDATE SET
        version = excluded.version,
        updated_at = excluded.updated_at
    `);
    const insertCommandAggregate = db.prepare(`
      INSERT INTO command_aggregates
        (command_id, aggregate_key, expected_version, before_version, after_version)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const { key, expectedVersion } of aggregates) {
      const afterVersion = mutated ? beforeVersions[key] + 1 : beforeVersions[key];
      afterVersions[key] = afterVersion;
      if (mutated) upsertVersion.run(key, afterVersion);
      insertCommandAggregate.run(
        command.commandId,
        key,
        expectedVersion,
        beforeVersions[key],
        afterVersion,
      );
    }

    if (mutated) {
      db.prepare(`
        UPDATE campaign_clock
        SET version = ?, updated_at = datetime('now')
        WHERE id = 1
      `).run(campaignVersion);
    }

    const changes = mutated
      ? (options.buildDelta?.(result, {
          campaignVersion,
          aggregateVersions: { ...afterVersions },
        }) ?? command.delta ?? {
          kind: command.commandType,
          affectedAggregates: Object.keys(afterVersions),
        })
      : null;
    const stateDelta = mutated ? {
      schemaVersion,
      campaignVersion,
      commandId: command.commandId,
      commandType: command.commandType,
      aggregateVersions: afterVersions,
      changes,
    } : null;
    const status = rejected ? 'rejected' : skipped ? 'skipped' : 'committed';

    db.prepare(`
      INSERT INTO command_audit_events
        (command_id, command_type, actor_type, actor_id, status, campaign_version,
         aggregates_json, payload_json, result_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      command.commandId,
      command.commandType,
      command.actorType || 'unknown',
      command.actorId === undefined || command.actorId === null ? null : String(command.actorId),
      status,
      campaignVersion,
      JSON.stringify(afterVersions),
      JSON.stringify(command.payload ?? null),
      JSON.stringify(result ?? null),
    );

    if (stateDelta) {
      db.prepare(`
        INSERT INTO state_deltas
          (campaign_version, command_id, schema_version, command_type, aggregates_json, delta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        campaignVersion,
        command.commandId,
        schemaVersion,
        command.commandType,
        JSON.stringify(afterVersions),
        JSON.stringify(changes),
      );
    }

    const firstVersion = firstAggregate ? afterVersions[firstAggregate.key] : null;
    db.prepare(`
      UPDATE processed_commands
      SET status = ?, result_json = ?, aggregate_version = ?, campaign_version = ?,
          aggregate_versions_json = ?, delta_json = ?, committed_at = datetime('now')
      WHERE command_id = ?
    `).run(
      status,
      JSON.stringify(result ?? null),
      firstVersion,
      campaignVersion,
      JSON.stringify(afterVersions),
      stateDelta ? JSON.stringify(stateDelta) : null,
      command.commandId,
    );

    return {
      commandId: command.commandId,
      replayed: false,
      campaignVersion,
      aggregateVersion: firstVersion,
      aggregateVersions: afterVersions,
      result,
      stateDelta,
    };
  });

  const outcome = transaction.immediate();
  if (!outcome.replayed && outcome.stateDelta) options.afterCommit?.(outcome);
  return outcome;
}

function executeProcessedCommand(db, command, execute, options = {}) {
  return executeTransactionalCommand(db, command, execute, options);
}

function getCampaignVersion(db) {
  return db.prepare('SELECT version FROM campaign_clock WHERE id = 1').get()?.version ?? 0;
}

function getAggregateVersions(db) {
  return Object.fromEntries(
    db.prepare('SELECT aggregate_key, version FROM aggregate_versions ORDER BY aggregate_key').all()
      .map(row => [row.aggregate_key, row.version]),
  );
}

function getStateDeltas(db, afterVersion = 0, limit = 250) {
  const normalizedAfter = Math.max(0, Number(afterVersion) || 0);
  const normalizedLimit = Math.min(1000, Math.max(1, Number(limit) || 250));
  return db.prepare(`
    SELECT * FROM state_deltas
    WHERE campaign_version > ?
    ORDER BY campaign_version ASC
    LIMIT ?
  `).all(normalizedAfter, normalizedLimit).map(row => ({
    schemaVersion: row.schema_version,
    campaignVersion: row.campaign_version,
    commandId: row.command_id,
    commandType: row.command_type,
    aggregateVersions: parseJson(row.aggregates_json, {}),
    changes: parseJson(row.delta_json, {}),
    createdAt: row.created_at,
  }));
}

function pruneProcessedCommands(db, { maxAgeDays = 30, maxRows = 50000, maxDeltas = 10000 } = {}) {
  db.prepare(`
    DELETE FROM processed_commands
    WHERE status IN ('committed', 'rejected', 'skipped')
      AND created_at < datetime('now', ?)
  `).run(`-${Math.max(1, Number(maxAgeDays) || 30)} days`);

  db.prepare(`
    DELETE FROM processed_commands
    WHERE command_id IN (
      SELECT command_id FROM processed_commands
      WHERE status IN ('committed', 'rejected', 'skipped')
      ORDER BY created_at DESC
      LIMIT -1 OFFSET ?
    )
  `).run(Math.max(1000, Number(maxRows) || 50000));

  db.prepare(`
    DELETE FROM state_deltas
    WHERE campaign_version IN (
      SELECT campaign_version FROM state_deltas
      ORDER BY campaign_version DESC
      LIMIT -1 OFFSET ?
    )
  `).run(Math.max(1000, Number(maxDeltas) || 10000));
}

module.exports = {
  CURRENT_SCHEMA_VERSION,
  CommandConflictError,
  executeProcessedCommand,
  executeTransactionalCommand,
  getAggregateVersions,
  getCampaignVersion,
  getStateDeltas,
  hashPayload,
  normalizeAggregates,
  pruneProcessedCommands,
  stableStringify,
  validateCommand,
};
