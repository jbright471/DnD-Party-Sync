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
        
        // Initialize default session state
        db.prepare(`
          INSERT INTO session_states
            (character_id, current_hp, temp_hp, death_saves_json,
             conditions_json, buffs_json, concentrating_on,
             slots_used_json, hd_used_json, feature_uses_json, active_features_json)
          VALUES (?, ?, 0, '{"successes":0,"failures":0}', '[]', '[]', NULL, '{}', '{}', '{}', '[]')
        `).run(newChar.id, newChar.current_hp);

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

// DELETE /api/characters/:id
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare('DELETE FROM characters WHERE id = ?').run(id);
        // Also cleanup session state
        db.prepare('DELETE FROM session_states WHERE character_id = ?').run(id);
        res.json({ success: true, message: 'Character deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Weapon Attack CRUD ──────────────────────────────────────────────────────

function readAttacks(characterId) {
    const char = db.prepare('SELECT data_json FROM characters WHERE id = ?').get(characterId);
    if (!char) return null;
    try {
        const data = JSON.parse(char.data_json || '{}');
        return Array.isArray(data.attacks) ? data.attacks : [];
    } catch { return []; }
}

function writeAttacks(characterId, attacks) {
    const char = db.prepare('SELECT data_json FROM characters WHERE id = ?').get(characterId);
    if (!char) return false;
    let data = {};
    try { data = JSON.parse(char.data_json || '{}'); } catch { data = {}; }
    data.attacks = attacks;
    db.prepare('UPDATE characters SET data_json = ? WHERE id = ?').run(JSON.stringify(data), characterId);
    return true;
}

// GET /api/characters/:id/weapons
router.get('/:id/weapons', (req, res) => {
    try {
        const attacks = readAttacks(req.params.id);
        if (attacks === null) return res.status(404).json({ error: 'Character not found' });
        res.json(attacks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/characters/:id/weapons
router.post('/:id/weapons', (req, res) => {
    try {
        const attacks = readAttacks(req.params.id);
        if (attacks === null) return res.status(404).json({ error: 'Character not found' });
        const weapon = req.body;
        if (!weapon.id || !weapon.name) return res.status(400).json({ error: 'id and name required' });
        // Prevent duplicate ids
        const existing = attacks.findIndex(a => a.id === weapon.id);
        if (existing >= 0) attacks[existing] = weapon;
        else attacks.push(weapon);
        writeAttacks(req.params.id, attacks);
        res.status(201).json({ success: true, weapon });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/characters/:id/weapons/:weaponId
router.delete('/:id/weapons/:weaponId', (req, res) => {
    try {
        const attacks = readAttacks(req.params.id);
        if (attacks === null) return res.status(404).json({ error: 'Character not found' });
        const filtered = attacks.filter(a => a.id !== req.params.weaponId);
        writeAttacks(req.params.id, filtered);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = { router, getAllCharacters };
