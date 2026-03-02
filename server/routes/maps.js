const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/maps — List all maps
router.get('/', (req, res) => {
    try {
        const maps = db.prepare('SELECT id, name, grid_size, is_active, created_at FROM maps ORDER BY created_at DESC').all();
        res.json(maps);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/maps/active — Get current active map + tokens
router.get('/active', (req, res) => {
    try {
        const map = db.prepare('SELECT * FROM maps WHERE is_active = 1').get();
        if (!map) return res.json(null);

        const tokens = db.prepare('SELECT * FROM map_tokens WHERE map_id = ?').all(map.id);
        res.json({ ...map, tokens });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/maps — Create a new map
router.post('/', (req, res) => {
    const { name, image_data, grid_size } = req.body;
    if (!name || !image_data) return res.status(400).json({ error: 'Name and image data required' });

    try {
        const result = db.prepare(
            'INSERT INTO maps (name, image_data, grid_size) VALUES (?, ?, ?)'
        ).run(name, image_data, grid_size || 50);
        
        res.status(201).json({ id: result.lastInsertRowid, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/maps/:id/activate — Set active map
router.post('/:id/activate', (req, res) => {
    try {
        db.prepare('UPDATE maps SET is_active = 0').run();
        db.prepare('UPDATE maps SET is_active = 1 WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/maps/:id
router.delete('/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM maps WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
