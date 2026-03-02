const express = require('express');
const router = express.Router();
const db = require('../db');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAPS_DIR = path.join(__dirname, '../../data/maps');
if (!fs.existsSync(MAPS_DIR)) fs.mkdirSync(MAPS_DIR, { recursive: true });

// GET /api/maps — List all maps (Main levels or solo maps)
router.get('/', (req, res) => {
    try {
        const maps = db.prepare(`
            SELECT id, name, grid_size, is_active, group_id, level_order, created_at 
            FROM maps 
            WHERE level_order = 0 
            ORDER BY created_at DESC
        `).all();
        res.json(maps);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/maps/active — Get current active map + tokens + siblings
router.get('/active', (req, res) => {
    try {
        const map = db.prepare('SELECT * FROM maps WHERE is_active = 1').get();
        if (!map) return res.json(null);

        const tokens = db.prepare('SELECT * FROM map_tokens WHERE map_id = ?').all(map.id);
        
        let siblings = [];
        if (map.group_id) {
            siblings = db.prepare('SELECT id, name, level_order FROM maps WHERE group_id = ? ORDER BY level_order ASC').all(map.group_id);
        }

        const publicPath = `/api/maps/image/${path.basename(map.image_path)}`;
        res.json({ ...map, image_data: publicPath, tokens, siblings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/image/:filename', (req, res) => {
    const filePath = path.join(MAPS_DIR, req.params.filename);
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else res.status(404).json({ error: 'Image not found' });
});

// POST /api/maps — Create a new solo map or main level
router.post('/', (req, res) => {
    const { name, image_data, grid_size } = req.body;
    if (!name || !image_data) return res.status(400).json({ error: 'Name and image data required' });

    try {
        const base64Data = image_data.replace(/^data:image\/\w+;base64,/, "");
        const filename = `${Date.now()}-${name.replace(/\s+/g, '_')}.png`;
        const filePath = path.join(MAPS_DIR, filename);
        fs.writeFileSync(filePath, base64Data, 'base64');

        const groupId = crypto.randomUUID();

        const result = db.prepare(
            'INSERT INTO maps (name, image_path, grid_size, group_id, level_order) VALUES (?, ?, ?, ?, 0)'
        ).run(name, filePath, grid_size || 50, groupId);
        
        res.status(201).json({ id: result.lastInsertRowid, name, group_id: groupId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/maps/:id/add-level — Add a floor/level to an existing map group
router.post('/:id/add-level', (req, res) => {
    const { name, image_data } = req.body;
    if (!name || !image_data) return res.status(400).json({ error: 'Name and image data required' });

    try {
        const parent = db.prepare('SELECT group_id, grid_size FROM maps WHERE id = ?').get(req.params.id);
        if (!parent) return res.status(404).json({ error: 'Parent map not found' });

        const levels = db.prepare('SELECT MAX(level_order) as max_order FROM maps WHERE group_id = ?').get(parent.group_id);
        const nextOrder = (levels.max_order || 0) + 1;

        const base64Data = image_data.replace(/^data:image\/\w+;base64,/, "");
        const filename = `${Date.now()}-L${nextOrder}-${name.replace(/\s+/g, '_')}.png`;
        const filePath = path.join(MAPS_DIR, filename);
        fs.writeFileSync(filePath, base64Data, 'base64');

        const result = db.prepare(
            'INSERT INTO maps (name, image_path, grid_size, group_id, level_order) VALUES (?, ?, ?, ?, ?)'
        ).run(name, filePath, parent.grid_size, parent.group_id, nextOrder);
        
        res.status(201).json({ id: result.lastInsertRowid, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/activate', (req, res) => {
    try {
        db.prepare('UPDATE maps SET is_active = 0').run();
        db.prepare('UPDATE maps SET is_active = 1 WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', (req, res) => {
    try {
        const map = db.prepare('SELECT image_path FROM maps WHERE id = ?').get(req.params.id);
        if (map && map.image_path && fs.existsSync(map.image_path)) fs.unlinkSync(map.image_path);
        db.prepare('DELETE FROM maps WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
