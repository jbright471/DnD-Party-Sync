const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/npcs — List all NPCs
router.get('/', (req, res) => {
    try {
        const npcs = db.prepare('SELECT * FROM npcs ORDER BY name ASC').all();
        res.json(npcs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/npcs/:id — Get details for a single NPC
router.get('/:id', (req, res) => {
    try {
        const npc = db.prepare('SELECT * FROM npcs WHERE id = ?').get(req.params.id);
        if (!npc) return res.status(404).json({ error: 'NPC not found' });
        res.json(npc);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/npcs — Create a new NPC
router.post('/', (req, res) => {
    const { name, race, description, occupation, location, secrets, notes, stats_json } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    try {
        const result = db.prepare(`
            INSERT INTO npcs (name, race, description, occupation, location, secrets, notes, stats_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            name, 
            race || '', 
            description || '', 
            occupation || '', 
            location || '', 
            secrets || '', 
            notes || '', 
            JSON.stringify(stats_json || {})
        );
        res.status(201).json({ id: result.lastInsertRowid, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/npcs/:id — Update an existing NPC
router.patch('/:id', (req, res) => {
    const fields = ['name', 'race', 'description', 'occupation', 'location', 'secrets', 'notes', 'stats_json'];
    const updates = [];
    const values = [];

    fields.forEach(f => {
        if (req.body[f] !== undefined) {
            updates.push(`${f} = ?`);
            values.push(f === 'stats_json' ? JSON.stringify(req.body[f]) : req.body[f]);
        }
    });

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);

    try {
        const result = db.prepare(`UPDATE npcs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        if (result.changes === 0) return res.status(404).json({ error: 'NPC not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/npcs/:id — Remove an NPC
router.delete('/:id', (req, res) => {
    try {
        const result = db.prepare('DELETE FROM npcs WHERE id = ?').run(req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'NPC not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
