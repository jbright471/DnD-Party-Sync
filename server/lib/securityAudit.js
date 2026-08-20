'use strict';

const { ROUTE_CLASS_IDS } = require('./restAuthorization');

const SECURITY_EVENT_TYPES = new Set([
  'access_grant_created',
  'access_grant_revoked',
  'access_grant_rotated',
  'dm_auth_denied',
  'dm_auth_rate_limited',
  'dm_auth_succeeded',
  'http_origin_denied',
  'rest_authorization_denied',
  'socket_authorization_denied',
  'socket_connection_rate_limited',
  'socket_event_rate_limited',
  'socket_origin_denied',
]);

const ACTOR_ROLES = new Set(['dm', 'player', 'cast', 'unauthenticated', 'system']);
const OUTCOMES = new Set(['allowed', 'denied']);

function migrateSecurityAudit(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_audit_events (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type     TEXT NOT NULL,
      actor_role     TEXT NOT NULL,
      subject_id     TEXT,
      outcome        TEXT NOT NULL,
      route_class    TEXT,
      source_address TEXT,
      reason_code    TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_security_audit_created
      ON security_audit_events (created_at DESC, id DESC);
  `);
  const columns = new Set(db.prepare('PRAGMA table_info(security_audit_events)').all().map(column => column.name));
  if (!columns.has('route_class')) {
    db.exec('ALTER TABLE security_audit_events ADD COLUMN route_class TEXT');
  }
}

function safeOptionalText(value, maximumLength, pattern = /^[a-zA-Z0-9:._-]+$/) {
  if (value == null || value === '') return null;
  const normalized = String(value).slice(0, maximumLength);
  return pattern.test(normalized) ? normalized : null;
}

function createSecurityAuditWriter(db, { maxRows = 10_000 } = {}) {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 100_000) {
    throw new Error('Security audit maxRows must be an integer from 1 through 100000.');
  }
  migrateSecurityAudit(db);
  const insert = db.prepare(`
    INSERT INTO security_audit_events
      (event_type, actor_role, subject_id, outcome, route_class, source_address, reason_code)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const prune = db.prepare(`
    DELETE FROM security_audit_events
    WHERE id <= COALESCE(
      (SELECT id FROM security_audit_events ORDER BY id DESC LIMIT 1 OFFSET ?),
      0
    )
  `);
  const persist = db.transaction(values => {
    insert.run(...values);
    prune.run(maxRows);
  });

  return function writeSecurityAudit({
    eventType,
    actorRole = 'system',
    subjectId = null,
    outcome,
    routeClass = null,
    sourceAddress = null,
    reasonCode = null,
  }) {
    if (!SECURITY_EVENT_TYPES.has(eventType)) throw new Error('Unknown security audit event type.');
    if (!ACTOR_ROLES.has(actorRole)) throw new Error('Unknown security audit actor role.');
    if (!OUTCOMES.has(outcome)) throw new Error('Unknown security audit outcome.');
    if (eventType === 'rest_authorization_denied' && !ROUTE_CLASS_IDS.has(routeClass)) {
      throw new Error('Unknown REST authorization route class.');
    }

    persist([
      eventType,
      actorRole,
      safeOptionalText(subjectId, 128),
      outcome,
      safeOptionalText(routeClass, 64),
      safeOptionalText(sourceAddress, 64, /^[a-fA-F0-9:.[\]-]+$/),
      safeOptionalText(reasonCode, 64),
    ]);
  };
}

module.exports = {
  SECURITY_EVENT_TYPES,
  createSecurityAuditWriter,
  migrateSecurityAudit,
};
