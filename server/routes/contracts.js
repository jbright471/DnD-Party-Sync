'use strict';

const express = require('express');
const {
  getRegistryDocument,
  negotiateVersion,
  schemas,
} = require('../lib/automationContractRegistry');
const { getAggregateVersions, getCampaignVersion, getStateDeltas } = require('../lib/processedCommands');

function createContractRouter(db) {
  const router = express.Router();

  router.get('/', (_req, res) => res.json(getRegistryDocument()));

  router.post('/negotiate', (req, res) => {
    const negotiation = negotiateVersion(req.body?.supportedVersions || req.body?.version);
    return res.status(negotiation.compatible ? 200 : 409).json(negotiation);
  });

  router.get('/state/version', (_req, res) => {
    res.json({
      schemaVersion: '1.0.0',
      campaignVersion: getCampaignVersion(db),
      aggregateVersions: getAggregateVersions(db),
    });
  });

  router.get('/state/deltas', (req, res) => {
    const afterVersion = Number(req.query.afterVersion || 0);
    const currentVersion = getCampaignVersion(db);
    const earliest = db.prepare('SELECT MIN(campaign_version) AS version FROM state_deltas').get()?.version;
    const resyncRequired = earliest !== null && earliest !== undefined && afterVersion < earliest - 1;
    res.json({
      schemaVersion: '1.0.0',
      afterVersion,
      campaignVersion: currentVersion,
      aggregateVersions: getAggregateVersions(db),
      resyncRequired,
      deltas: resyncRequired ? [] : getStateDeltas(db, afterVersion, req.query.limit),
    });
  });

  router.get('/:name', (req, res) => {
    const schema = schemas[req.params.name];
    if (!schema) return res.status(404).json({ error: 'Unknown automation contract' });
    return res.json(schema);
  });

  return router;
}

module.exports = { createContractRouter };
