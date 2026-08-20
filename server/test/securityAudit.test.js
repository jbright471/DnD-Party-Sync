'use strict';

import { describe, expect, it } from 'vitest';
import { createTestDb } from './helpers/testDb.js';
import { createSecurityAuditWriter } from '../lib/securityAudit.js';

describe('persistent security audit records', () => {
  it('stores only allowlisted security fields and never arbitrary secret-bearing input', () => {
    const db = createTestDb();
    const writeAudit = createSecurityAuditWriter(db);
    const secret = 'RAW_TOKEN_AND_PIN_SENTINEL';

    writeAudit({
      eventType: 'socket_authorization_denied',
      actorRole: 'player',
      subjectId: 'grant:17',
      outcome: 'denied',
      sourceAddress: '127.0.0.1',
      reasonCode: 'event_not_allowed',
      payload: { authorization: secret, pin: secret, accessToken: secret },
    });

    const row = db.prepare('SELECT * FROM security_audit_events').get();
    expect(row).toMatchObject({
      event_type: 'socket_authorization_denied',
      actor_role: 'player',
      subject_id: 'grant:17',
      outcome: 'denied',
      source_address: '127.0.0.1',
      reason_code: 'event_not_allowed',
    });
    expect(JSON.stringify(row)).not.toContain(secret);
    db.close();
  });

  it('rejects unknown event types instead of storing attacker-controlled audit categories', () => {
    const db = createTestDb();
    const writeAudit = createSecurityAuditWriter(db);
    expect(() => writeAudit({ eventType: 'client_supplied_event', outcome: 'denied' }))
      .toThrow(/event type/i);
    db.close();
  });

  it('bounds persistent audit retention', () => {
    const db = createTestDb();
    const writeAudit = createSecurityAuditWriter(db, { maxRows: 2 });
    for (const eventType of ['dm_auth_denied', 'dm_auth_succeeded', 'dm_auth_rate_limited']) {
      writeAudit({ eventType, actorRole: 'system', outcome: 'denied' });
    }

    expect(db.prepare('SELECT COUNT(*) AS count FROM security_audit_events').get().count).toBe(2);
    db.close();
  });
});
