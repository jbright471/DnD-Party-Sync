'use strict';

const commandEnvelope = require('../contracts/v1/command-envelope.schema.json');
const activeEffect = require('../contracts/v1/active-effect.schema.json');
const provenanceEntry = require('../contracts/v1/provenance-entry.schema.json');
const calculatedStat = require('../contracts/v1/calculated-stat.schema.json');
const stateDelta = require('../contracts/v1/state-delta.schema.json');

const CURRENT_VERSION = '1.0.0';
const SUPPORTED_VERSIONS = Object.freeze([CURRENT_VERSION]);
const schemas = Object.freeze({
  'command-envelope': commandEnvelope,
  'active-effect': activeEffect,
  'provenance-entry': provenanceEntry,
  'calculated-stat': calculatedStat,
  'state-delta': stateDelta,
});

function typeMatches(value, expected) {
  if (expected === 'null') return value === null;
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'integer') return Number.isInteger(value);
  if (expected === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return typeof value === expected;
}

function resolveReference(reference) {
  if (reference === 'provenance-entry.schema.json') return provenanceEntry;
  return null;
}

function validateNode(schema, value, path, issues) {
  if (!schema || Object.keys(schema).length === 0) return;
  if (schema.$ref) {
    const resolved = resolveReference(schema.$ref);
    if (!resolved) issues.push({ path, code: 'UNKNOWN_REFERENCE', message: `Unknown schema reference ${schema.$ref}` });
    else validateNode(resolved, value, path, issues);
    return;
  }
  if (schema.const !== undefined && value !== schema.const) {
    issues.push({ path, code: 'CONST', message: `must equal ${JSON.stringify(schema.const)}` });
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    issues.push({ path, code: 'ENUM', message: `must be one of ${schema.enum.join(', ')}` });
    return;
  }
  if (schema.type) {
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expectedTypes.some(type => typeMatches(value, type))) {
      issues.push({ path, code: 'TYPE', message: `must be ${expectedTypes.join(' or ')}` });
      return;
    }
  }
  if (schema.format === 'uuid' && (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))) {
    issues.push({ path, code: 'FORMAT', message: 'must be a UUID' });
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) issues.push({ path, code: 'MIN_LENGTH', message: `must contain at least ${schema.minLength} character(s)` });
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) issues.push({ path, code: 'PATTERN', message: `must match ${schema.pattern}` });
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    issues.push({ path, code: 'MINIMUM', message: `must be at least ${schema.minimum}` });
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) issues.push({ path, code: 'MIN_ITEMS', message: `must contain at least ${schema.minItems} item(s)` });
    if (schema.items) value.forEach((item, index) => validateNode(schema.items, item, `${path}[${index}]`, issues));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, required)) {
        issues.push({ path: `${path}.${required}`, code: 'REQUIRED', message: 'is required' });
      }
    }
    const properties = schema.properties || {};
    const patterns = Object.entries(schema.patternProperties || {}).map(([pattern, child]) => [new RegExp(pattern), child]);
    for (const [key, childValue] of Object.entries(value)) {
      if (properties[key]) {
        validateNode(properties[key], childValue, `${path}.${key}`, issues);
        continue;
      }
      const pattern = patterns.find(([regex]) => regex.test(key));
      if (pattern) {
        validateNode(pattern[1], childValue, `${path}.${key}`, issues);
        continue;
      }
      if (schema.additionalProperties === false) {
        issues.push({ path: `${path}.${key}`, code: 'ADDITIONAL_PROPERTY', message: 'is not part of the stable contract' });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validateNode(schema.additionalProperties, childValue, `${path}.${key}`, issues);
      }
    }
  }
}

function validateContract(name, value) {
  const schema = schemas[name];
  if (!schema) return { valid: false, issues: [{ path: '$', code: 'UNKNOWN_CONTRACT', message: `Unknown contract ${name}` }] };
  const issues = [];
  validateNode(schema, value, '$', issues);
  return { valid: issues.length === 0, issues };
}

function negotiateVersion(requestedVersions) {
  const requested = Array.isArray(requestedVersions) ? requestedVersions : [requestedVersions];
  const version = requested.find(candidate => SUPPORTED_VERSIONS.includes(candidate));
  return version
    ? { compatible: true, version, supportedVersions: [...SUPPORTED_VERSIONS] }
    : { compatible: false, version: null, supportedVersions: [...SUPPORTED_VERSIONS] };
}

function getRegistryDocument() {
  return {
    registry: 'arcane-ally-automation',
    currentVersion: CURRENT_VERSION,
    supportedVersions: [...SUPPORTED_VERSIONS],
    stability: {
      core: 'stable',
      extensions: 'experimental',
      extensionKeyPattern: '^x-[a-z0-9-]+$',
    },
    capabilities: {
      commandTypes: [
        { name: 'effect.party.apply', stability: 'stable' },
      ],
      effectTypes: [...['damage', 'heal', 'condition', 'remove_condition', 'buff', 'remove_buff', 'resource', 'custom']],
      calculatedStats: [
        'abilityScores.STR', 'abilityScores.DEX', 'abilityScores.CON',
        'abilityScores.INT', 'abilityScores.WIS', 'abilityScores.CHA',
        'ac', 'saves.*', 'speed', 'skills.*',
      ],
      automationHooks: [
        { name: 'start_of_turn', stability: 'stable' },
        { name: 'end_of_turn', stability: 'stable' },
        { name: 'manual', stability: 'stable' },
        { name: 'reaction.retributive_healing', stability: 'experimental' },
      ],
    },
    contracts: Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, {
      id: schema.$id,
      title: schema.title,
      path: `/api/v1/contracts/${name}`,
    }])),
  };
}

module.exports = {
  CURRENT_VERSION,
  SUPPORTED_VERSIONS,
  getRegistryDocument,
  negotiateVersion,
  schemas,
  validateContract,
};
