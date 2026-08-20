const express = require('express');
const router = express.Router();
const db = require('../db');

// DM auth middleware — accepts only the revocable DM session token.
function dmOnly(req, res, next) {
    const token = req.headers['x-dm-token'];
    if (token) {
        const row = db.prepare("SELECT value FROM campaign_state WHERE key = 'dm_token'").get();
        if (row && row.value && row.value === token) return next();
    }
    res.status(403).json({ error: 'DM access required' });
}

function serialize(v) {
    return typeof v === 'string' ? v : JSON.stringify(v);
}

// GET /api/effect-presets — list all presets
router.get('/', (req, res) => {
    try {
        const presets = db.prepare('SELECT * FROM effect_presets ORDER BY category ASC, name ASC').all();
        res.json(presets.map(p => ({
            ...p,
            effects: JSON.parse(p.effects_json || '[]')
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/effect-presets — create a custom preset (DM only)
router.post('/', dmOnly, (req, res) => {
    const { name, category, effects_json, description } = req.body;

    if (!name) return res.status(400).json({ error: 'name required' });
    if (!category) return res.status(400).json({ error: 'category required' });

    try {
        const result = db.prepare(`
            INSERT INTO effect_presets (name, category, effects_json, description, is_locked)
            VALUES (?, ?, ?, ?, 0)
        `).run(
            name,
            category,
            serialize(effects_json || []),
            description || ''
        );
        const newPreset = db.prepare('SELECT * FROM effect_presets WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({
            ...newPreset,
            effects: JSON.parse(newPreset.effects_json || '[]')
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/effect-presets/:id — update a preset (DM only)
router.patch('/:id', dmOnly, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT * FROM effect_presets WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Preset not found' });
    if (existing.is_locked) return res.status(403).json({ error: 'Locked presets cannot be modified' });

    const { name, category, effects_json, description } = req.body;

    try {
        db.prepare(`
            UPDATE effect_presets
            SET name = ?, category = ?, effects_json = ?, description = ?
            WHERE id = ?
        `).run(
            name ?? existing.name,
            category ?? existing.category,
            effects_json !== undefined ? serialize(effects_json) : existing.effects_json,
            description ?? existing.description,
            id
        );

        const updated = db.prepare('SELECT * FROM effect_presets WHERE id = ?').get(id);
        res.json({
            ...updated,
            effects: JSON.parse(updated.effects_json || '[]')
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/effect-presets/:id — delete a preset (DM only)
router.delete('/:id', dmOnly, (req, res) => {
    const id = parseInt(req.params.id, 10);
    try {
        const existing = db.prepare('SELECT * FROM effect_presets WHERE id = ?').get(id);
        if (!existing) return res.status(404).json({ error: 'Preset not found' });
        if (existing.is_locked) return res.status(403).json({ error: 'Locked presets cannot be deleted' });

        db.prepare('DELETE FROM effect_presets WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
