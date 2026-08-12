const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require('crypto');
const { normalizeBossPhases } = require('../services/bossPhases');
const { projectInitiativeState } = require('../lib/clientStateProjection');
const { getPermissions } = require('../lib/permissions');

// ---- Encounters CRUD ----

router.get('/', (req, res) => {
    try {
        const encounters = db.prepare('SELECT * FROM encounters ORDER BY created_at DESC').all();
        res.json(encounters.map(e => ({ 
            ...e, 
            monsters: JSON.parse(e.monsters || '[]'),
            tags: JSON.parse(e.tags || '[]'),
            environment_json: JSON.parse(e.environment_json || '[]'),
            maps_json: JSON.parse(e.maps_json || '[]'),
            notes_json: JSON.parse(e.notes_json || '[]'),
            automation_presets_json: JSON.parse(e.automation_presets_json || '[]')
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', (req, res) => {
    const { name, monsters, difficulty, tags, environment_json, maps_json, notes_json, automation_presets_json } = req.body;
    if (!name || !monsters || !Array.isArray(monsters)) {
        return res.status(400).json({ error: 'name and monsters[] required' });
    }
    try {
        const result = db.prepare(`
            INSERT INTO encounters (
                name, monsters, difficulty, tags, environment_json, maps_json, notes_json, automation_presets_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            name, 
            JSON.stringify(monsters),
            difficulty || null,
            JSON.stringify(tags || []),
            JSON.stringify(environment_json || []),
            JSON.stringify(maps_json || []),
            JSON.stringify(notes_json || []),
            JSON.stringify(automation_presets_json || [])
        );
        const enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ 
            ...enc, 
            monsters: JSON.parse(enc.monsters || '[]'),
            tags: JSON.parse(enc.tags || '[]'),
            environment_json: JSON.parse(enc.environment_json || '[]'),
            maps_json: JSON.parse(enc.maps_json || '[]'),
            notes_json: JSON.parse(enc.notes_json || '[]'),
            automation_presets_json: JSON.parse(enc.automation_presets_json || '[]')
        });
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

router.get('/:id/export', (req, res) => {
    try {
        const enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(req.params.id);
        if (!enc) return res.status(404).json({ error: 'Encounter not found' });
        
        const exportData = {
            ...enc,
            monsters: JSON.parse(enc.monsters || '[]'),
            tags: JSON.parse(enc.tags || '[]'),
            environment_json: JSON.parse(enc.environment_json || '[]'),
            maps_json: JSON.parse(enc.maps_json || '[]'),
            notes_json: JSON.parse(enc.notes_json || '[]'),
            automation_presets_json: JSON.parse(enc.automation_presets_json || '[]')
        };
        
        res.setHeader('Content-disposition', `attachment; filename=encounter_${enc.id}.json`);
        res.setHeader('Content-type', 'application/json');
        res.send(JSON.stringify(exportData, null, 2));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/duplicate', (req, res) => {
    try {
        const enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(req.params.id);
        if (!enc) return res.status(404).json({ error: 'Encounter not found' });
        
        const result = db.prepare(`
            INSERT INTO encounters (
                name, monsters, difficulty, tags, environment_json, maps_json, notes_json, automation_presets_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            enc.name + ' (Copy)', 
            enc.monsters,
            enc.difficulty,
            enc.tags,
            enc.environment_json,
            enc.maps_json,
            enc.notes_json,
            enc.automation_presets_json
        );
        
        const newEnc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ 
            ...newEnc, 
            monsters: JSON.parse(newEnc.monsters || '[]'),
            tags: JSON.parse(newEnc.tags || '[]'),
            environment_json: JSON.parse(newEnc.environment_json || '[]'),
            maps_json: JSON.parse(newEnc.maps_json || '[]'),
            notes_json: JSON.parse(newEnc.notes_json || '[]'),
            automation_presets_json: JSON.parse(newEnc.automation_presets_json || '[]')
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- Initiative Tracker State ----

router.get('/tracker', (req, res) => {
    try {
        res.json(projectInitiativeState(getTrackerState(), {
            role: 'public',
            permissions: getPermissions(db),
        }));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function spawnMonster(monsterData) {
    const { name, hp, ac, initiative_mod, is_hidden, stats, phases } = monsterData;

    // Roll initiative: d20 + modifier
    const initRoll = Math.floor(Math.random() * 20) + 1 + (initiative_mod || 0);
    const instanceId = crypto.randomUUID();
    const statsJson = stats ? JSON.stringify(stats) : null;
    const bossPhases = normalizeBossPhases(phases, { maxHp: hp || 10, ac: ac || 10 });

    const insertStmt = db.prepare(`
        INSERT INTO initiative_tracker (
            entity_name, entity_type, initiative, current_hp, max_hp, ac,
            is_active, is_hidden, sort_order, instance_id, stats_json,
            boss_phases_json, current_phase_index, phase_name
        )
        VALUES (?, 'monster', ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, 0, ?)
    `);

    insertStmt.run(
        name, initRoll, hp || 10, hp || 10, ac || 10,
        is_hidden ? 1 : 0, instanceId, statsJson,
        JSON.stringify(bossPhases), bossPhases[0]?.name || null,
    );

    resortTracker();
    return getTrackerState();
}

function startEncounter(encounterId, partyCharacters) {
    db.prepare('DELETE FROM initiative_tracker').run();

    const encounter = db.prepare('SELECT * FROM encounters WHERE id = ?').get(encounterId);
    if (!encounter) return null;

    const monsters = JSON.parse(encounter.monsters);
    const insertStmt = db.prepare(`
        INSERT INTO initiative_tracker (
            entity_name, entity_type, initiative, current_hp, max_hp, ac,
            is_active, is_hidden, sort_order, character_id, encounter_id, instance_id,
            stats_json, boss_phases_json, current_phase_index, phase_name
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 0, ?)
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
            const bossPhases = normalizeBossPhases(monster.phases, { maxHp: monster.hp || 10, ac: monster.ac || 10 });

            insertStmt.run(
                displayName, 'monster', initRoll,
                monster.hp || 10, monster.hp || 10, monster.ac || 10,
                monster.is_hidden ? 1 : 0, sortOrder++, null, encounterId, instanceId,
                monster.stats ? JSON.stringify(monster.stats) : null,
                JSON.stringify(bossPhases), bossPhases[0]?.name || null,
            );
        }
    }

    for (const pc of partyCharacters) {
        insertStmt.run(
            pc.name, 'pc', 0,
            pc.current_hp, pc.max_hp, pc.ac,
            0, sortOrder++, pc.id, encounterId, crypto.randomUUID(),
            null, '[]', null,
        );
    }

    // Load Sandboxed Automation Presets
    let presets = [];
    try { presets = JSON.parse(encounter.automation_presets_json || '[]'); } catch { presets = []; }
    if (presets.length > 0) {
        const insertPreset = db.prepare(`
            INSERT INTO automation_presets (name, preset_type, trigger_phase, effects_json, targets_json, description, encounter_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const preset of presets) {
            insertPreset.run(
                preset.name,
                preset.preset_type || 'turn_trigger',
                preset.trigger_phase || null,
                typeof preset.effects_json === 'string' ? preset.effects_json : JSON.stringify(preset.effects_json || []),
                typeof preset.targets_json === 'string' ? preset.targets_json : JSON.stringify(preset.targets_json || '"party"'),
                preset.description || '',
                encounterId
            );
        }
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
        let buffs = [];
        let concentrating_on = null;

        if (entity.character_id) {
            const session = db.prepare(
                'SELECT conditions_json, buffs_json, concentrating_on FROM session_states WHERE character_id = ?'
            ).get(entity.character_id);
            conditions = JSON.parse(session?.conditions_json ?? '[]');
            buffs = JSON.parse(session?.buffs_json ?? '[]');
            concentrating_on = session?.concentrating_on ?? null;
        } else {
            try { conditions = JSON.parse(entity.conditions_json || '[]'); } catch (_e) { conditions = []; }
            try { buffs = JSON.parse(entity.buffs_json || '[]'); } catch (_e) { buffs = []; }
        }

        let parsedStats = null;
        if (entity.stats_json) {
            try { parsedStats = JSON.parse(entity.stats_json); } catch (_e) {}
        }
        let bossPhases = [];
        try { bossPhases = JSON.parse(entity.boss_phases_json || '[]'); } catch (_e) {}

        return {
            ...entity,
            conditions,
            buffs,
            concentrating_on,
            stats_json: parsedStats,
            boss_phases: bossPhases,
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
    db.prepare('DELETE FROM automation_presets WHERE encounter_id IS NOT NULL').run();
}

/**
 * Roll d20 + DEX modifier for every combatant in the tracker.
 * PCs: DEX from character data_json / stats column.
 * Monsters: DEX from stats_json if available, otherwise mod = 0.
 * Returns the re-sorted tracker state.
 */
function rollAllInitiative() {
    const entries = db.prepare('SELECT * FROM initiative_tracker').all();
    const updateStmt = db.prepare('UPDATE initiative_tracker SET initiative = ? WHERE id = ?');

    for (const entry of entries) {
        let dexMod = 0;
        if (entry.character_id) {
            const char = db.prepare('SELECT stats, data_json FROM characters WHERE id = ?').get(entry.character_id);
            if (char) {
                let abilityScores = {};
                if (char.data_json) {
                    try { abilityScores = JSON.parse(char.data_json).abilityScores || {}; } catch (_) {}
                }
                if (!abilityScores.DEX && char.stats) {
                    try { abilityScores = JSON.parse(char.stats); } catch (_) {}
                }
                const dex = Number(abilityScores.DEX) || 10;
                dexMod = Math.floor((dex - 10) / 2);
            }
        } else if (entry.stats_json) {
            try {
                const stats = JSON.parse(entry.stats_json);
                // open5e uses 'dexterity'; internally we use 'DEX'
                const dex = Number(stats.dexterity || stats.DEX) || 10;
                dexMod = Math.floor((dex - 10) / 2);
            } catch (_) {}
        }
        const roll = Math.floor(Math.random() * 20) + 1 + dexMod;
        updateStmt.run(roll, entry.id);
    }

    resortTracker();
    return getTrackerState();
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
    spawnMonster,
    rollAllInitiative,
};
