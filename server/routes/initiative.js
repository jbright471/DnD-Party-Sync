const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require('crypto');

// ---- Encounters CRUD ----

router.get('/', (req, res) => {
    try {
        const encounters = db.prepare('SELECT * FROM encounters ORDER BY created_at DESC').all();
        res.json(encounters.map(e => ({ ...e, monsters: JSON.parse(e.monsters) })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

router.delete('/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM encounters WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- Initiative Tracker State ----

router.get('/tracker', (req, res) => {
    try {
        res.json(getTrackerState());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function spawnMonster(monsterData) {
    const { name, hp, ac, initiative_mod, is_hidden, stats } = monsterData;

    // Roll initiative: d20 + modifier
    const initRoll = Math.floor(Math.random() * 20) + 1 + (initiative_mod || 0);
    const instanceId = crypto.randomUUID();
    const statsJson = stats ? JSON.stringify(stats) : null;

    const insertStmt = db.prepare(`
        INSERT INTO initiative_tracker (entity_name, entity_type, initiative, current_hp, max_hp, ac, is_active, is_hidden, sort_order, instance_id, stats_json)
        VALUES (?, 'monster', ?, ?, ?, ?, 0, ?, 0, ?, ?)
    `);

    insertStmt.run(name, initRoll, hp || 10, hp || 10, ac || 10, is_hidden ? 1 : 0, instanceId, statsJson);

    resortTracker();
    return getTrackerState();
}

function startEncounter(encounterId, partyCharacters) {
    db.prepare('DELETE FROM initiative_tracker').run();

    const encounter = db.prepare('SELECT * FROM encounters WHERE id = ?').get(encounterId);
    if (!encounter) return null;

    const monsters = JSON.parse(encounter.monsters);
    const insertStmt = db.prepare(`
        INSERT INTO initiative_tracker (entity_name, entity_type, initiative, current_hp, max_hp, ac, is_active, is_hidden, sort_order, character_id, encounter_id, instance_id)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `);

    let sortOrder = 0;
    const monsterNameCounts = {};

    for (const monster of monsters) {
        const count = monster.count || 1;
        if (!monsterNameCounts[monster.name]) monsterNameCounts[monster.name] = 0;

        for (let i = 0; i < count; i++) {
            monsterNameCounts[monster.name]++;
            const displayName = count > 1 || monsterNameCounts[monster.name] > 1
                ? `${monster.name} ${monsterNameCounts[monster.name]}`
                : monster.name;

            const initRoll = Math.floor(Math.random() * 20) + 1 + (monster.initiative_mod || 0);
            const instanceId = crypto.randomUUID();

            insertStmt.run(
                displayName, 'monster', initRoll,
                monster.hp || 10, monster.hp || 10, monster.ac || 10,
                0, sortOrder++, null, encounterId, instanceId
            );
        }
    }

    for (const pc of partyCharacters) {
        insertStmt.run(
            pc.name, 'pc', 0,
            pc.current_hp, pc.max_hp, pc.ac,
            0, sortOrder++, pc.id, encounterId, crypto.randomUUID()
        );
    }

    resortTracker();
    return getTrackerState();
}

function resortTracker() {
    const entries = db.prepare('SELECT * FROM initiative_tracker ORDER BY initiative DESC, id ASC').all();
    const updateStmt = db.prepare('UPDATE initiative_tracker SET sort_order = ? WHERE id = ?');
    entries.forEach((entry, idx) => updateStmt.run(idx, entry.id));
}

function getTrackerState() {
    const tracker = db.prepare('SELECT * FROM initiative_tracker ORDER BY sort_order ASC').all();
    return tracker.map(entity => {
        let conditions = [];
        let concentrating_on = null;

        if (entity.character_id) {
            const session = db.prepare(
                'SELECT conditions_json, concentrating_on FROM session_states WHERE character_id = ?'
            ).get(entity.character_id);
            conditions = JSON.parse(session?.conditions_json ?? '[]');
            concentrating_on = session?.concentrating_on ?? null;
        }

        let parsedStats = null;
        if (entity.stats_json) {
            try { parsedStats = JSON.parse(entity.stats_json); } catch (_e) {}
        }

        return {
            ...entity,
            conditions,
            concentrating_on,
            stats_json: parsedStats,
            // HP Ghosting: if hidden or monster, we can flag it for the frontend to obscure
            hp_status: entity.current_hp <= 0 ? 'Dead' :
                       (entity.current_hp / entity.max_hp <= 0.25) ? 'Critical' :
                       (entity.current_hp / entity.max_hp <= 0.5) ? 'Bloodied' : 'Healthy'
        };
    });
}

function advanceTurn() {
    const entries = getTrackerState();
    if (entries.length === 0) return [];

    const activeIdx = entries.findIndex(e => e.is_active);
    db.prepare('UPDATE initiative_tracker SET is_active = 0').run();

    const nextIdx = activeIdx === -1 ? 0 : (activeIdx + 1) % entries.length;
    db.prepare('UPDATE initiative_tracker SET is_active = 1 WHERE id = ?').run(entries[nextIdx].id);

    return getTrackerState();
}

function previousTurn() {
    const entries = getTrackerState();
    if (entries.length === 0) return [];

    const activeIdx = entries.findIndex(e => e.is_active);
    db.prepare('UPDATE initiative_tracker SET is_active = 0').run();

    const prevIdx = activeIdx <= 0 ? entries.length - 1 : activeIdx - 1;
    db.prepare('UPDATE initiative_tracker SET is_active = 1 WHERE id = ?').run(entries[prevIdx].id);

    return getTrackerState();
}

function reorderEntry(trackerId, direction) {
    const entries = db.prepare('SELECT id, sort_order FROM initiative_tracker ORDER BY sort_order ASC').all();
    const idx = entries.findIndex(e => e.id === trackerId);
    if (idx < 0) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= entries.length) return;

    // Swap sort_order values
    const updateStmt = db.prepare('UPDATE initiative_tracker SET sort_order = ? WHERE id = ?');
    updateStmt.run(entries[swapIdx].sort_order, entries[idx].id);
    updateStmt.run(entries[idx].sort_order, entries[swapIdx].id);
}

function endEncounter() {
    db.prepare('UPDATE initiative_tracker SET is_active = 0').run();
    db.prepare('DELETE FROM initiative_tracker').run();
}

module.exports = {
    router,
    startEncounter,
    getTrackerState,
    advanceTurn,
    previousTurn,
    endEncounter,
    resortTracker,
    reorderEntry,
    spawnMonster
};
