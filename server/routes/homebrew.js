const express = require('express');
const router = express.Router();
const db = require('../db');
const { generateHomebrewStats } = require('../ollama');

// GET /api/homebrew — list all homebrew entities
router.get('/', (req, res) => {
    try {
        const entities = db.prepare('SELECT * FROM homebrew_entities ORDER BY created_at DESC').all();
        res.json(entities.map(e => ({ ...e, stats_json: JSON.parse(e.stats_json) })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/homebrew/generate — send description to Ollama, return generated stats
router.post('/generate', async (req, res) => {
    const { entity_type, name, description } = req.body;
    if (!entity_type || !name || !description) {
        return res.status(400).json({ error: 'entity_type, name, and description required' });
    }

    try {
        const stats = await generateHomebrewStats(entity_type, name, description);
        if (!stats) {
            return res.status(502).json({ error: 'Ollama failed to generate stats. Is it running?' });
        }
        res.json({ entity_type, name, description, stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/homebrew — save finalized entity to DB
router.post('/', (req, res) => {
    const { entity_type, name, description, stats_json } = req.body;
    if (!entity_type || !name) {
        return res.status(400).json({ error: 'entity_type and name required' });
    }

    try {
        const result = db.prepare(
            'INSERT INTO homebrew_entities (entity_type, name, description, stats_json) VALUES (?, ?, ?, ?)'
        ).run(entity_type, name, description || '', JSON.stringify(stats_json || {}));
        const entity = db.prepare('SELECT * FROM homebrew_entities WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ ...entity, stats_json: JSON.parse(entity.stats_json) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/homebrew/:id
router.delete('/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM homebrew_entities WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
