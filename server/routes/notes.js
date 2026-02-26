const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/notes — fetch all notes
router.get('/', (req, res) => {
    try {
        const notes = db.prepare('SELECT * FROM party_notes ORDER BY updated_at DESC').all();
        res.json(notes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/notes — create a new note
router.post('/', (req, res) => {
    const { category, title, content, updated_by } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    try {
        const result = db.prepare(
            "INSERT INTO party_notes (category, title, content, updated_by) VALUES (?, ?, ?, ?)"
        ).run(category || 'general', title, content || '', updated_by || 'Anonymous');
        const note = db.prepare('SELECT * FROM party_notes WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(note);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/notes/:id — update note content
router.patch('/:id', (req, res) => {
    const { content, title, category, updated_by } = req.body;
    const note = db.prepare('SELECT * FROM party_notes WHERE id = ?').get(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });

    try {
        const sets = [];
        const values = [];

        if (content !== undefined) { sets.push('content = ?'); values.push(content); }
        if (title !== undefined) { sets.push('title = ?'); values.push(title); }
        if (category !== undefined) { sets.push('category = ?'); values.push(category); }
        if (updated_by !== undefined) { sets.push('updated_by = ?'); values.push(updated_by); }

        sets.push("updated_at = datetime('now')");
        values.push(req.params.id);

        db.prepare(`UPDATE party_notes SET ${sets.join(', ')} WHERE id = ?`).run(...values);
        const updated = db.prepare('SELECT * FROM party_notes WHERE id = ?').get(req.params.id);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/notes/:id
router.delete('/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM party_notes WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
