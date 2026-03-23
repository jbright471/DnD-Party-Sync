require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { runMigrations } = require('./schema');
const { router: characterRouter, getAllCharacters } = require('./routes/characters');
const importerRouter = require('./routes/importer');
const { router: initiativeRouter, startEncounter, getTrackerState, advanceTurn, endEncounter, resortTracker, spawnMonster } = require('./routes/initiative');
const mapsRouter = require('./routes/maps');
const npcsRouter = require('./routes/npcs');
const lootRouter = require('./routes/loot');
const questsRouter = require('./routes/quests');
const worldRouter = require('./routes/world');
const notesRouter = require('./routes/notes');
const homebrewRouter = require('./routes/homebrew');
const db = require('./db');
const { askRulesAssistant, resolveActionLLM, generateSessionRecap, generateLoreLLM } = require('./ollama');
const { backupDatabase } = require('./backup');
const cron = require('node-cron');
const automationRouter = require('./routes/automation');
const dmNotesRouter = require('./routes/dmNotes');
const {
    applyPartyEffect,
    processTurnTriggers,
    processAurasForTurn,
    getCombatTimeline,
    getFilteredTimeline,
    clearTimeline,
    writeConcentrationCheckEvent,
} = require('./lib/effectEngine');

const {
    applyDamageEvent,
    applyHealEvent,
    setTempHpEvent,
    castConcentrationSpellEvent,
    dropConcentrationEvent,
    applyConditionEvent,
    removeConditionEvent,
    useSpellSlotEvent,
    shortRestEvent,
    longRestEvent,
    getResolvedCharacterState,
    getSessionState,
    saveSessionState,
    getCharacterData,
    applyBuffEvent,
    removeBuffEvent
} = require('./lib/rulesIntegration');

function applyEffect(effect) {
    if (!effect.characterId) return { success: false, error: 'No characterId provided' };

    if (effect.type === 'hp') {
        if (effect.delta < 0) {
            return applyDamageEvent(db, effect.characterId, Math.abs(effect.delta), effect.damageType || 'untyped');
        } else {
            return applyHealEvent(db, effect.characterId, effect.delta);
        }
    }
    if (effect.type === 'character') {
        const { updates, characterId } = effect;
        if (updates.conditions) {
            for (const cond of updates.conditions) {
                applyConditionEvent(db, characterId, cond);
            }
        }
        if (updates.concentration_spell !== undefined) {
            if (updates.concentration_spell) {
                castConcentrationSpellEvent(db, characterId, updates.concentration_spell);
            } else {
                dropConcentrationEvent(db, characterId);
            }
        }
        if (updates.spell_slots) {
            const state = getSessionState(db, characterId);
            if (state) {
                state.spellSlotsUsed = { ...state.spellSlotsUsed, ...updates.spell_slots };
                saveSessionState(db, state);
            }
        }
        return { success: true, logMessage: 'Character updated via AI' };
    }
    if (effect.type === 'buff') {
        return applyBuffEvent(db, effect.characterId, effect.buffData);
    }
    return { success: false, error: `Unknown effect type: ${effect.type}` };
}

// --- Bootstrap ---
runMigrations();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    },
});

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- REST Routes ---
app.use('/api/characters', characterRouter);
app.use('/api/characters/import', importerRouter);
app.use('/api/encounters', initiativeRouter);
app.use('/api/initiative', initiativeRouter);
app.use('/api/maps', mapsRouter);
app.use('/api/npcs', npcsRouter);
app.use('/api/loot', lootRouter);
app.use('/api/quests', questsRouter);
app.use('/api/world', worldRouter);
app.use('/api/notes', notesRouter);
app.use('/api/homebrew', homebrewRouter);
app.use('/api/automation', automationRouter);
app.use('/api/dm-notes', dmNotesRouter);

// DM Auth — validates PIN and returns a session token stored in campaign_state
const { randomUUID } = require('crypto');
app.post('/api/auth/dm', (req, res) => {
    const { pin } = req.body;
    const masterPin = process.env.DM_PIN || '1234';
    if (pin === masterPin) {
        const token = randomUUID();
        db.prepare("INSERT OR REPLACE INTO campaign_state (key, value) VALUES ('dm_token', ?)").run(token);
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, error: 'Invalid PIN' });
    }
});

function requireDm(token) {
    if (!token) return false;
    const row = db.prepare("SELECT value FROM campaign_state WHERE key = 'dm_token'").get();
    return row && row.value === token;
}

app.get('/api/log', (req, res) => {
    const logs = db.prepare('SELECT * FROM action_log ORDER BY id DESC LIMIT 100').all();
    res.json(logs.reverse());
});

app.post('/api/lore', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt required' });
    try {
        const answer = await generateLoreLLM(prompt);
        res.json({ answer });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/chat', async (req, res) => {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'Question required' });
    const partyContext = getAllCharacters();
    const answer = await askRulesAssistant(question, partyContext);
    res.json({ answer });
});

app.get('/api/offline-bundle', (req, res) => {
    try {
        const { characterId } = req.query;
        const bundle = { character: null, recentEffects: [], timestamp: new Date().toISOString() };
        if (characterId) {
            const char = getCharacterData(db, parseInt(characterId));
            bundle.character = char;
            bundle.recentEffects = getFilteredTimeline(db, { limit: 50, targetId: parseInt(characterId) });
        }
        res.set('Cache-Control', 'no-cache');
        res.json(bundle);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/effect-timeline', (req, res) => {
    try {
        res.json(getCombatTimeline(db));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/recaps', (req, res) => {
    try {
        const recaps = db.prepare('SELECT * FROM session_recaps ORDER BY created_at DESC').all();
        res.json(recaps);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Global State ---
let isApprovalMode = false;
const playerSocketMap = new Map();
const voiceRoom = new Map(); // socketId -> { characterId, playerName }

// Combat round/turn tracking (reset on start/end encounter)
let currentCombatRound = 0;
let currentTurnIndex = 0;

// --- Helpers ---
function broadcastPartyState() {
    const characters = getAllCharacters();
    const resolved = characters.map(char => {
        const resolvedState = getResolvedCharacterState(db, char.id);
        if (resolvedState) return resolvedState;
        return {
            ...char,
            currentHp: char.current_hp,
            maxHp: char.max_hp,
            tempHp: 0,
            conditions: [],
            concentratingOn: null,
            spellSlotsUsed: {},
            spellSlotsMax: JSON.parse(char.spell_slots || '{}'),
            deathSaves: { successes: 0, failures: 0 },
            abilityScores: JSON.parse(char.stats || '{}'),
            skills: JSON.parse(char.skills || '[]'),
            features: JSON.parse(char.features || '[]'),
            spells: JSON.parse(char.spells || '[]'),
            inventory: JSON.parse(char.inventory || '[]'),
            homebrewInventory: JSON.parse(char.homebrew_inventory || '[]')
        };
    });
    io.emit('party_state', resolved);
}

function broadcastLogs() {
    const logs = db.prepare('SELECT * FROM action_log ORDER BY id DESC LIMIT 100').all();
    io.emit('action_logged', logs.reverse());
}

function broadcastInitiative() {
    const tracker = getTrackerState();
    io.emit('initiative_state', tracker);
}

function broadcastNotes() {
    const notes = db.prepare('SELECT * FROM party_notes ORDER BY updated_at DESC').all();
    io.emit('notes_state', notes);
}

function broadcastWorldState() {
    try {
        const time = db.prepare('SELECT value FROM campaign_state WHERE key = "current_time"').get();
        const weather = db.prepare('SELECT value FROM campaign_state WHERE key = "current_weather"').get();
        io.emit('world_state', {
            time: JSON.parse(time?.value || '{}'),
            weather: JSON.parse(weather?.value || '{}')
        });
    } catch (_e) {}
}

function broadcastTimeline() {
    io.emit('timeline_update', getCombatTimeline(db));
}

function broadcastWorldMapState() {
    try {
        const map = db.prepare('SELECT * FROM maps WHERE is_overworld = 1').get();
        if (map) {
            const markers = db.prepare('SELECT * FROM map_markers WHERE parent_map_id = ?').all(map.id);
            const map_url = map.image_path ? `/api/maps/file/${path.basename(map.image_path)}` : null;
            io.emit('world_map_state', { ...map, map_url, markers });
        } else {
            io.emit('world_map_state', null);
        }
    } catch (e) { console.error('[WorldMap] Broadcast error:', e); }
}

function broadcastMapState() {
    const map = db.prepare('SELECT * FROM maps WHERE is_active = 1').get();
    if (map) {
        const tokens = db.prepare('SELECT * FROM map_tokens WHERE map_id = ?').all(map.id);
        const markers = db.prepare('SELECT * FROM map_markers WHERE parent_map_id = ?').all(map.id);
        const image_data = map.image_path ? `/api/maps/file/${path.basename(map.image_path)}` : null;
        io.emit('map_state', { ...map, image_data, tokens, markers });
    } else {
        io.emit('map_state', null);
    }
}

function logAction(actor, description, status = 'applied', effectsJson = null) {
    db.prepare(
        "INSERT INTO action_log (timestamp, actor, action_description, status, effects_json) VALUES (datetime('now'), ?, ?, ?, ?)"
    ).run(actor, description, status, effectsJson);
    broadcastLogs();
}

// --- Socket.io ---
io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // DM room join — validates stored token before admitting to dm_room
    socket.on('dm_join_room', ({ dmToken }) => {
        if (requireDm(dmToken)) {
            socket.join('dm_room');
            socket.dmAuthenticated = true;
            socket.emit('dm_room_joined', { success: true });
        }
    });

    // Relay DM prep note mutations to dm_room so other DM tabs stay in sync
    socket.on('relay_dm_note', ({ event, data }) => {
        if (socket.dmAuthenticated) {
            socket.to('dm_room').emit(event, data);
        }
    });

    broadcastPartyState();
    broadcastLogs();
    broadcastInitiative();
    broadcastNotes();
    broadcastMapState();
    broadcastWorldMapState();
    broadcastWorldState();
    socket.emit('approval_mode', isApprovalMode);
    socket.emit('voice_room_state', [...voiceRoom.entries()].map(([id, info]) => ({ socketId: id, ...info })));
    socket.emit('timeline_update', getCombatTimeline(db));

    socket.on('log_action', async ({ actor, description, useLlm }, callback) => {
        if (!actor || !description) return callback?.({ success: false });
        if (!useLlm) {
            logAction(actor, description);
            broadcastPartyState();
            return callback?.({ success: true });
        }
        const partyContext = db.prepare('SELECT * FROM characters').all();
        const effectsArray = await resolveActionLLM(description, partyContext);
        if (!effectsArray) {
            logAction(actor, description + ' (LLM failed to parse)');
            broadcastPartyState();
            return callback?.({ success: true, warning: 'LLM failed to parse.' });
        }
        if (isApprovalMode) {
            logAction(actor, description, 'pending', JSON.stringify({ type: 'multi', effects: effectsArray }));
            return callback?.({ success: true });
        }
        for (const effect of effectsArray) applyEffect(effect);
        logAction(actor, description + ' (Resolved by LLM)');
        broadcastPartyState();
        callback?.({ success: true });
    });

    socket.on('toggle_approval_mode', (mode) => {
        isApprovalMode = !!mode;
        io.emit('approval_mode', isApprovalMode);
        logAction('DM', `Approval Mode is now ${isApprovalMode ? 'ON' : 'OFF'}.`);
    });

    socket.on('resolve_pending_action', ({ logId, approved }) => {
        const log = db.prepare('SELECT * FROM action_log WHERE id = ?').get(logId);
        if (!log || log.status !== 'pending') return;
        if (!approved) {
            db.prepare("UPDATE action_log SET status = 'rejected' WHERE id = ?").run(logId);
            broadcastLogs();
            return;
        }
        if (log.effects_json) {
            const effectsObj = JSON.parse(log.effects_json);
            if (effectsObj.type === 'multi' && Array.isArray(effectsObj.effects)) {
                for (const effect of effectsObj.effects) applyEffect(effect);
            } else {
                applyEffect(effectsObj);
            }
        }
        db.prepare("UPDATE action_log SET status = 'applied' WHERE id = ?").run(logId);
        broadcastLogs();
        broadcastPartyState();
    });

    socket.on('update_hp', ({ characterId, delta, actor, damageType, skipConcentrationAutoRoll }) => {
        if (isApprovalMode) {
            const char = db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId);
            if (!char) return;
            const actionText = delta < 0 ? `${char.name} takes ${Math.abs(delta)} ${damageType || 'untyped'} damage` : `${char.name} is healed for ${delta} HP`;
            logAction(actor || 'Player', actionText, 'pending', JSON.stringify({ type: 'hp', characterId, delta, damageType }));
            return;
        }
        let result = delta < 0 ? applyDamageEvent(db, characterId, Math.abs(delta), damageType || 'untyped') : applyHealEvent(db, characterId, delta);
        if (result?.success) {
            if (delta < 0 && result.concentrationCheck && !skipConcentrationAutoRoll) {
                const state = getSessionState(db, characterId);
                const charData = getCharacterData(db, characterId);
                const conScore = charData?.abilityScores?.CON ?? 10;
                const conMod = Math.floor((conScore - 10) / 2);
                const roll = Math.floor(Math.random() * 20) + 1;
                const total = roll + conMod;
                const dc = result.concentrationCheck.dc;
                const passed = total >= dc;
                const spellName = state?.concentratingOn ?? 'Unknown Spell';
                const charName = charData?.name ?? `Character ${characterId}`;

                writeConcentrationCheckEvent(
                    db, characterId, charName, spellName,
                    roll, conMod, total, dc, passed,
                    currentCombatRound, currentTurnIndex
                );

                if (!passed) {
                    dropConcentrationEvent(db, characterId);
                    io.emit('concentration_broken', { characterId, characterName: charName, spellName, roll, total, dc });
                } else {
                    io.emit('concentration_maintained', { characterId, characterName: charName, spellName, roll, total, dc });
                }
                broadcastTimeline();
            } else if (delta < 0 && result.concentrationCheck && skipConcentrationAutoRoll) {
                // Manual roll mode — let client decide
                const state = getSessionState(db, characterId);
                io.emit('concentration_check_required', { characterId, spellName: state?.concentratingOn, dc: result.concentrationCheck.dc });
            }
            logAction(actor || 'System', result.logMessage);
            broadcastPartyState();
        }
    });

    socket.on('set_temp_hp', ({ characterId, amount, actor }) => {
        const result = setTempHpEvent(db, characterId, amount);
        if (result.success) { logAction(actor || 'System', result.logMessage); broadcastPartyState(); }
    });

    socket.on('cast_concentration_spell', ({ characterId, spellName, slotLevel, actor }) => {
        const result = castConcentrationSpellEvent(db, characterId, spellName, slotLevel ?? null);
        if (result.success) { logAction(actor || 'System', result.logMessage); broadcastPartyState(); }
        else socket.emit('rules_error', { message: result.error });
    });

    socket.on('drop_concentration', ({ characterId, actor }) => {
        const result = dropConcentrationEvent(db, characterId);
        if (result.success) { logAction(actor || 'System', result.logMessage); broadcastPartyState(); }
    });

    socket.on('concentration_check_result', ({ characterId, spellName, passed, dc }) => {
        if (!passed) {
            const result = dropConcentrationEvent(db, characterId);
            if (result.success) { logAction('System', result.logMessage); broadcastPartyState(); }
        }
        const char = db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId);
        const label = char ? char.name : `Character ${characterId}`;
        logAction(label, `${label} ${passed ? 'maintained' : 'lost'} concentration on ${spellName} (DC ${dc}).`);
    });

    socket.on('apply_condition', ({ characterId, condition, actor }) => {
        const result = applyConditionEvent(db, characterId, condition);
        if (result.success && !result.alreadyPresent) { logAction(actor || 'System', result.logMessage); broadcastPartyState(); }
    });

    socket.on('remove_condition', ({ characterId, condition, actor }) => {
        const result = removeConditionEvent(db, characterId, condition);
        if (result.success) { logAction(actor || 'System', result.logMessage); broadcastPartyState(); }
    });

    socket.on('apply_buff', ({ characterIds, buffData, actor }) => {
        const ids = Array.isArray(characterIds) ? characterIds : [characterIds];
        ids.forEach(id => {
            const result = applyBuffEvent(db, id, buffData);
            if (result.success) logAction(actor || 'System', result.logMessage);
        });
        broadcastPartyState();
    });

    socket.on('remove_buff', ({ characterId, buffId, actor }) => {
        const result = removeBuffEvent(db, characterId, buffId);
        if (result.success) { logAction(actor || 'System', result.logMessage); broadcastPartyState(); }
    });

    socket.on('use_spell_slot', ({ characterId, slotLevel, actor }) => {
        const result = useSpellSlotEvent(db, characterId, slotLevel);
        if (result.success) { logAction(actor || 'System', result.logMessage); broadcastPartyState(); }
        else socket.emit('rules_error', { message: result.error });
    });

    socket.on('short_rest', ({ characterId, actor }) => {
        const result = shortRestEvent(db, characterId);
        if (result.success) { 
            logAction(actor || 'System', result.logMessage); 
            broadcastPartyState();
            // Advance time +1hr
            socket.emit('advance_time', { minutes: 60 });
        }
    });

    socket.on('long_rest', ({ characterId, actor }) => {
        const result = longRestEvent(db, characterId);
        if (result.success) { 
            logAction(actor || 'System', result.logMessage); 
            broadcastPartyState();
            // Advance time +8hr
            socket.emit('advance_time', { minutes: 480 });
        }
    });

    socket.on('advance_time', ({ minutes: _minutes }) => {
        // Logic handled in Rest API but for socket we can call it
        // Or just re-broadcast world state after an API call
        broadcastWorldState();
    });

    socket.on('update_character', ({ characterId, updates, actor }) => {
        if (updates.toggleItem) {
            const { itemId, isHomebrew, type } = updates.toggleItem;
            try {
                const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
                if (!char) return;
                const updateInventory = (inv) => {
                    if (type === 'attuned') {
                        const attunedCount = inv.filter(i => i.isAttuned && i.id !== itemId && i.name !== itemId).length;
                        const item = inv.find(i => i.id === itemId || i.name === itemId);
                        if (item && !item.isAttuned && attunedCount >= 3) {
                            socket.emit('rules_error', { message: "Maximum attunement slots (3) reached!" });
                            return inv;
                        }
                    }
                    return inv.map((i, idx) => {
                        const currentId = i.id || `inv-${idx}`;
                        if (currentId === itemId || i.name === itemId) {
                            if (type === 'attuned') return { ...i, isAttuned: !i.isAttuned };
                            return { ...i, equipped: !i.equipped };
                        }
                        return i;
                    });
                };
                if (isHomebrew) {
                    const newInv = updateInventory(JSON.parse(char.homebrew_inventory || '[]'));
                    db.prepare('UPDATE characters SET homebrew_inventory = ? WHERE id = ?').run(JSON.stringify(newInv), characterId);
                } else {
                    const newInv = updateInventory(JSON.parse(char.inventory || '[]'));
                    db.prepare('UPDATE characters SET inventory = ? WHERE id = ?').run(JSON.stringify(newInv), characterId);
                }
                logAction(actor || 'System', `Item ${type} toggled.`);
                broadcastPartyState();
                return;
            } catch (err) { console.error('[Socket] Toggle Item Error:', err); return; }
        }
        if (isApprovalMode) {
            const char = db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId);
            if (!char) return;
            logAction(actor || 'Player', `${char.name} was updated.`, 'pending', JSON.stringify({ type: 'character', characterId, updates }));
        } else {
            applyEffect({ type: 'character', characterId, updates });
            logAction(actor || 'System', 'Character state update applied.');
            broadcastPartyState();
        }
    });

    socket.on('dice_roll', ({ actor, sides, count, modifier, total, rolls, isPrivate: _isPrivate }) => {
        const rollString = `${count}d${sides}${modifier !== 0 ? (modifier > 0 ? '+' + modifier : modifier) : ''}`;
        const detailString = rolls.length > 1 ? ` (${rolls.join(' + ')})` : '';
        const msg = `rolled ${total} on ${rollString}${detailString}`;
        logAction(actor || 'Someone', msg);
    });

    socket.on('spawn_monster', (monsterData) => {
        spawnMonster(monsterData);
        broadcastInitiative();
        logAction('DM', `Spawned ${monsterData.name} into initiative.`);
    });

    socket.on('toggle_entity_visibility', ({ entityId }) => {
        const entity = db.prepare('SELECT is_hidden FROM initiative_tracker WHERE id = ?').get(entityId);
        if (entity) {
            db.prepare('UPDATE initiative_tracker SET is_hidden = ? WHERE id = ?').run(entity.is_hidden ? 0 : 1, entityId);
            broadcastInitiative();
        }
    });

    socket.on('play_sound', ({ soundName, url, action }) => {
        io.emit('sound_event', { soundName, url, action });
        logAction('DM', `${action === 'play' ? 'Started' : 'Stopped'} atmospheric sound: ${soundName}`);
    });

    socket.on('activate_map', ({ mapId }) => {
        db.prepare('UPDATE maps SET is_active = 0').run();
        db.prepare('UPDATE maps SET is_active = 1 WHERE id = ?').run(mapId);
        broadcastMapState();
    });

    socket.on('move_token', ({ tokenId, x, y }) => {
        db.prepare('UPDATE map_tokens SET x = ?, y = ? WHERE id = ?').run(x, y, tokenId);
        broadcastMapState();
    });

    socket.on('sync_map_tokens', () => {
        const activeMap = db.prepare('SELECT id FROM maps WHERE is_active = 1').get();
        if (!activeMap) return;
        const tracker = getTrackerState();
        const currentTokens = db.prepare('SELECT entity_id FROM map_tokens WHERE map_id = ?').all(activeMap.id).map(t => t.entity_id);
        const insertStmt = db.prepare(`INSERT INTO map_tokens (map_id, entity_id, entity_name, entity_type, x, y) VALUES (?, ?, ?, ?, 0, 0)`);
        for (const ent of tracker) {
            const id = ent.character_id ? `pc-${ent.character_id}` : `m-${ent.instance_id}`;
            if (!currentTokens.includes(id)) insertStmt.run(activeMap.id, id, ent.entity_name, ent.entity_type);
        }
        broadcastMapState();
    });

    socket.on('start_encounter', ({ encounterId }) => {
        const partyCharacters = getAllCharacters();
        const tracker = startEncounter(encounterId, partyCharacters);
        if (tracker) {
            currentCombatRound = 1;
            currentTurnIndex = 0;
            clearTimeline(db);
            logAction('DM', '⚔️ Combat has begun!');
            broadcastInitiative();
            broadcastTimeline();
        }
    });

    socket.on('next_turn', () => {
        const prevTracker = getTrackerState();
        const prevActiveIdx = prevTracker.findIndex(e => e.is_active);
        const tracker = advanceTurn();
        if (!tracker || tracker.length === 0) return;

        const newActiveIdx = tracker.findIndex(e => e.is_active);

        // Detect round wrap-around
        if (currentCombatRound > 0 && newActiveIdx <= prevActiveIdx && prevActiveIdx >= 0) {
            currentCombatRound++;
        }
        currentTurnIndex = newActiveIdx;

        const activeEntity = tracker[newActiveIdx];
        if (activeEntity && currentCombatRound > 0) {
            const triggerResults = [
                ...processTurnTriggers(db, 'start_of_turn', activeEntity.id, currentCombatRound, currentTurnIndex),
                ...processAurasForTurn(db, activeEntity.id, currentCombatRound, currentTurnIndex, 'start_of_turn'),
            ];
            if (triggerResults.some(r => r.success)) {
                broadcastPartyState();
                broadcastInitiative(); // HP changes to monsters need initiative re-broadcast
                broadcastTimeline();
                const names = [...new Set(triggerResults.filter(r => r.success).map(r => r.targetName))].join(', ');
                logAction('System', `Start-of-turn automation fired for: ${names}`);
            }
        }

        io.emit('initiative_state', tracker);
    });

    socket.on('set_initiative', ({ trackerId, initiative }) => {
        db.prepare('UPDATE initiative_tracker SET initiative = ? WHERE id = ?').run(initiative, trackerId);
        resortTracker();
        broadcastInitiative();
    });

    socket.on('add_marker', ({ mapId, name, type, x, y, linkedMapId, description }) => {
        db.prepare(`
            INSERT INTO map_markers (parent_map_id, linked_map_id, name, type, x, y, description)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(mapId, linkedMapId || null, name, type, x, y, description || '');
        broadcastMapState();
        broadcastWorldMapState();
    });

    socket.on('update_marker', ({ markerId, updates }) => {
        const fields = [];
        const values = [];
        Object.entries(updates).forEach(([k, v]) => {
            fields.push(`${k} = ?`);
            values.push(v);
        });
        values.push(markerId);
        db.prepare(`UPDATE map_markers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        broadcastMapState();
        broadcastWorldMapState();
    });

    socket.on('delete_marker', ({ markerId }) => {
        db.prepare('DELETE FROM map_markers WHERE id = ?').run(markerId);
        broadcastMapState();
        broadcastWorldMapState();
    });

    socket.on('refresh_world_map', () => {
        broadcastWorldMapState();
    });

    // ---- Voice Chat (WebRTC Signaling) ----
    socket.on('voice_join', ({ characterId, playerName } = {}) => {
        voiceRoom.set(socket.id, { characterId: characterId || null, playerName: playerName || 'Adventurer' });
        const existingPeers = [...voiceRoom.entries()]
            .filter(([id]) => id !== socket.id)
            .map(([id, info]) => ({ socketId: id, ...info }));
        socket.emit('voice_existing_peers', existingPeers);
        socket.broadcast.emit('voice_peer_joined', { socketId: socket.id, characterId: characterId || null, playerName: playerName || 'Adventurer' });
        io.emit('voice_room_state', [...voiceRoom.entries()].map(([id, info]) => ({ socketId: id, ...info })));
    });

    socket.on('voice_leave', () => {
        voiceRoom.delete(socket.id);
        io.emit('voice_peer_left', { socketId: socket.id });
        io.emit('voice_room_state', [...voiceRoom.entries()].map(([id, info]) => ({ socketId: id, ...info })));
    });

    socket.on('voice_offer', ({ to, offer }) => {
        io.to(to).emit('voice_offer', { from: socket.id, offer });
    });

    socket.on('voice_answer', ({ to, answer }) => {
        io.to(to).emit('voice_answer', { from: socket.id, answer });
    });

    socket.on('voice_ice_candidate', ({ to, candidate }) => {
        io.to(to).emit('voice_ice_candidate', { from: socket.id, candidate });
    });

    socket.on('voice_speaking', ({ speaking }) => {
        socket.broadcast.emit('voice_peer_speaking', { socketId: socket.id, speaking });
    });

    socket.on('update_initiative_hp', ({ trackerId, delta }) => {
        const entity = db.prepare('SELECT * FROM initiative_tracker WHERE id = ?').get(trackerId);
        if (!entity) return;
        const newHp = Math.max(0, Math.min(entity.max_hp, entity.current_hp + delta));
        db.prepare('UPDATE initiative_tracker SET current_hp = ? WHERE id = ?').run(newHp, trackerId);
        broadcastInitiative();
    });

    socket.on('end_encounter', () => {
        endEncounter();
        currentCombatRound = 0;
        currentTurnIndex = 0;
        logAction('DM', '🏁 Combat has ended.');
        broadcastInitiative();
    });

    // ── Party Effect Engine ──────────────────────────────────────────────────
    socket.on('apply_party_effect', ({ effects, targets, actor }) => {
        if (!effects || !Array.isArray(effects) || effects.length === 0) return;
        const results = applyPartyEffect(
            db, effects, targets || 'party',
            actor || 'DM', currentCombatRound, currentTurnIndex, 'action', null
        );
        if (results.some(r => r.success)) {
            broadcastPartyState();
            broadcastInitiative();
            broadcastTimeline();
            const summary = results.filter(r => r.success).map(r => r.logMessage).join(' | ');
            logAction(actor || 'DM', `Party effect applied — ${summary}`);
        }
    });

    socket.on('trigger_automation', ({ presetId, actor }) => {
        const preset = db.prepare('SELECT * FROM automation_presets WHERE id = ?').get(presetId);
        if (!preset) return;
        let effects, targetsSpec;
        try { effects = JSON.parse(preset.effects_json); } catch { effects = []; }
        try { targetsSpec = JSON.parse(preset.targets_json); } catch { targetsSpec = 'party'; }
        const results = applyPartyEffect(
            db, effects, targetsSpec,
            `Macro: ${preset.name}`, currentCombatRound, currentTurnIndex, 'action', preset.id
        );
        if (results.some(r => r.success)) {
            broadcastPartyState();
            broadcastInitiative();
            broadcastTimeline();
            logAction(actor || 'DM', `Fired automation macro: ${preset.name}`);
        }
    });

    socket.on('clear_effect_timeline', () => {
        clearTimeline(db);
        broadcastTimeline();
        logAction('DM', 'Effect timeline cleared.');
    });

    socket.on('update_note', ({ noteId, content, updated_by }) => {
        db.prepare("UPDATE party_notes SET content = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?").run(content, updated_by || 'Anonymous', noteId);
        broadcastNotes();
    });

    socket.on('create_note', ({ category, title, content, updated_by }) => {
        db.prepare("INSERT INTO party_notes (category, title, content, updated_by) VALUES (?, ?, ?, ?)").run(category || 'general', title || 'Untitled', content || '', updated_by || 'Anonymous');
        broadcastNotes();
    });

    socket.on('delete_note', ({ noteId }) => {
        db.prepare('DELETE FROM party_notes WHERE id = ?').run(noteId);
        broadcastNotes();
    });

    socket.on('refresh_quests_global', () => {
        io.emit('refresh_quests');
    });

    socket.on('register_player', ({ characterId, playerName }) => {
        playerSocketMap.set(socket.id, { characterId, playerName });
    });

    socket.on('dm_whisper', ({ targetCharacterId, message }) => {
        for (const [socketId, info] of playerSocketMap.entries()) {
            if (info.characterId === targetCharacterId) io.to(socketId).emit('whisper_received', { message, from: 'DM', timestamp: new Date().toISOString() });
        }
        socket.emit('whisper_sent', { targetCharacterId, message });
    });

    socket.on('blind_roll_request', ({ targetCharacterId, rollType, dc }) => {
        for (const [socketId, info] of playerSocketMap.entries()) {
            if (info.characterId === targetCharacterId) io.to(socketId).emit('blind_roll_requested', { rollType, dc, timestamp: new Date().toISOString() });
        }
    });

    socket.on('blind_roll_response', ({ rollType, result, characterId }) => {
        for (const [socketId, info] of playerSocketMap.entries()) {
            if (info.characterId !== characterId) io.to(socketId).emit('blind_roll_result', { characterId, rollType, result, timestamp: new Date().toISOString() });
        }
        socket.broadcast.emit('blind_roll_result_dm', { characterId, rollType, result, timestamp: new Date().toISOString() });
    });

    socket.on('end_session', async (callback) => {
        try {
            const logs = db.prepare('SELECT * FROM action_log ORDER BY id ASC').all();
            if (logs.length === 0) return callback?.({ success: false, error: 'No actions to recap.' });
            const recapText = await generateSessionRecap(logs);
            if (!recapText) return callback?.({ success: false, error: 'Ollama failed to generate recap.' });
            db.prepare("INSERT INTO session_recaps (recap_text, raw_log) VALUES (?, ?)").run(recapText, JSON.stringify(logs));
            db.prepare('DELETE FROM action_log').run();
            broadcastLogs();
            await backupDatabase();
            const recaps = db.prepare('SELECT * FROM session_recaps ORDER BY created_at DESC').all();
            io.emit('recaps_updated', recaps);
            callback?.({ success: true, recap: recapText });
        } catch (err) { console.error('[Session] Error ending session:', err.message); callback?.({ success: false, error: err.message }); }
    });

    socket.on('refresh_party', () => { broadcastPartyState(); });
    socket.on('delete_character', ({ characterId }) => {
        try {
            db.prepare('DELETE FROM characters WHERE id = ?').run(characterId);
            db.prepare('DELETE FROM session_states WHERE character_id = ?').run(characterId);
            db.prepare('DELETE FROM initiative_tracker WHERE character_id = ?').run(characterId);
            console.log(`[Socket] Character ${characterId} deleted`);
            broadcastPartyState();
        } catch (err) {
            console.error('[Socket] Delete error:', err.message);
        }
    });

    socket.on('disconnect', () => {
        playerSocketMap.delete(socket.id);
        if (voiceRoom.has(socket.id)) {
            voiceRoom.delete(socket.id);
            io.emit('voice_peer_left', { socketId: socket.id });
            io.emit('voice_room_state', [...voiceRoom.entries()].map(([id, info]) => ({ socketId: id, ...info })));
        }
    });
});

cron.schedule('0 3 * * *', async () => {
    try { await backupDatabase(); } catch (err) { console.error('[Cron] Backup failed:', err.message); }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`[Server] DnD Party Sync backend running on http://localhost:${PORT}`);
});
