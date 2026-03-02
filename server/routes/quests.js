const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/quests — List all quests
// If isDm query param is present, return everything. Otherwise only public.
router.get('/', (req, res) => {
    const isDm = req.query.isDm === 'true';
    try {
        let query = 'SELECT * FROM quests';
        if (!isDm) query += ' WHERE is_public = 1';
        query += ' ORDER BY created_at DESC';
        
        const quests = db.prepare(query).all();
        res.json(quests);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/quests — Create quest
router.post('/', (req, res) => {
    const { title, description, dm_secrets, is_public, rewards } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    try {
        const result = db.prepare(`
            INSERT INTO quests (title, description, dm_secrets, is_public, rewards)
            VALUES (?, ?, ?, ?, ?)
        `).run(title, description, dm_secrets, is_public ? 1 : 0, rewards);
        
        const quest = db.prepare('SELECT * FROM quests WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(quest);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/quests/:id — Update quest
router.patch('/:id', (req, res) => {
    const { title, description, dm_secrets, status, is_public, rewards } = req.body;
    
    try {
        const current = db.prepare('SELECT * FROM quests WHERE id = ?').get(req.params.id);
        if (!current) return res.status(404).json({ error: 'Quest not found' });

        db.prepare(`
            UPDATE quests SET 
                title = ?, description = ?, dm_secrets = ?, 
                status = ?, is_public = ?, rewards = ?
            WHERE id = ?
        `).run(
            title || current.title,
            description !== undefined ? description : current.description,
            dm_secrets !== undefined ? dm_secrets : current.dm_secrets,
            status || current.status,
            is_public !== undefined ? (is_public ? 1 : 0) : current.is_public,
            rewards !== undefined ? rewards : current.rewards,
            req.params.id
        );

        const updated = db.prepare('SELECT * FROM quests WHERE id = ?').get(req.params.id);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/quests/:id
router.delete('/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM quests WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
