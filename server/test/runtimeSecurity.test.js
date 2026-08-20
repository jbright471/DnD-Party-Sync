'use strict';

import { describe, expect, it } from 'vitest';
import {
  createOriginPolicy,
  loadRuntimeSecurityConfig,
} from '../lib/runtimeSecurity.js';

describe('runtime security configuration', () => {
  it('fails closed in production when the DM PIN is missing or uses the sample value', () => {
    expect(() => loadRuntimeSecurityConfig({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://ally.example.test',
    })).toThrow(/DM_PIN/);
    expect(() => loadRuntimeSecurityConfig({
      NODE_ENV: 'production',
      DM_PIN: '1234',
      ALLOWED_ORIGINS: 'https://ally.example.test',
    })).toThrow(/DM_PIN/);
    expect(() => loadRuntimeSecurityConfig({
      NODE_ENV: 'production',
      DM_PIN: '000000000000',
      ALLOWED_ORIGINS: 'https://ally.example.test',
    })).toThrow(/DM_PIN/);
  });

  it('requires an explicit non-wildcard production origin allowlist', () => {
    const base = { NODE_ENV: 'production', DM_PIN: 'correct-horse-42' };
    expect(() => loadRuntimeSecurityConfig(base)).toThrow(/ALLOWED_ORIGINS/);
    expect(() => loadRuntimeSecurityConfig({ ...base, ALLOWED_ORIGINS: '*' })).toThrow(/ALLOWED_ORIGINS/);
  });

  it('parses bounded traffic settings and development localhost defaults', () => {
    const config = loadRuntimeSecurityConfig({
      NODE_ENV: 'development',
      SOCKET_MAX_MESSAGE_BYTES: '32768',
      DM_AUTH_MAX_ATTEMPTS: '3',
    });

    expect(config.socketMaxMessageBytes).toBe(32768);
    expect(config.dmAuth.limit).toBe(3);
    expect(config.allowedOrigins).toContain('http://localhost:5173');
  });

  it('allows only configured browser origins while retaining native clients without Origin', () => {
    const policy = createOriginPolicy(['https://ally.example.test']);
    expect(policy.isAllowed('https://ally.example.test')).toBe(true);
    expect(policy.isAllowed('https://evil.example.test')).toBe(false);
    expect(policy.isAllowed(undefined)).toBe(true);
  });
});
