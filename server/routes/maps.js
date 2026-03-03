const express = require('express');
const router = express.Router();
const db = require('../db');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAPS_DIR = path.join(__dirname, '../../data/maps');
if (!fs.existsSync(MAPS_DIR)) fs.mkdirSync(MAPS_DIR, { recursive: true });

// GET /api/maps — List all maps
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

// GET /api/maps/active
router.get('/active', (req, res) => {
    try {
        const map = db.prepare('SELECT * FROM maps WHERE is_active = 1').get();
        if (!map) return res.json(null);

        const tokens = db.prepare('SELECT * FROM map_tokens WHERE map_id = ?').all(map.id);
        const markers = db.prepare('SELECT * FROM map_markers WHERE parent_map_id = ?').all(map.id);
        
        let siblings = [];
        if (map.group_id) {
            siblings = db.prepare('SELECT id, name, level_order FROM maps WHERE group_id = ? ORDER BY level_order ASC').all(map.group_id);
        }

        const publicPath = `/api/maps/file/${path.basename(map.image_path)}`;
        res.json({ ...map, map_url: publicPath, tokens, siblings, markers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/file/:filename', (req, res) => {
    const filePath = path.join(MAPS_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        if (['.mp4', '.webm'].includes(ext)) {
            res.setHeader('Content-Type', `video/${ext.replace('.', '')}`);
        }
        res.sendFile(filePath);
    } else res.status(404).json({ error: 'File not found' });
});

// Helper for saving base64 map data (img or video)
function saveMapFile(name, data, suffix = '') {
    const match = data.match(/^data:(image|video)\/(\w+);base64,/);
    if (!match) throw new Error('Invalid data format');
    
    const type = match[1]; // image or video
    const ext = match[2] === 'mpeg' ? 'mp4' : match[2];
    const base64Data = data.replace(/^data:(image|video)\/\w+;base64,/, "");
    
    const filename = `${Date.now()}${suffix}-${name.replace(/\s+/g, '_')}.${ext}`;
    const filePath = path.join(MAPS_DIR, filename);
    fs.writeFileSync(filePath, base64Data, 'base64');
    return filePath;
}

// POST /api/maps
router.post('/', (req, res) => {
    const { name, image_data, grid_size } = req.body;
    if (!name || !image_data) return res.status(400).json({ error: 'Name and data required' });

    try {
        const filePath = saveMapFile(name, image_data);
        const groupId = crypto.randomUUID();

        const result = db.prepare(
            'INSERT INTO maps (name, image_path, grid_size, group_id, level_order) VALUES (?, ?, ?, ?, 0)'
        ).run(name, filePath, grid_size || 50, groupId);
        
        res.status(201).json({ id: result.lastInsertRowid, name, group_id: groupId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/maps/:id/add-level
router.post('/:id/add-level', (req, res) => {
    const { name, image_data } = req.body;
    if (!name || !image_data) return res.status(400).json({ error: 'Name and data required' });

    try {
        const parent = db.prepare('SELECT group_id, grid_size FROM maps WHERE id = ?').get(req.params.id);
        if (!parent) return res.status(404).json({ error: 'Parent map not found' });

        const levels = db.prepare('SELECT MAX(level_order) as max_order FROM maps WHERE group_id = ?').get(parent.group_id);
        const nextOrder = (levels.max_order || 0) + 1;

        const filePath = saveMapFile(name, image_data, `-L${nextOrder}`);

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

// ---- Overworld Markers ----

router.post('/:id/markers', (req, res) => {
    const { name, type, x, y, linked_map_id } = req.body;
    try {
        const result = db.prepare(`
            INSERT INTO map_markers (parent_map_id, linked_map_id, name, type, x, y)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(req.params.id, linked_map_id || null, name, type || 'location', x, y);
        res.status(201).json({ id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/markers/:markerId', (req, res) => {
    const { is_discovered, is_hidden, x, y } = req.body;
    try {
        const updates = [];
        const values = [];
        if (is_discovered !== undefined) { updates.push('is_discovered = ?'); values.push(is_discovered); }
        if (is_hidden !== undefined) { updates.push('is_hidden = ?'); values.push(is_hidden); }
        if (x !== undefined) { updates.push('x = ?'); values.push(x); }
        if (y !== undefined) { updates.push('y = ?'); values.push(y); }
        
        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
        
        values.push(req.params.markerId);
        db.prepare(`UPDATE map_markers SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/markers/:markerId', (req, res) => {
    try {
        db.prepare('DELETE FROM map_markers WHERE id = ?').run(req.params.markerId);
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
