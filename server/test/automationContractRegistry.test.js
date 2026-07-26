'use strict';

import { describe, expect, it } from 'vitest';
import {
  getRegistryDocument,
  negotiateVersion,
  validateContract,
} from '../lib/automationContractRegistry.js';

describe('automationContractRegistry', () => {
  const validEnvelope = {
    commandId: '123e4567-e89b-42d3-a456-426614174000',
    commandType: 'effect.party.apply',
    schemaVersion: '1.0.0',
    expectedCampaignVersion: 4,
    expectedAggregateVersions: { 'character:1': 2, 'character:2': 7 },
    actor: { type: 'dm', id: 'dm' },
    payload: { effects: [], targets: [] },
    extensions: { 'x-preview': { dryRun: false } },
  };

  it('accepts the stable command core and namespaced extensions', () => {
    expect(validateContract('command-envelope', validEnvelope)).toEqual({ valid: true, issues: [] });
  });

  it('rejects missing versions, non-UUID IDs, and unnamespaced fields', () => {
    const result = validateContract('command-envelope', {
      ...validEnvelope,
      commandId: 'not-a-uuid',
      expectedCampaignVersion: undefined,
      experimentalMode: true,
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'FORMAT',
      'TYPE',
      'ADDITIONAL_PROPERTY',
    ]));
  });

  it('validates state deltas and extension namespaces', () => {
    const result = validateContract('state-delta', {
      schemaVersion: '1.0.0',
      campaignVersion: 5,
      commandId: validEnvelope.commandId,
      commandType: validEnvelope.commandType,
      aggregateVersions: { 'character:1': 3 },
      changes: { kind: 'effects_applied' },
      extensions: { preview: true },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      path: '$.extensions.preview',
      code: 'ADDITIONAL_PROPERTY',
    }));
  });

  it('negotiates only explicitly supported contract versions', () => {
    expect(negotiateVersion(['2.0.0', '1.0.0'])).toMatchObject({ compatible: true, version: '1.0.0' });
    expect(negotiateVersion(['2.0.0'])).toMatchObject({ compatible: false, version: null });
    expect(getRegistryDocument().stability.extensions).toBe('experimental');
    expect(getRegistryDocument().capabilities.automationHooks).toContainEqual({
      name: 'start_of_turn', stability: 'stable',
    });
  });
});
