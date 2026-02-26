const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { runMigrations } = require('./schema');
const { router: characterRouter, getAllCharacters } = require('./routes/characters');
const importerRouter = require('./routes/importer');
const { router: initiativeRouter, startEncounter, getTrackerState, advanceTurn, endEncounter, resortTracker } = require('./routes/initiative');
const notesRouter = require('./routes/notes');
const homebrewRouter = require('./routes/homebrew');
const db = require('./db');
const { askRulesAssistant, resolveActionLLM, generateSessionRecap } = require('./ollama');
const { backupDatabase } = require('./backup');

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
app.use('/api/notes', notesRouter);
app.use('/api/homebrew', homebrewRouter);

app.get('/api/log', (req, res) => {
    const logs = db.prepare('SELECT * FROM action_log ORDER BY id DESC LIMIT 100').all();
    res.json(logs.reverse());
});

app.post('/api/chat', async (req, res) => {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'Question required' });

    const partyContext = getAllCharacters();
    const answer = await askRulesAssistant(question, partyContext);
    res.json({ answer });
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
// DM Whisper: map socket.id → { characterId, playerName }
const playerSocketMap = new Map();

// --- Helpers ---
function broadcastPartyState() {
    const characters = getAllCharacters();
    io.emit('party_state', characters);
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

function logAction(actor, description, status = 'applied', effectsJson = null) {
    db.prepare(
        "INSERT INTO action_log (timestamp, actor, action_description, status, effects_json) VALUES (datetime('now'), ?, ?, ?, ?)"
    ).run(actor, description, status, effectsJson);
    broadcastLogs();
}

// Logic extractors for Approval Queue
function applyHpUpdate(characterId, delta) {
    const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
    if (!char) return null;

    const newHp = Math.max(0, Math.min(char.max_hp, char.current_hp + delta));
    db.prepare('UPDATE characters SET current_hp = ? WHERE id = ?').run(newHp, char.id);
    return char;
}

function applyCharacterUpdate(characterId, updates) {
    const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
    if (!char || !updates) return null;

    const allowedFields = ['inspiration', 'conditions', 'spell_slots', 'concentration_spell', 'equipment'];
    const sets = [];
    const values = [];

    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            sets.push(`${field} = ?`);
            const val = (typeof updates[field] === 'object') ? JSON.stringify(updates[field]) : updates[field];
            values.push(val);
        }
    }

    if (sets.length === 0) return char;

    values.push(char.id);
    db.prepare(`UPDATE characters SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return char;
}

// --- Socket.io ---
io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Send current state to newly connected client
    broadcastPartyState();
    broadcastLogs();
    broadcastInitiative();
    broadcastNotes();
    socket.emit('approval_mode', isApprovalMode);

    // ========================================
    // PHASE 2: Core Action Logging
    // ========================================

    socket.on('log_action', async ({ actor, description, useLlm }, callback) => {
        if (!actor || !description) {
            if (callback) callback({ success: false });
            return;
        }

        if (!useLlm) {
            logAction(actor, description);
            broadcastPartyState();
            if (callback) callback({ success: true });
            return;
        }

        // --- LLM RESOLUTION PATH ---
        const partyContext = db.prepare('SELECT * FROM characters').all();
        const effectsArray = await resolveActionLLM(description, partyContext);

        if (!effectsArray) {
            logAction(actor, description + ' (LLM failed to parse)');
            broadcastPartyState();
            if (callback) callback({ success: true, warning: 'LLM failed to parse.' });
            return;
        }

        if (isApprovalMode) {
            const effectsJsonStr = JSON.stringify({ type: 'multi', effects: effectsArray });
            logAction(actor, description, 'pending', effectsJsonStr);
            if (callback) callback({ success: true });
            return;
        }

        for (const effect of effectsArray) {
            if (effect.type === 'hp') {
                applyHpUpdate(effect.characterId, effect.delta);
            } else if (effect.type === 'character') {
                applyCharacterUpdate(effect.characterId, effect.updates);
            }
        }

        logAction(actor, description + ' (Resolved by LLM)');
        broadcastPartyState();
        if (callback) callback({ success: true });
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
                for (const effect of effectsObj.effects) {
                    if (effect.type === 'hp') applyHpUpdate(effect.characterId, effect.delta);
                    else if (effect.type === 'character') applyCharacterUpdate(effect.characterId, effect.updates);
                }
            } else if (effectsObj.type === 'hp') {
                applyHpUpdate(effectsObj.characterId, effectsObj.delta);
            } else if (effectsObj.type === 'character') {
                applyCharacterUpdate(effectsObj.characterId, effectsObj.updates);
            }
        }

        db.prepare("UPDATE action_log SET status = 'applied' WHERE id = ?").run(logId);
        broadcastLogs();
        broadcastPartyState();
    });

    socket.on('update_hp', ({ characterId, delta, actor }) => {
        const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
        if (!char) return;

        const newHp = Math.max(0, Math.min(char.max_hp, char.current_hp + delta));
        const actionText = delta < 0
            ? `${char.name} took ${Math.abs(delta)} damage. (${newHp}/${char.max_hp} HP)`
            : `${char.name} was healed for ${delta} HP. (${newHp}/${char.max_hp} HP)`;

        if (isApprovalMode) {
            const effects = JSON.stringify({ type: 'hp', characterId, delta });
            logAction(actor || 'Player', actionText, 'pending', effects);
        } else {
            applyHpUpdate(characterId, delta);
            logAction(actor || 'System', actionText);
            broadcastPartyState();
        }
    });

    socket.on('update_character', ({ characterId, updates, actor }) => {
        const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
        if (!char || !updates) return;

        const logChanges = [];
        if (updates.inspiration !== undefined) logChanges.push(updates.inspiration ? 'gained Inspiration' : 'used Inspiration');
        if (updates.conditions !== undefined) logChanges.push('conditions updated');
        if (updates.spell_slots !== undefined) logChanges.push('spell slots updated');
        if (updates.equipment !== undefined) logChanges.push('equipment changed');

        const actionText = `${char.name} ${logChanges.length > 0 ? logChanges.join(', ') : 'was updated'}.`;

        if (isApprovalMode) {
            const effects = JSON.stringify({ type: 'character', characterId, updates });
            logAction(actor || 'Player', actionText, 'pending', effects);
        } else {
            applyCharacterUpdate(characterId, updates);
            logAction(actor || 'System', actionText);
            broadcastPartyState();
        }
    });

    socket.on('refresh_party', () => {
        broadcastPartyState();
    });

    // ========================================
    // PHASE 3: Initiative Tracker
    // ========================================

    socket.on('start_encounter', ({ encounterId }) => {
        const partyCharacters = getAllCharacters();
        const tracker = startEncounter(encounterId, partyCharacters);
        if (tracker) {
            logAction('DM', '⚔️ Combat has begun!');
            broadcastInitiative();
        }
    });

    socket.on('next_turn', () => {
        const tracker = advanceTurn();
        const activeEntity = tracker.find(e => e.is_active);
        if (activeEntity) {
            io.emit('initiative_state', tracker);
        }
    });

    socket.on('set_initiative', ({ trackerId, initiative }) => {
        db.prepare('UPDATE initiative_tracker SET initiative = ? WHERE id = ?').run(initiative, trackerId);
        resortTracker();
        broadcastInitiative();
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
        logAction('DM', '🏁 Combat has ended.');
        broadcastInitiative();
    });

    // ========================================
    // PHASE 3: Party Notes
    // ========================================

    socket.on('update_note', ({ noteId, content, updated_by }) => {
        const note = db.prepare('SELECT * FROM party_notes WHERE id = ?').get(noteId);
        if (!note) return;
        db.prepare("UPDATE party_notes SET content = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?")
            .run(content, updated_by || 'Anonymous', noteId);
        broadcastNotes();
    });

    socket.on('create_note', ({ category, title, content, updated_by }) => {
        db.prepare(
            "INSERT INTO party_notes (category, title, content, updated_by) VALUES (?, ?, ?, ?)"
        ).run(category || 'general', title || 'Untitled', content || '', updated_by || 'Anonymous');
        broadcastNotes();
    });

    socket.on('delete_note', ({ noteId }) => {
        db.prepare('DELETE FROM party_notes WHERE id = ?').run(noteId);
        broadcastNotes();
    });

    // ========================================
    // PHASE 3: DM Whispers & Blind Rolls
    // ========================================

    socket.on('register_player', ({ characterId, playerName }) => {
        playerSocketMap.set(socket.id, { characterId, playerName });
        console.log(`[Socket] Player registered: ${playerName} (char ${characterId}) → ${socket.id}`);
    });

    socket.on('dm_whisper', ({ targetCharacterId, message }) => {
        // Find sockets registered to this character
        for (const [socketId, info] of playerSocketMap.entries()) {
            if (info.characterId === targetCharacterId) {
                io.to(socketId).emit('whisper_received', {
                    message,
                    from: 'DM',
                    timestamp: new Date().toISOString()
                });
            }
        }
        // Also emit back to the DM sender for confirmation
        socket.emit('whisper_sent', { targetCharacterId, message });
    });

    socket.on('blind_roll_request', ({ targetCharacterId, rollType, dc }) => {
        for (const [socketId, info] of playerSocketMap.entries()) {
            if (info.characterId === targetCharacterId) {
                io.to(socketId).emit('blind_roll_requested', {
                    rollType,
                    dc,
                    timestamp: new Date().toISOString()
                });
            }
        }
    });

    socket.on('blind_roll_response', ({ rollType, result, characterId }) => {
        // Send the result back to the DM only (the socket that isn't the player)
        // Broadcast to all sockets NOT registered as this character
        for (const [socketId, info] of playerSocketMap.entries()) {
            if (info.characterId !== characterId) {
                io.to(socketId).emit('blind_roll_result', {
                    characterId,
                    rollType,
                    result,
                    timestamp: new Date().toISOString()
                });
            }
        }
        // Also send to the DM (any socket not in the player map is likely the DM)
        socket.broadcast.emit('blind_roll_result_dm', {
            characterId,
            rollType,
            result,
            timestamp: new Date().toISOString()
        });
    });

    // ========================================
    // PHASE 3: Session Recaps & Backup
    // ========================================

    socket.on('end_session', async (callback) => {
        try {
            // 1. Pull all action logs
            const logs = db.prepare('SELECT * FROM action_log ORDER BY id ASC').all();

            if (logs.length === 0) {
                if (callback) callback({ success: false, error: 'No actions to recap.' });
                return;
            }

            // 2. Generate narrative recap via Ollama
            const recapText = await generateSessionRecap(logs);

            if (!recapText) {
                if (callback) callback({ success: false, error: 'Ollama failed to generate recap.' });
                return;
            }

            // 3. Save recap to DB
            const rawLog = JSON.stringify(logs);
            db.prepare(
                "INSERT INTO session_recaps (recap_text, raw_log) VALUES (?, ?)"
            ).run(recapText, rawLog);

            // 4. Clear the action log for next session
            db.prepare('DELETE FROM action_log').run();
            broadcastLogs();

            // 5. Trigger automated backup
            const backupPath = await backupDatabase();
            console.log(`[Session] Recap saved, backup: ${backupPath}`);

            // 6. Broadcast the new recap to all clients
            const recaps = db.prepare('SELECT * FROM session_recaps ORDER BY created_at DESC').all();
            io.emit('recaps_updated', recaps);

            if (callback) callback({ success: true, recap: recapText });
        } catch (err) {
            console.error('[Session] Error ending session:', err.message);
            if (callback) callback({ success: false, error: err.message });
        }
    });

    // ========================================
    // Cleanup
    // ========================================

    socket.on('disconnect', () => {
        playerSocketMap.delete(socket.id);
        console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
});

// --- Start ---
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`[Server] DnD Party Sync backend running on http://localhost:${PORT}`);
});
