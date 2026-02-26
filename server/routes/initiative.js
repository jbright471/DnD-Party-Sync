const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require('crypto');

// ---- Encounters CRUD ----

// GET /api/encounters — list all saved encounters
router.get('/', (req, res) => {
    try {
        const encounters = db.prepare('SELECT * FROM encounters ORDER BY created_at DESC').all();
        res.json(encounters.map(e => ({ ...e, monsters: JSON.parse(e.monsters) })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/encounters — save a pre-built encounter
router.post('/', (req, res) => {
    const { name, monsters } = req.body;
    if (!name || !monsters || !Array.isArray(monsters)) {
        return res.status(400).json({ error: 'name and monsters[] required' });
    }
    try {
        const result = db.prepare(
            'INSERT INTO encounters (name, monsters) VALUES (?, ?)'
        ).run(name, JSON.stringify(monsters));
        const enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ ...enc, monsters: JSON.parse(enc.monsters) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/encounters/:id
router.delete('/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM encounters WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- Initiative Tracker State ----

// GET /api/initiative — get current tracker state
router.get('/tracker', (req, res) => {
    try {
        const tracker = db.prepare('SELECT * FROM initiative_tracker ORDER BY sort_order ASC, initiative DESC').all();
        res.json(tracker);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper: Load encounter + party into initiative tracker
function startEncounter(encounterId, partyCharacters) {
    // Clear any existing tracker state
    db.prepare('DELETE FROM initiative_tracker').run();

    const encounter = db.prepare('SELECT * FROM encounters WHERE id = ?').get(encounterId);
    if (!encounter) return null;

    const monsters = JSON.parse(encounter.monsters);
    const insertStmt = db.prepare(`
    INSERT INTO initiative_tracker (entity_name, entity_type, initiative, current_hp, max_hp, ac, is_active, sort_order, character_id, encounter_id, instance_id)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
  `);

    let sortOrder = 0;

    // Track monster name counts for duplicate disambiguation
    const monsterNameCounts = {};

    // Add monsters from encounter
    for (const monster of monsters) {
        const count = monster.count || 1;
        if (!monsterNameCounts[monster.name]) monsterNameCounts[monster.name] = 0;

        for (let i = 0; i < count; i++) {
            monsterNameCounts[monster.name]++;
            const instanceNum = monsterNameCounts[monster.name];
            const displayName = count > 1 || monsterNameCounts[monster.name] > 1
                ? `${monster.name} ${instanceNum}`
                : monster.name;

            // Roll initiative: d20 + modifier
            const initRoll = Math.floor(Math.random() * 20) + 1 + (monster.initiative_mod || 0);
            const instanceId = crypto.randomUUID();

            insertStmt.run(
                displayName, 'monster', initRoll,
                monster.hp || 10, monster.hp || 10, monster.ac || 10,
                sortOrder++, null, encounterId, instanceId
            );
        }
    }

    // Add PCs from party
    for (const pc of partyCharacters) {
        // PCs roll their own initiative — use 0 as placeholder, DM/players set it
        insertStmt.run(
            pc.name, 'pc', 0,
            pc.current_hp, pc.max_hp, pc.ac,
            sortOrder++, pc.id, encounterId, crypto.randomUUID()
        );
    }

    // Sort by initiative descending and update sort_order
    resortTracker();

    return getTrackerState();
}

function resortTracker() {
    const entries = db.prepare('SELECT * FROM initiative_tracker ORDER BY initiative DESC, id ASC').all();
    const updateStmt = db.prepare('UPDATE initiative_tracker SET sort_order = ? WHERE id = ?');
    entries.forEach((entry, idx) => updateStmt.run(idx, entry.id));
}

function getTrackerState() {
    return db.prepare('SELECT * FROM initiative_tracker ORDER BY sort_order ASC').all();
}

function advanceTurn() {
    const entries = getTrackerState();
    if (entries.length === 0) return [];

    const activeIdx = entries.findIndex(e => e.is_active);

    // Clear all active state
    db.prepare('UPDATE initiative_tracker SET is_active = 0').run();

    // Set the next entity as active
    const nextIdx = activeIdx === -1 ? 0 : (activeIdx + 1) % entries.length;
    db.prepare('UPDATE initiative_tracker SET is_active = 1 WHERE id = ?').run(entries[nextIdx].id);

    return getTrackerState();
}

function endEncounter() {
    // Explicitly reset all is_active states before clearing
    db.prepare('UPDATE initiative_tracker SET is_active = 0').run();
    db.prepare('DELETE FROM initiative_tracker').run();
}

module.exports = { router, startEncounter, getTrackerState, advanceTurn, endEncounter, resortTracker };
