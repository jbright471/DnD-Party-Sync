'use strict';

const DEFAULT_DEVELOPMENT_ORIGINS = Object.freeze([
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5173',
]);

const INSECURE_DM_PINS = new Set([
  '1234',
  'password',
  'password123',
  'admin',
  'changeme',
]);

function parseInteger(env, name, fallback, { minimum = 1, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = env[name];
  if (raw == null || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}.`);
  }
  return parsed;
}

function parseBodyLimit(value) {
  const normalized = value || '256kb';
  if (!/^\d+(?:b|kb|mb)$/i.test(normalized)) {
    throw new Error('HTTP_JSON_LIMIT must be a byte-size such as 256kb.');
  }
  return normalized.toLowerCase();
}

function normalizeOrigin(value) {
  if (value === '*') throw new Error('ALLOWED_ORIGINS cannot contain a wildcard.');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`ALLOWED_ORIGINS contains an invalid origin: ${value}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)
      || parsed.username
      || parsed.password
      || parsed.pathname !== '/'
      || parsed.search
      || parsed.hash) {
    throw new Error(`ALLOWED_ORIGINS must contain only HTTP(S) origins: ${value}`);
  }
  return parsed.origin;
}

function parseOrigins(value, isProduction) {
  if (!value || !value.trim()) {
    if (isProduction) throw new Error('ALLOWED_ORIGINS is required in production.');
    return [...DEFAULT_DEVELOPMENT_ORIGINS];
  }
  const origins = [...new Set(value.split(',').map(item => item.trim()).filter(Boolean).map(normalizeOrigin))];
  if (origins.length === 0) throw new Error('ALLOWED_ORIGINS must contain at least one origin.');
  return origins;
}

function validateDmPin(pin, isProduction) {
  if (!isProduction) return pin || '1234';
  if (!pin) throw new Error('DM_PIN is required in production.');
  if (pin.length < 12
      || INSECURE_DM_PINS.has(pin.toLowerCase())
      || new Set(pin).size < 4) {
    throw new Error('DM_PIN must be at least 12 characters, varied, and must not use a sample or common value.');
  }
  return pin;
}

function loadRuntimeSecurityConfig(env = process.env) {
  const environment = env.NODE_ENV || 'development';
  const isProduction = environment === 'production';

  return Object.freeze({
    environment,
    isProduction,
    dmPin: validateDmPin(env.DM_PIN, isProduction),
    allowedOrigins: Object.freeze(parseOrigins(env.ALLOWED_ORIGINS, isProduction)),
    httpJsonLimit: parseBodyLimit(env.HTTP_JSON_LIMIT),
    socketMaxMessageBytes: parseInteger(env, 'SOCKET_MAX_MESSAGE_BYTES', 64 * 1024, {
      minimum: 1024,
      maximum: 1024 * 1024,
    }),
    dmAuth: Object.freeze({
      limit: parseInteger(env, 'DM_AUTH_MAX_ATTEMPTS', 5, { maximum: 100 }),
      windowMs: parseInteger(env, 'DM_AUTH_WINDOW_MS', 15 * 60 * 1000, { minimum: 1000 }),
    }),
    socketConnections: Object.freeze({
      limit: parseInteger(env, 'SOCKET_CONNECTION_MAX_ATTEMPTS', 30, { maximum: 1000 }),
      windowMs: parseInteger(env, 'SOCKET_CONNECTION_WINDOW_MS', 60 * 1000, { minimum: 1000 }),
    }),
    socketEvents: Object.freeze({
      limit: parseInteger(env, 'SOCKET_EVENT_MAX_MESSAGES', 120, { maximum: 10_000 }),
      windowMs: parseInteger(env, 'SOCKET_EVENT_WINDOW_MS', 10 * 1000, { minimum: 1000 }),
    }),
    rateLimitMaxEntries: parseInteger(env, 'RATE_LIMIT_MAX_ENTRIES', 10_000, {
      minimum: 100,
      maximum: 100_000,
    }),
    securityAuditMaxRows: parseInteger(env, 'SECURITY_AUDIT_MAX_ROWS', 10_000, {
      minimum: 100,
      maximum: 100_000,
    }),
    scheduledJobsEnabled: env.DISABLE_SCHEDULED_JOBS !== 'true',
  });
}

function createOriginPolicy(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return Object.freeze({
    isAllowed(origin) {
      return origin == null || origin === '' || allowed.has(origin);
    },
  });
}

module.exports = {
  createOriginPolicy,
  loadRuntimeSecurityConfig,
};
