require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { runMigrations } = require('./schema');
const { router: characterRouter, getAllCharacters } = require('./routes/characters');
const importerRouter = require('./routes/importer');
const { router: initiativeRouter, startEncounter, getTrackerState, advanceTurn, previousTurn, endEncounter, resortTracker, reorderEntry, spawnMonster } = require('./routes/initiative');
const mapsRouter = require('./routes/maps');
const npcsRouter = require('./routes/npcs');
const lootRouter = require('./routes/loot');
const questsRouter = require('./routes/quests');
const worldRouter = require('./routes/world');
const notesRouter = require('./routes/notes');
const homebrewRouter = require('./routes/homebrew');
const db = require('./db');
const { askRulesAssistant, resolveActionLLM, generateSessionRecap, generateCombatReport, generateLoreLLM } = require('./ollama');
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
    writeAuditEvent,
    reverseEvent,
} = require('./lib/effectEngine');
const { getPermissions, setPermissions, checkPermission } = require('./lib/permissions');

const {
    applyDamageEvent,
    applyHealEvent,
    setTempHpEvent,
    castConcentrationSpellEvent,
    dropConcentrationEvent,
    applyConditionEvent,
    removeConditionEvent,
    tickConditionsEvent,
    useSpellSlotEvent,
    spendHitDieEvent,
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

app.get('/api/sync-audit', (req, res) => {
    try {
        const connectedPlayers = [...playerSocketMap.values()];
        const pendingSaves = db.prepare(`
            SELECT ps.*, c.name AS character_name
            FROM pending_saves ps
            LEFT JOIN characters c ON c.id = ps.character_id
            ORDER BY ps.created_at ASC
        `).all();
        res.json({
            currentRound: currentCombatRound,
            currentTurn: currentTurnIndex,
            combatActive: currentCombatRound > 0,
            connectedPlayers,
            pendingSaves,
        });
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

app.post('/api/recaps/combat', (req, res) => {
    try {
        const { recapText, rawLog, sessionDate } = req.body;
        if (!recapText) return res.status(400).json({ error: 'recapText required' });
        const result = db.prepare(
            'INSERT INTO session_recaps (recap_text, raw_log, session_date) VALUES (?, ?, ?)'
        ).run(recapText, rawLog || '[]', sessionDate || null);
        const recap = db.prepare('SELECT * FROM session_recaps WHERE id = ?').get(result.lastInsertRowid);
        // Broadcast to all clients so SessionArchive updates live
        io.emit('recaps_updated', db.prepare('SELECT * FROM session_recaps ORDER BY created_at DESC').all());
        res.status(201).json(recap);
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

function broadcastPartyLoot() {
    const rows = db.prepare('SELECT * FROM shared_loot ORDER BY created_at DESC').all();
    const items = rows.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        rarity: r.rarity,
        stats: JSON.parse(r.stats_json || '{}'),
        droppedBy: r.dropped_by,
        createdAt: r.created_at,
    }));
    io.emit('party_loot_state', items);
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

let _timelineTimer = null;
function broadcastTimeline() {
    if (_timelineTimer) clearTimeout(_timelineTimer);
    _timelineTimer = setTimeout(() => {
        io.emit('timeline_update', getCombatTimeline(db));
        _timelineTimer = null;
    }, 100);
}
function broadcastTimelineImmediate() {
    if (_timelineTimer) clearTimeout(_timelineTimer);
    _timelineTimer = null;
    io.emit('timeline_update', getCombatTimeline(db));
}

function broadcastPermissions() {
    const perms = getPermissions(db);
    io.emit('permissions_state', perms);
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
    socket.emit('permissions_state', getPermissions(db));

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

    socket.on('update_hp', ({ characterId, delta, actor, damageType, skipConcentrationAutoRoll, requestId }) => {
        // Cross-player permission check
        const socketInfo = playerSocketMap.get(socket.id);
        const actorCharId = socketInfo?.characterId;
        if (actorCharId && actorCharId !== characterId) {
            const perm = checkPermission(db, 'cross_player_effects', socket.dmAuthenticated, actorCharId, characterId);
            if (!perm.allowed) {
                const char = db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId);
                logAction(actor || 'Player', `${char?.name || 'Character'}: ${delta < 0 ? 'damage' : 'heal'} ${Math.abs(delta)} HP`, 'pending',
                    JSON.stringify({ type: 'hp', characterId, delta, damageType }));
                socket.emit('rules_error', { message: perm.reason });
                return;
            }
        }

        if (isApprovalMode) {
            const char = db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId);
            if (!char) return;
            const actionText = delta < 0 ? `${char.name} takes ${Math.abs(delta)} ${damageType || 'untyped'} damage` : `${char.name} is healed for ${delta} HP`;
            logAction(actor || 'Player', actionText, 'pending', JSON.stringify({ type: 'hp', characterId, delta, damageType }));
            return;
        }
        let result = delta < 0 ? applyDamageEvent(db, characterId, Math.abs(delta), damageType || 'untyped') : applyHealEvent(db, characterId, delta);
        if (result?.success) {
            // Write audit event
            const charData = getCharacterData(db, characterId);
            const charName = charData?.name ?? `Character ${characterId}`;
            const desc = delta < 0
                ? `${actor || 'System'} dealt ${Math.abs(delta)} ${damageType || 'untyped'} damage to ${charName}`
                : `${actor || 'System'} healed ${charName} for ${delta} HP`;
            writeAuditEvent(db, {
                sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
                eventType: delta < 0 ? 'damage' : 'heal',
                actor: actor || 'System', targetId: characterId, targetName: charName,
                payload: { value: Math.abs(delta), damageType: delta < 0 ? (damageType || 'untyped') : null, newHp: result.newHp },
                requestId, description: desc,
            });
            broadcastTimeline();

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

            // Emit dedicated HP-change event for DM flash effects
            const hpChar = getCharacterData(db, characterId);
            if (hpChar) {
                io.emit('hp_change_event', {
                    characterId,
                    characterName: hpChar.name,
                    currentHp: result.newHp,
                    maxHp: hpChar.baseMaxHp,
                    delta,
                    type: delta < 0 ? 'damage' : 'heal',
                    damageType: delta < 0 ? (damageType || 'untyped') : null,
                    actor: actor || 'System',
                    timestamp: new Date().toISOString(),
                });

                // Also pipe into roll feed so DMEffectStream picks it up
                io.to('dm_room').emit('roll_feed_event', {
                    id: Date.now(),
                    actor: actor || 'System',
                    characterId: String(characterId),
                    label: result.logMessage,
                    source: null,
                    rollType: delta < 0 ? 'HP Damage' : 'HP Heal',
                    sides: 0,
                    count: 0,
                    modifier: 0,
                    total: result.newHp,
                    rolls: [Math.abs(delta)],
                    damageType: delta < 0 ? (damageType || 'untyped') : null,
                    isPrivate: false,
                    timestamp: new Date().toISOString(),
                });
            }
        }
    });

    socket.on('set_temp_hp', ({ characterId, amount, actor, requestId }) => {
        const result = setTempHpEvent(db, characterId, amount);
        if (result.success) {
            const charData = getCharacterData(db, characterId);
            const charName = charData?.name ?? `Character ${characterId}`;
            writeAuditEvent(db, {
                sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
                eventType: 'temp_hp', actor: actor || 'System',
                targetId: characterId, targetName: charName,
                payload: { value: amount }, requestId,
                description: `${actor || 'System'} set ${charName}'s temp HP to ${amount}`,
            });
            logAction(actor || 'System', result.logMessage);
            broadcastPartyState();
            broadcastTimeline();
        }
    });

    // Unified spell cast handler: deducts slot, handles concentration, broadcasts roll + audit event
    socket.on('cast_spell', ({ characterId, spellName, spellLevel, castAtLevel, isConcentration, damageDice, damageType, actor, requestId }) => {
        const charData = getCharacterData(db, characterId);
        const charName = charData?.name ?? `Character ${characterId}`;
        const effectiveLevel = castAtLevel ?? spellLevel;

        // Cantrips (level 0) skip slot deduction
        if (effectiveLevel > 0) {
            const slotResult = useSpellSlotEvent(db, characterId, effectiveLevel);
            if (!slotResult.success) {
                socket.emit('rules_error', { message: slotResult.error });
                return;
            }
        }

        // If concentration, set it (drops existing concentration)
        if (isConcentration) {
            const concResult = castConcentrationSpellEvent(db, characterId, spellName, effectiveLevel > 0 ? effectiveLevel : null);
            if (!concResult.success) {
                socket.emit('rules_error', { message: concResult.error });
                // Slot already spent — this is correct 5e behavior (slot consumed even if concentration fails)
            }
        }

        // Write audit event
        const levelLabel = effectiveLevel === 0 ? 'cantrip' : `level ${effectiveLevel}`;
        const upcastNote = castAtLevel && castAtLevel > spellLevel ? ` (upcast from ${spellLevel})` : '';
        writeAuditEvent(db, {
            sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
            eventType: 'spell_slot_used', actor: actor || charName,
            targetId: characterId, targetName: charName,
            payload: { spellName, spellLevel, castAtLevel: effectiveLevel, isConcentration, damageDice, damageType },
            requestId,
            description: `${charName} cast ${spellName} at ${levelLabel}${upcastNote}`,
        });

        logAction(actor || charName, `${charName} cast ${spellName} at ${levelLabel}${upcastNote}`);

        // Broadcast to DM roll feed
        io.to('dm_room').emit('dm_roll_feed', {
            actor: charName,
            characterId,
            label: spellName,
            source: `${levelLabel}${upcastNote}`,
            rollType: 'Spell Cast',
            sides: 0,
            count: 0,
            modifier: 0,
            total: 0,
            rolls: [],
            damageType: damageType || null,
            isPrivate: false,
        });

        broadcastPartyState();
        broadcastTimeline();
    });

    socket.on('cast_concentration_spell', ({ characterId, spellName, slotLevel, actor, requestId }) => {
        const result = castConcentrationSpellEvent(db, characterId, spellName, slotLevel ?? null);
        if (result.success) {
            const charData = getCharacterData(db, characterId);
            const charName = charData?.name ?? `Character ${characterId}`;
            writeAuditEvent(db, {
                sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
                eventType: 'concentration_start', actor: actor || 'System',
                targetId: characterId, targetName: charName,
                payload: { spellName, slotLevel }, requestId,
                description: `${charName} began concentrating on ${spellName}`,
            });
            logAction(actor || 'System', result.logMessage);
            broadcastPartyState();
            broadcastTimeline();
        }
        else socket.emit('rules_error', { message: result.error });
    });

    socket.on('drop_concentration', ({ characterId, actor, requestId }) => {
        const state = getSessionState(db, characterId);
        const spellName = state?.concentratingOn ?? 'Unknown';
        const result = dropConcentrationEvent(db, characterId);
        if (result.success) {
            const charData = getCharacterData(db, characterId);
            const charName = charData?.name ?? `Character ${characterId}`;
            writeAuditEvent(db, {
                sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
                eventType: 'concentration_dropped', actor: actor || 'System',
                targetId: characterId, targetName: charName,
                payload: { spellName }, requestId,
                description: `${charName} dropped concentration on ${spellName}`,
            });
            logAction(actor || 'System', result.logMessage);
            broadcastPartyState();
            broadcastTimeline();
        }
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

    socket.on('apply_condition', ({ characterId, condition, actor, requestId, durationRounds }) => {
        const result = applyConditionEvent(db, characterId, condition, durationRounds);
        if (result.success && !result.alreadyPresent) {
            const charData = getCharacterData(db, characterId);
            const charName = charData?.name ?? `Character ${characterId}`;
            const durationStr = durationRounds > 0 ? ` (${durationRounds} rds)` : '';
            writeAuditEvent(db, {
                sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
                eventType: 'condition_applied', actor: actor || 'System',
                targetId: characterId, targetName: charName,
                payload: { condition, durationRounds: durationRounds || null }, requestId,
                description: `${actor || 'System'} applied ${condition}${durationStr} to ${charName}`,
            });
            logAction(actor || 'System', result.logMessage);
            broadcastPartyState();
            broadcastTimeline();
        }
    });

    socket.on('remove_condition', ({ characterId, condition, actor, requestId }) => {
        const result = removeConditionEvent(db, characterId, condition);
        if (result.success) {
            const charData = getCharacterData(db, characterId);
            const charName = charData?.name ?? `Character ${characterId}`;
            writeAuditEvent(db, {
                sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
                eventType: 'condition_removed', actor: actor || 'System',
                targetId: characterId, targetName: charName,
                payload: { condition }, requestId,
                description: `${actor || 'System'} removed ${condition} from ${charName}`,
            });
            logAction(actor || 'System', result.logMessage);
            broadcastPartyState();
            broadcastTimeline();
        }
    });

    socket.on('apply_buff', ({ characterIds, buffData, actor, requestId }) => {
        const ids = Array.isArray(characterIds) ? characterIds : [characterIds];
        ids.forEach(id => {
            const result = applyBuffEvent(db, id, buffData);
            if (result.success) {
                const charData = getCharacterData(db, id);
                const charName = charData?.name ?? `Character ${id}`;
                writeAuditEvent(db, {
                    sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
                    eventType: 'buff_applied', actor: actor || 'System',
                    targetId: id, targetName: charName,
                    payload: { buffData }, requestId: requestId ? `${requestId}-buff-${id}` : undefined,
                    description: `${actor || 'System'} applied ${buffData?.name || 'buff'} to ${charName}`,
                });
                logAction(actor || 'System', result.logMessage);
            }
        });
        broadcastPartyState();
        broadcastTimeline();
    });

    socket.on('remove_buff', ({ characterId, buffId, actor, requestId }) => {
        const result = removeBuffEvent(db, characterId, buffId);
        if (result.success) {
            const charData = getCharacterData(db, characterId);
            const charName = charData?.name ?? `Character ${characterId}`;
            writeAuditEvent(db, {
                sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
                eventType: 'buff_removed', actor: actor || 'System',
                targetId: characterId, targetName: charName,
                payload: { buffId }, requestId,
                description: `${actor || 'System'} removed buff from ${charName}`,
            });
            logAction(actor || 'System', result.logMessage);
            broadcastPartyState();
            broadcastTimeline();
        }
    });

    socket.on('use_spell_slot', ({ characterId, slotLevel, actor, requestId }) => {
        const result = useSpellSlotEvent(db, characterId, slotLevel);
        if (result.success) {
            const charData = getCharacterData(db, characterId);
            const charName = charData?.name ?? `Character ${characterId}`;
            writeAuditEvent(db, {
                sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
                eventType: 'spell_slot_used', actor: actor || 'System',
                targetId: characterId, targetName: charName,
                payload: { slotLevel }, requestId,
                description: `${charName} used a level ${slotLevel} spell slot`,
            });
            logAction(actor || 'System', result.logMessage);
            broadcastPartyState();
            broadcastTimeline();
        }
        else socket.emit('rules_error', { message: result.error });
    });

    socket.on('spend_hit_die', ({ characterId, dieType, actor, requestId }) => {
        const result = spendHitDieEvent(db, characterId, dieType);
        if (result.success) {
            const charData = getCharacterData(db, characterId);
            const charName = charData?.name ?? `Character ${characterId}`;
            writeAuditEvent(db, {
                sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
                eventType: 'heal', actor: actor || charName,
                targetId: characterId, targetName: charName,
                payload: { value: result.healed, dieType, roll: result.roll, conMod: result.conMod, source: 'hit_die' },
                requestId,
                description: `${charName} spent a ${dieType}: rolled ${result.roll} + ${result.conMod} CON = ${result.healed} HP healed`,
            });
            logAction(actor || charName, result.logMessage);

            // Send roll to DM feed
            io.to('dm_room').emit('dm_roll_feed', {
                actor: charName,
                characterId,
                label: `Hit Die (${dieType})`,
                source: 'Short Rest',
                rollType: 'HP Heal',
                sides: parseInt(dieType.replace('d', '')),
                count: 1,
                modifier: result.conMod,
                total: result.healAmount,
                rolls: [result.roll],
                damageType: null,
                isPrivate: false,
            });

            // Notify the spending player
            socket.emit('hit_die_result', result);
            broadcastPartyState();
            broadcastTimeline();
        } else {
            socket.emit('rules_error', { message: result.error });
        }
    });

    socket.on('short_rest', ({ characterId, actor, requestId }) => {
        const result = shortRestEvent(db, characterId);
        if (result.success) {
            const charData = getCharacterData(db, characterId);
            const charName = charData?.name ?? `Character ${characterId}`;
            writeAuditEvent(db, {
                sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
                eventType: 'rest', actor: actor || 'System',
                targetId: characterId, targetName: charName,
                payload: { restType: 'short' }, requestId,
                description: `${charName} took a short rest`,
            });
            logAction(actor || 'System', result.logMessage);
            broadcastPartyState();
            broadcastTimeline();
            socket.emit('advance_time', { minutes: 60 });
        }
    });

    socket.on('long_rest', ({ characterId, actor, requestId }) => {
        const result = longRestEvent(db, characterId);
        if (result.success) {
            const charData = getCharacterData(db, characterId);
            const charName = charData?.name ?? `Character ${characterId}`;
            writeAuditEvent(db, {
                sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
                eventType: 'rest', actor: actor || 'System',
                targetId: characterId, targetName: charName,
                payload: { restType: 'long' }, requestId,
                description: `${charName} took a long rest`,
            });
            logAction(actor || 'System', result.logMessage);
            broadcastPartyState();
            broadcastTimeline();
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

    socket.on('dice_roll', ({ actor, sides, count, modifier, total, rolls, isPrivate, rollType, ability, label, source, damageType }) => {
        const rollString = `${count}d${sides}${modifier !== 0 ? (modifier > 0 ? '+' + modifier : modifier) : ''}`;
        const detailString = rolls.length > 1 ? ` (${rolls.join(' + ')})` : '';
        const msg = `rolled ${total} on ${rollString}${detailString}`;

        // Only log non-private rolls to the shared action log
        if (!isPrivate) logAction(actor || 'Someone', msg);

        // ── Auto-populate Initiative Tracker from player Initiative rolls ──
        if (rollType === 'Initiative') {
            const rollSocketInfo = playerSocketMap.get(socket.id);
            const characterId = rollSocketInfo?.characterId;
            if (characterId) {
                const trackerEntry = db.prepare(
                    'SELECT id FROM initiative_tracker WHERE character_id = ?'
                ).get(characterId);
                if (trackerEntry) {
                    db.prepare('UPDATE initiative_tracker SET initiative = ? WHERE id = ?').run(total, trackerEntry.id);
                    resortTracker();
                    broadcastInitiative();
                }
            }
        }

        // ── Broadcast to DM Roll Feed ──
        const socketInfo = playerSocketMap.get(socket.id);
        const feedEvent = {
            id: Date.now(),
            actor: actor || 'Someone',
            characterId: socketInfo?.characterId ?? null,
            label: label || rollType || 'Roll',
            source: source || null,
            rollType: rollType || 'Roll',
            sides, count, modifier, total, rolls,
            damageType: damageType || null,
            isPrivate: !!isPrivate,
            timestamp: new Date().toISOString(),
        };
        // Always send to DM room
        io.to('dm_room').emit('roll_feed_event', feedEvent);
        // Only broadcast publicly if not private
        if (!isPrivate) io.emit('roll_feed_event', feedEvent);

        // ── Sync-Linked Dice Rolls: auto-resolve pending saves ──
        if (rollType === 'saving_throw' && ability) {
            const socketInfo = playerSocketMap.get(socket.id);
            const characterId = socketInfo?.characterId;
            if (characterId) {
                const pending = db.prepare(
                    `SELECT * FROM pending_saves WHERE character_id = ? AND ability = ? ORDER BY created_at ASC LIMIT 1`
                ).get(characterId, ability.toLowerCase());
                if (pending) {
                    const passed = total >= pending.dc;
                    const effects = passed ? JSON.parse(pending.on_pass_json) : JSON.parse(pending.on_fail_json);
                    if (effects.length > 0) {
                        applyPartyEffect(
                            db, effects, [{ id: characterId, type: 'character' }],
                            `Auto (Save)`, currentCombatRound, currentTurnIndex, 'reaction', null
                        );
                        broadcastPartyState();
                        broadcastTimeline();
                    }
                    db.prepare('DELETE FROM pending_saves WHERE id = ?').run(pending.id);
                    const charName = db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId)?.name ?? `Character ${characterId}`;
                    logAction('System', `${charName} ${passed ? 'passed' : 'failed'} DC ${pending.dc} ${pending.ability.toUpperCase()} save${effects.length > 0 ? ' — effects applied' : ''}.`);
                    io.emit('save_resolved', { characterId, ability: pending.ability, dc: pending.dc, roll: total, passed, charName });
                }
            }
        }
    });

    socket.on('dm_request_save', ({ targetCharacterIds, dc, ability, onFailEffects, onPassEffects }) => {
        if (!Array.isArray(targetCharacterIds) || targetCharacterIds.length === 0) return;
        const normAbility = (ability || 'wis').toLowerCase();
        const insertPending = db.prepare(
            `INSERT INTO pending_saves (character_id, dc, ability, on_fail_json, on_pass_json, source) VALUES (?, ?, ?, ?, ?, 'DM')`
        );
        for (const charId of targetCharacterIds) {
            insertPending.run(charId, dc || 15, normAbility, JSON.stringify(onFailEffects || []), JSON.stringify(onPassEffects || []));
            for (const [socketId, info] of playerSocketMap.entries()) {
                if (info.characterId === charId) {
                    io.to(socketId).emit('pending_save_request', {
                        dc: dc || 15,
                        ability: normAbility,
                        source: 'DM',
                        timestamp: new Date().toISOString(),
                    });
                }
            }
        }
        logAction('DM', `Requested DC ${dc} ${normAbility.toUpperCase()} save from ${targetCharacterIds.length} character(s).`);
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
            // ── Tick condition durations for the entity whose turn is starting ──
            if (activeEntity.character_id) {
                const tickResult = tickConditionsEvent(db, activeEntity.character_id);
                if (tickResult.success && tickResult.expired.length > 0) {
                    // Log and audit each expired condition
                    for (const condName of tickResult.expired) {
                        const titleCase = condName.charAt(0).toUpperCase() + condName.slice(1);
                        writeAuditEvent(db, {
                            sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
                            eventType: 'condition_removed', actor: 'System',
                            targetId: activeEntity.character_id, targetName: activeEntity.entity_name,
                            payload: { condition: condName, reason: 'duration_expired' },
                            description: `${titleCase} has worn off ${activeEntity.entity_name} (duration expired)`,
                        });
                        logAction('System', `${titleCase} has worn off ${activeEntity.entity_name}.`);

                        // Broadcast to DM effect stream
                        io.to('dm_room').emit('roll_feed_event', {
                            id: Date.now(),
                            actor: 'System',
                            characterId: String(activeEntity.character_id),
                            label: `${titleCase} expired on ${activeEntity.entity_name}`,
                            source: null,
                            rollType: 'System',
                            sides: 0, count: 0, modifier: 0, total: 0, rolls: [],
                            damageType: null,
                            isPrivate: false,
                            timestamp: new Date().toISOString(),
                        });
                    }
                    broadcastPartyState();
                    broadcastTimeline();
                }

                // Emit tick event to the specific player's socket
                for (const [socketId, info] of playerSocketMap.entries()) {
                    if (info.characterId === activeEntity.character_id) {
                        io.to(socketId).emit('tick_conditions', {
                            characterId: activeEntity.character_id,
                            expired: tickResult.expired,
                            remaining: tickResult.remaining,
                        });
                    }
                }
            }

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

    socket.on('prev_turn', () => {
        const prevTracker = getTrackerState();
        const prevActiveIdx = prevTracker.findIndex(e => e.is_active);
        const tracker = previousTurn();
        if (!tracker || tracker.length === 0) return;

        const newActiveIdx = tracker.findIndex(e => e.is_active);

        // Detect round wrap-back
        if (currentCombatRound > 1 && newActiveIdx >= prevActiveIdx && prevActiveIdx >= 0) {
            currentCombatRound--;
        }
        currentTurnIndex = newActiveIdx;

        io.emit('initiative_state', tracker);
    });

    socket.on('set_initiative', ({ trackerId, initiative }) => {
        db.prepare('UPDATE initiative_tracker SET initiative = ? WHERE id = ?').run(initiative, trackerId);
        resortTracker();
        broadcastInitiative();
    });

    socket.on('reorder_initiative', ({ trackerId, direction }) => {
        reorderEntry(trackerId, direction);
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

    socket.on('end_encounter', async (callback) => {
        try {
            // Snapshot timeline + party state BEFORE clearing
            const timeline = getCombatTimeline(db);
            const trackerState = getTrackerState();
            const totalRounds = currentCombatRound;

            // Compress timeline into token-efficient format for LLM
            const events = timeline
                .filter(e => !e.is_reversed)
                .map(e => {
                    let detail = e.description || '';
                    if (!detail) {
                        try {
                            const p = JSON.parse(e.payload_json || '{}');
                            if (e.event_type === 'damage') detail = `${p.value || '?'} ${p.damageType || ''} damage`;
                            else if (e.event_type === 'heal') detail = `+${p.value || '?'} HP`;
                            else if (e.event_type === 'condition_applied') detail = `applied ${p.condition}`;
                            else if (e.event_type === 'condition_removed') detail = `removed ${p.condition}`;
                            else if (e.event_type === 'concentration_broken') detail = `lost concentration on ${p.spellName}`;
                            else if (e.event_type === 'rest') detail = `${p.restType} rest`;
                            else detail = e.event_type;
                        } catch { detail = e.event_type; }
                    }
                    return {
                        round: e.session_round,
                        actor: e.actor,
                        action: e.event_type,
                        target: e.target_name || '',
                        detail,
                    };
                });

            // Build survivor snapshot from tracker (PCs + alive monsters)
            const characters = getAllCharacters();
            const survivors = trackerState
                .filter(e => e.current_hp > 0)
                .map(e => {
                    const char = e.character_id ? characters.find(c => c.id === e.character_id) : null;
                    return {
                        name: e.entity_name,
                        type: e.entity_type,
                        hp: e.current_hp,
                        maxHp: e.max_hp,
                        conditions: e.conditions || [],
                    };
                });

            // Clear combat state
            endEncounter();
            currentCombatRound = 0;
            currentTurnIndex = 0;
            logAction('DM', '🏁 Combat has ended.');
            broadcastInitiative();

            // Generate AI report if there were meaningful events
            if (events.length >= 2) {
                const reportText = await generateCombatReport({ events, survivors, totalRounds });
                if (reportText) {
                    callback?.({ success: true, report: reportText, events, survivors, totalRounds });
                    return;
                }
            }

            // No events or LLM failed — still succeed but with no report
            callback?.({ success: true, report: null, events, survivors, totalRounds });
        } catch (err) {
            console.error('[Combat] Error ending encounter:', err.message);
            // Still clear combat even if report fails
            try { endEncounter(); currentCombatRound = 0; currentTurnIndex = 0; broadcastInitiative(); } catch (_) {}
            callback?.({ success: false, error: err.message });
        }
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

    socket.on('blind_roll_response', ({ rollType, result, characterId, ability }) => {
        for (const [socketId, info] of playerSocketMap.entries()) {
            if (info.characterId !== characterId) io.to(socketId).emit('blind_roll_result', { characterId, rollType, result, timestamp: new Date().toISOString() });
        }
        socket.broadcast.emit('blind_roll_result_dm', { characterId, rollType, result, timestamp: new Date().toISOString() });

        // Auto-resolve any matching pending save
        if (rollType === 'saving_throw' && characterId && ability) {
            const pending = db.prepare(
                `SELECT * FROM pending_saves WHERE character_id = ? AND ability = ? ORDER BY created_at ASC LIMIT 1`
            ).get(characterId, ability.toLowerCase());
            if (pending) {
                const passed = result >= pending.dc;
                const effects = passed ? JSON.parse(pending.on_pass_json) : JSON.parse(pending.on_fail_json);
                if (effects.length > 0) {
                    applyPartyEffect(db, effects, [{ id: characterId, type: 'character' }], 'Auto (Save)', currentCombatRound, currentTurnIndex, 'reaction', null);
                    broadcastPartyState();
                    broadcastTimeline();
                }
                db.prepare('DELETE FROM pending_saves WHERE id = ?').run(pending.id);
                const charName = db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId)?.name ?? `Character ${characterId}`;
                logAction('System', `${charName} ${passed ? 'passed' : 'failed'} DC ${pending.dc} ${pending.ability.toUpperCase()} save${effects.length > 0 ? ' — effects applied' : ''}.`);
                io.emit('save_resolved', { characterId, ability: pending.ability, dc: pending.dc, roll: result, passed, charName });
            }
        }
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
    socket.on('refresh_party_loot', () => { broadcastPartyLoot(); });

    // ── Shared Party Loot Pool ───────────────────────────────────────────────
    socket.on('drop_loot', ({ name, description, category, rarity, stats, droppedBy }) => {
        db.prepare(`
            INSERT INTO shared_loot (name, description, category, rarity, stats_json, dropped_by)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(name, description || '', category || 'Gear', rarity || 'Common', JSON.stringify(stats || {}), droppedBy || 'DM');
        broadcastPartyLoot();
        logAction(droppedBy || 'DM', `dropped ${name} into the party loot pool`);
    });

    socket.on('claim_loot', ({ lootId, characterId, characterName, requestId }) => {
        // Permission check
        const perm = checkPermission(db, 'loot_claim', socket.dmAuthenticated, playerSocketMap.get(socket.id)?.characterId, characterId);
        if (!perm.allowed) {
            const item = db.prepare('SELECT name FROM shared_loot WHERE id = ?').get(lootId);
            logAction(characterName || 'Player', `wants to claim ${item?.name || 'item'} from loot pool`, 'pending',
                JSON.stringify({ type: 'loot_claim', lootId, characterId, characterName }));
            socket.emit('rules_error', { message: perm.reason });
            return;
        }

        const item = db.prepare('SELECT * FROM shared_loot WHERE id = ?').get(lootId);
        if (!item) { socket.emit('rules_error', { message: 'Item already claimed!' }); return; }

        // Remove from pool
        db.prepare('DELETE FROM shared_loot WHERE id = ?').run(lootId);

        // Add to character's homebrew inventory
        const char = db.prepare('SELECT homebrew_inventory FROM characters WHERE id = ?').get(characterId);
        if (!char) return;

        const inventory = JSON.parse(char.homebrew_inventory || '[]');
        inventory.push({
            id: `loot-${item.id}-${Date.now()}`,
            name: item.name,
            description: item.description,
            type: 'item',
            stats: JSON.parse(item.stats_json || '{}'),
            isHomebrew: true,
            equipped: false,
            quantity: 1,
        });
        db.prepare('UPDATE characters SET homebrew_inventory = ? WHERE id = ?').run(JSON.stringify(inventory), characterId);

        // Audit event
        writeAuditEvent(db, {
            sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
            eventType: 'loot_claimed', actor: characterName || 'Player',
            targetId: characterId, targetName: characterName,
            payload: { itemName: item.name, itemId: item.id, rarity: item.rarity },
            requestId,
            description: `${characterName || 'Player'} claimed ${item.name} from the party loot pool`,
        });

        broadcastPartyLoot();
        broadcastPartyState();
        broadcastTimeline();
        logAction(characterName || 'Player', `claimed ${item.name} from the party loot pool`);

        // Pipe to DM effect stream
        io.to('dm_room').emit('roll_feed_event', {
            id: Date.now(),
            actor: characterName || 'Player',
            characterId: String(characterId),
            label: `${characterName} looted ${item.name}`,
            source: null,
            rollType: 'Loot Claimed',
            sides: 0, count: 0, modifier: 0, total: 0, rolls: [],
            damageType: null,
            isPrivate: false,
            timestamp: new Date().toISOString(),
        });
    });

    socket.on('remove_loot', ({ lootId }) => {
        db.prepare('DELETE FROM shared_loot WHERE id = ?').run(lootId);
        broadcastPartyLoot();
    });

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

    // ── Resource Permissions ────────────────────────────────────────────────
    socket.on('update_permissions', ({ permissions }) => {
        if (!socket.dmAuthenticated) { socket.emit('rules_error', { message: 'DM only' }); return; }
        const updated = setPermissions(db, permissions);
        broadcastPermissions();
        logAction('DM', `Updated resource permissions: ${JSON.stringify(updated)}`);
    });

    socket.on('refresh_permissions', () => {
        socket.emit('permissions_state', getPermissions(db));
    });

    // ── Event Reversal (Undo) ───────────────────────────────────────────────
    socket.on('reverse_event', ({ eventId }) => {
        if (!socket.dmAuthenticated) { socket.emit('rules_error', { message: 'DM only' }); return; }
        const result = reverseEvent(db, eventId, 'DM', applyDamageEvent, applyHealEvent, applyConditionEvent, removeConditionEvent);
        if (result.success) {
            broadcastPartyState();
            broadcastTimelineImmediate();
            logAction('DM', result.description);
        } else {
            socket.emit('rules_error', { message: result.error });
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
