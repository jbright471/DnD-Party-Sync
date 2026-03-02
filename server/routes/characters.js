const express = require('express');
const router = express.Router();
const db = require('../db');

// Helper: get full party state
function getAllCharacters() {
    return db.prepare('SELECT * FROM characters ORDER BY id ASC').all();
}

// GET /api/characters
router.get('/', (req, res) => {
    try {
        const characters = getAllCharacters();
        res.json(characters);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/characters — manual creation
router.post('/', (req, res) => {
    const { name, class: charClass, level, max_hp, ac } = req.body;
    if (!name || !charClass || !max_hp || !ac) {
        return res.status(400).json({ error: 'Missing required fields: name, class, max_hp, ac' });
    }
    try {
        const stmt = db.prepare(
            'INSERT INTO characters (name, class, level, max_hp, current_hp, ac) VALUES (?, ?, ?, ?, ?, ?)'
        );
        const result = stmt.run(name, charClass, level || 1, max_hp, max_hp, ac);
        const newChar = db.prepare('SELECT * FROM characters WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(newChar);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/characters/:id/hp — direct HP delta
router.patch('/:id/hp', (req, res) => {
    const { delta } = req.body;
    if (delta === undefined) return res.status(400).json({ error: 'delta required' });

    const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
    if (!char) return res.status(404).json({ error: 'Character not found' });

    const newHp = Math.max(0, Math.min(char.max_hp, char.current_hp + delta));
    db.prepare('UPDATE characters SET current_hp = ? WHERE id = ?').run(newHp, char.id);
    const updated = db.prepare('SELECT * FROM characters WHERE id = ?').get(char.id);
    res.json(updated);
});

// GET /api/log
router.get('/log', (req, res) => {
    try {
        const logs = db.prepare('SELECT * FROM action_log ORDER BY id DESC LIMIT 100').all();
        res.json(logs.reverse());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/characters/:id
router.delete('/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM characters WHERE id = ?').run(req.params.id);
        db.prepare('DELETE FROM initiative_tracker WHERE character_id = ?').run(req.params.id);
        res.status(200).json({ message: 'Character deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/characters/:id/token
router.patch('/:id/token', (req, res) => {
    const { token_image } = req.body;
    try {
        db.prepare('UPDATE characters SET token_image = ? WHERE id = ?').run(token_image, req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = { router, getAllCharacters };
