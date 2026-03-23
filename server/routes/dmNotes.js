const express = require('express');
const router = express.Router();
const db = require('../db');

// DM auth middleware — validates X-DM-Pin or X-DM-Token header
function dmOnly(req, res, next) {
    // Token-based auth (preferred after first login)
    const token = req.headers['x-dm-token'];
    if (token) {
        const row = db.prepare("SELECT value FROM campaign_state WHERE key = 'dm_token'").get();
        if (row && row.value && row.value === token) return next();
    }
    // PIN fallback
    const pin = req.headers['x-dm-pin'];
    const masterPin = process.env.DM_PIN || '1234';
    if (pin && pin === masterPin) return next();

    res.status(403).json({ error: 'DM access required' });
}

// GET /api/dm-notes — list all notes with optional filters
router.get('/', dmOnly, (req, res) => {
    const { linked_type, linked_id, tag } = req.query;
    let where = [];
    let params = [];

    if (linked_type) { where.push('linked_type = ?'); params.push(linked_type); }
    if (linked_id) { where.push('linked_id = ?'); params.push(parseInt(linked_id)); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    let notes = db.prepare(`SELECT * FROM dm_prep_notes ${whereClause} ORDER BY updated_at DESC`).all(...params);

    // Tag filter (applied post-query since tags are JSON)
    if (tag) {
        notes = notes.filter(n => {
            try { return JSON.parse(n.tags_json).includes(tag); }
            catch { return false; }
        });
    }

    res.json(notes.map(n => ({ ...n, tags: JSON.parse(n.tags_json || '[]') })));
});

// POST /api/dm-notes — create a note
router.post('/', dmOnly, (req, res) => {
    const { title = 'Untitled', content = '', linked_type = 'general', linked_id = null, tags = [] } = req.body;
    const result = db.prepare(`
        INSERT INTO dm_prep_notes (title, content, linked_type, linked_id, tags_json)
        VALUES (?, ?, ?, ?, ?)
    `).run(title, content, linked_type, linked_id, JSON.stringify(tags));

    const note = db.prepare('SELECT * FROM dm_prep_notes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ ...note, tags: JSON.parse(note.tags_json || '[]') });
});

// PATCH /api/dm-notes/:id — update a note
router.patch('/:id', dmOnly, (req, res) => {
    const id = parseInt(req.params.id);
    const existing = db.prepare('SELECT * FROM dm_prep_notes WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    const { title, content, linked_type, linked_id, tags } = req.body;
    db.prepare(`
        UPDATE dm_prep_notes
        SET title = ?, content = ?, linked_type = ?, linked_id = ?, tags_json = ?, updated_at = datetime('now')
        WHERE id = ?
    `).run(
        title ?? existing.title,
        content ?? existing.content,
        linked_type ?? existing.linked_type,
        linked_id !== undefined ? linked_id : existing.linked_id,
        tags !== undefined ? JSON.stringify(tags) : existing.tags_json,
        id
    );

    const updated = db.prepare('SELECT * FROM dm_prep_notes WHERE id = ?').get(id);
    res.json({ ...updated, tags: JSON.parse(updated.tags_json || '[]') });
});

// DELETE /api/dm-notes/:id
router.delete('/:id', dmOnly, (req, res) => {
    const id = parseInt(req.params.id);
    db.prepare('DELETE FROM dm_prep_notes WHERE id = ?').run(id);
    res.json({ success: true });
});

module.exports = router;
