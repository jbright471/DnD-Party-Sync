'use strict';

const express = require('express');

function bearerToken(req) {
  const authorization = req.headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length);
  }
  const headerToken = req.headers['x-dm-token'];
  return typeof headerToken === 'string' ? headerToken : null;
}

function linkFor(grant, token) {
  const fragment = `#access_token=${encodeURIComponent(token)}`;
  if (grant.role === 'player') return `/companion/${grant.characterId}${fragment}`;
  return `/encounter/${grant.encounterId ?? 'session'}/cast${fragment}`;
}

function serializeIssued(issued) {
  return {
    grant: issued.grant,
    token: issued.token,
    link: linkFor(issued.grant, issued.token),
  };
}

function createAccessGrantRouter({
  service,
  requireDm,
  onGrantInvalidated = () => {},
  onAudit = () => {},
  transaction = operation => operation(),
}) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!requireDm(bearerToken(req))) {
      return res.status(401).json({ error: 'DM authentication required' });
    }
    next();
  });

  router.get('/', (_req, res) => {
    res.json(service.listGrants());
  });

  router.post('/player', (req, res, next) => {
    try {
      const issued = transaction(() => {
        const created = service.createGrant({
          role: 'player',
          characterId: req.body.characterId,
          encounterId: req.body.encounterId,
        });
        onAudit({
          eventType: 'access_grant_created',
          actorRole: 'dm',
          subjectId: `grant:${created.grant.id}`,
          outcome: 'allowed',
          reasonCode: created.grant.role,
        }, req);
        return created;
      });
      res.status(201).json(serializeIssued(issued));
    } catch (error) {
      next(error);
    }
  });

  router.post('/cast', (req, res, next) => {
    try {
      const issued = transaction(() => {
        const created = service.createGrant({ role: 'cast', encounterId: req.body.encounterId });
        onAudit({
          eventType: 'access_grant_created',
          actorRole: 'dm',
          subjectId: `grant:${created.grant.id}`,
          outcome: 'allowed',
          reasonCode: created.grant.role,
        }, req);
        return created;
      });
      res.status(201).json(serializeIssued(issued));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/rotate', (req, res, next) => {
    try {
      const issued = transaction(() => {
        const rotated = service.rotateGrant(req.params.id);
        onAudit({
          eventType: 'access_grant_rotated',
          actorRole: 'dm',
          subjectId: `grant:${rotated.grant.id}`,
          outcome: 'allowed',
          reasonCode: rotated.grant.role,
        }, req);
        return rotated;
      });
      onGrantInvalidated(Number(req.params.id));
      res.status(201).json(serializeIssued(issued));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', (req, res, next) => {
    try {
      const grant = transaction(() => {
        const revoked = service.revokeGrant(req.params.id);
        onAudit({
          eventType: 'access_grant_revoked',
          actorRole: 'dm',
          subjectId: `grant:${revoked.id}`,
          outcome: 'allowed',
          reasonCode: revoked.role,
        }, req);
        return revoked;
      });
      onGrantInvalidated(grant.id);
      res.json({ grant });
    } catch (error) {
      next(error);
    }
  });

  router.use((error, _req, res, _next) => {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    res.status(status).json({ error: status === 500 ? 'Access grant operation failed' : error.message });
  });

  return router;
}

module.exports = { createAccessGrantRouter };
