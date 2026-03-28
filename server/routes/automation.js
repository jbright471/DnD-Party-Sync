const express = require('express');
const router = express.Router();
const db = require('../db');

function serialize(v) {
    return typeof v === 'string' ? v : JSON.stringify(v);
}

// GET /api/automation
router.get('/', (req, res) => {
    try {
        const presets = db.prepare('SELECT * FROM automation_presets ORDER BY preset_type ASC, created_at DESC').all();
        res.json(presets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/automation
router.post('/', (req, res) => {
    const {
        name, preset_type, trigger_phase, trigger_entity_id,
        effects_json, targets_json, aura_radius,
        aura_center_entity_id, description,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'name required' });

    try {
        const result = db.prepare(`
            INSERT INTO automation_presets
                (name, preset_type, trigger_phase, trigger_entity_id, effects_json, targets_json,
                 aura_radius, aura_center_entity_id, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            name,
            preset_type || 'group_action',
            trigger_phase || null,
            trigger_entity_id || null,
            serialize(effects_json || []),
            serialize(targets_json || '"party"'),
            aura_radius || null,
            aura_center_entity_id || null,
            description || '',
        );
        res.status(201).json({ id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/automation/:id
router.patch('/:id', (req, res) => {
    const allowed = [
        'name', 'is_active', 'is_locked', 'effects_json', 'targets_json',
        'description', 'trigger_phase', 'trigger_entity_id',
        'aura_radius', 'aura_center_entity_id', 'preset_type',
    ];
    const updates = [];
    const values = [];

    for (const key of allowed) {
        if (req.body[key] !== undefined) {
            updates.push(`${key} = ?`);
            values.push(['effects_json', 'targets_json'].includes(key)
                ? serialize(req.body[key])
                : req.body[key]);
        }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    try {
        values.push(req.params.id);
        db.prepare(`UPDATE automation_presets SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/automation/:id
router.delete('/:id', (req, res) => {
    try {
        const preset = db.prepare('SELECT is_locked FROM automation_presets WHERE id = ?').get(req.params.id);
        if (preset?.is_locked) return res.status(403).json({ error: 'Preset is locked and cannot be deleted.' });
        db.prepare('DELETE FROM automation_presets WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
