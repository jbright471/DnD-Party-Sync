'use strict';

const { createHash, randomBytes } = require('crypto');

const ACCESS_TOKEN_BYTES = 32;
const ACCESS_ROLES = new Set(['player', 'cast']);

function migrateAccessGrants(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS access_grants (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      token_digest     TEXT NOT NULL UNIQUE,
      role             TEXT NOT NULL CHECK (role IN ('player', 'cast')),
      character_id     INTEGER DEFAULT NULL,
      encounter_id     INTEGER DEFAULT NULL,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at       TEXT DEFAULT NULL,
      rotated_from_id  INTEGER DEFAULT NULL,
      CHECK (
        (role = 'player' AND character_id IS NOT NULL)
        OR (role = 'cast' AND character_id IS NULL)
      ),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
      FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE,
      FOREIGN KEY (rotated_from_id) REFERENCES access_grants(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_access_grants_scope
      ON access_grants (role, character_id, encounter_id, revoked_at);
  `);
}

function digestToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function normalizeOptionalId(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    const error = new Error(`${fieldName} must be a positive integer`);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

function mapGrant(row) {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    characterId: row.character_id,
    encounterId: row.encounter_id,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    rotatedFromId: row.rotated_from_id,
  };
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

function createAccessGrantService(db) {
  const insertGrant = db.prepare(`
    INSERT INTO access_grants (token_digest, role, character_id, encounter_id, rotated_from_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  const selectById = db.prepare('SELECT * FROM access_grants WHERE id = ?');
  const selectByDigest = db.prepare(`
    SELECT * FROM access_grants
    WHERE token_digest = ? AND revoked_at IS NULL
  `);
  const revokeById = db.prepare(`
    UPDATE access_grants
    SET revoked_at = datetime('now')
    WHERE id = ? AND revoked_at IS NULL
  `);

  function validateScope({ role, characterId, encounterId }) {
    if (!ACCESS_ROLES.has(role)) {
      const error = new Error('role must be player or cast');
      error.statusCode = 400;
      throw error;
    }

    const normalizedCharacterId = normalizeOptionalId(characterId, 'characterId');
    const normalizedEncounterId = normalizeOptionalId(encounterId, 'encounterId');

    if (role === 'player' && normalizedCharacterId === null) {
      const error = new Error('Player grants require a characterId');
      error.statusCode = 400;
      throw error;
    }
    if (role === 'cast' && normalizedCharacterId !== null) {
      const error = new Error('Cast grants cannot be scoped to a character');
      error.statusCode = 400;
      throw error;
    }

    if (normalizedCharacterId !== null) {
      const character = db.prepare('SELECT id FROM characters WHERE id = ?').get(normalizedCharacterId);
      if (!character) throw notFound('Character not found');
    }
    if (normalizedEncounterId !== null) {
      const encounter = db.prepare('SELECT id FROM encounters WHERE id = ?').get(normalizedEncounterId);
      if (!encounter) throw notFound('Encounter not found');
    }

    return { role, characterId: normalizedCharacterId, encounterId: normalizedEncounterId };
  }

  function insert(scope, rotatedFromId = null) {
    const token = randomBytes(ACCESS_TOKEN_BYTES).toString('base64url');
    const result = insertGrant.run(
      digestToken(token),
      scope.role,
      scope.characterId,
      scope.encounterId,
      rotatedFromId,
    );
    return { token, grant: mapGrant(selectById.get(result.lastInsertRowid)) };
  }

  function createGrant(input) {
    return insert(validateScope(input));
  }

  function authenticate(token, { requiredRole } = {}) {
    if (typeof token !== 'string' || token.length < 32 || token.length > 256) return null;
    const grant = mapGrant(selectByDigest.get(digestToken(token)));
    if (!grant || (requiredRole && grant.role !== requiredRole)) return null;
    return grant;
  }

  function revokeGrant(grantId) {
    const id = normalizeOptionalId(grantId, 'grantId');
    if (!selectById.get(id)) throw notFound('Access grant not found');
    revokeById.run(id);
    return mapGrant(selectById.get(id));
  }

  const rotateTransaction = db.transaction((grantId) => {
    const id = normalizeOptionalId(grantId, 'grantId');
    const existing = selectById.get(id);
    if (!existing || existing.revoked_at) throw notFound('Active access grant not found');
    revokeById.run(id);
    return insert({
      role: existing.role,
      characterId: existing.character_id,
      encounterId: existing.encounter_id,
    }, id);
  });

  function listGrants({ includeRevoked = false } = {}) {
    const where = includeRevoked ? '' : 'WHERE revoked_at IS NULL';
    return db.prepare(`SELECT * FROM access_grants ${where} ORDER BY id DESC`).all().map(mapGrant);
  }

  return {
    authenticate,
    createGrant,
    listGrants,
    revokeGrant,
    rotateGrant: rotateTransaction,
  };
}

function bindSocketAccessGrant(socket, service) {
  const token = socket.handshake?.auth?.accessToken;
  const grant = service.authenticate(token);
  socket.accessGrant = grant;
  return grant;
}

module.exports = {
  ACCESS_TOKEN_BYTES,
  bindSocketAccessGrant,
  createAccessGrantService,
  digestToken,
  migrateAccessGrants,
};
