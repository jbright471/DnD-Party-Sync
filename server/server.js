require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { runMigrations } = require('./schema');
const { router: characterRouter, getAllCharacters } = require('./routes/characters');
const importerRouter = require('./routes/importer');
const { router: initiativeRouter, startEncounter, getTrackerState, advanceTurn, previousTurn, endEncounter, resortTracker, reorderEntry, spawnMonster, rollAllInitiative } = require('./routes/initiative');
const mapsRouter = require('./routes/maps');
const npcsRouter = require('./routes/npcs');
const lootRouter = require('./routes/loot');
const questsRouter = require('./routes/quests');
const worldRouter = require('./routes/world');
const notesRouter = require('./routes/notes');
const homebrewRouter = require('./routes/homebrew');
const prepPacksRouter = require('./routes/prepPacks');
const effectPresetsRouter = require('./routes/effectPresets');
const db = require('./db');
const { askRulesAssistant, resolveActionLLM, generateSessionRecap, generateCombatReport, generateLoreLLM } = require('./ollama');
const { backupDatabase } = require('./backup');
const cron = require('node-cron');
const automationRouter = require('./routes/automation');
const dmNotesRouter = require('./routes/dmNotes');
const { createContractRouter } = require('./routes/contracts');
const {
    applyPartyEffect,
    previewPartyEffect,
    resolveTargets,
    processTurnTriggers,
    processAurasForTurn,
    getCombatTimeline,
    getFilteredTimeline,
    clearTimeline,
    writeConcentrationCheckEvent,
    writeAuditEvent,
    reverseEvent,
    getCharacterProvenance,
    getActiveCombatSession,
    startCombatSession,
    archiveActiveCombatSession,
    listCombatSessions,
} = require('./services/effects-engine');
const { getPermissions, setPermissions, checkPermission } = require('./lib/permissions');
const { getAutomationRules } = require('./lib/automationRules');
const { isValidDmToken, requireDmRequest } = require('./lib/dmAuth');
const {
    projectPartyState,
    projectInitiativeState,
    projectTimeline,
    canSocketReceiveEvent,
} = require('./lib/clientStateProjection');
const {
    buildPlayerViewSnapshot,
    projectBattleMapState,
    projectWorldMapState,
} = require('./lib/playerViewProjection');
const {
    CommandConflictError,
    executeProcessedCommand,
    getAggregateVersions,
    getCampaignVersion,
    getStateDeltas,
    pruneProcessedCommands,
} = require('./lib/processedCommands');
const { negotiateVersion } = require('./lib/automationContractRegistry');
const { executeEffectCommand } = require('./services/transactionalEffects');
const { createHttpMutationBoundary } = require('./lib/httpMutationBoundary');
const { installSocketMutationBoundary } = require('./lib/socketMutationBoundary');
const {
    normalizeRollVisibility,
    isPublicRoll,
    buildRollRouting,
    rollServerDice,
} = require('./lib/rollVisibility');

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
    removeBuffEvent,
    toggleFeatureEvent
} = require('./lib/rulesIntegration');

const { createSnapshot, computeDiff, restoreSnapshot } = require('./lib/snapshotEngine');

const { getActiveAuras, clearAllAuras } = require('./services/effects-engine/auras');
const { getSmartPins, saveSmartPins, clearAllSmartPins } = require('./services/effects-engine/smartPins');
const { configureBossPhases, transitionBossPhase } = require('./services/bossPhases');
const { consumeAmmunitionForAttack } = require('./lib/ammunitionTracking');
const { getBloodiedTransition } = require('./lib/bloodiedState');

function broadcastAuras() {
    io.emit('active_auras_sync', getActiveAuras(db));
}

function broadcastSmartPins() {
    io.emit('combat_smart_pins_sync', getSmartPins(db));
}


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
pruneProcessedCommands(db);
setInterval(() => pruneProcessedCommands(db), 24 * 60 * 60 * 1000).unref();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    },
});
const previewIo = io.of('/player-preview');
app.set('io', io);
app.set('broadcastStateDelta', broadcastStateDelta);

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '15mb' }));
app.use(createHttpMutationBoundary({
    db,
    afterCommit: outcome => broadcastStateDelta(outcome),
    sessionId: () => getActiveCombatSession(db)?.id ?? null,
    shouldSkip: req => {
        const pathName = String(req.originalUrl || '').split('?')[0];
        return pathName === '/api/v1/effects/bulk-apply'
            || pathName === '/api/v1/contracts/negotiate'
            || /^\/api\/characters\/import(?:\/|$)/.test(pathName)
            || /^\/api\/homebrew\/(?:parse-item|generate)(?:\/|$)/.test(pathName)
            || pathName === '/api/homebrew'
            || pathName === '/api/loot/generate'
            || pathName === '/api/world/weather'
            || pathName === '/api/lore'
            || pathName === '/api/chat';
    },
}));

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
app.use('/api/prep-packs', prepPacksRouter);
app.use('/api/effect-presets', effectPresetsRouter);
app.use('/api/v1/contracts', createContractRouter(db));

// --- Combat Snapshot REST Routes ---
app.post('/api/combat/snapshots', (req, res) => {
    try {
        let { label } = req.body;
        if (!label) {
            label = `Snapshot - Round ${currentCombatRound}, Turn ${currentTurnIndex}`;
        }
        const id = createSnapshot(db, label);
        res.json({ success: true, id, label });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/combat/snapshots', (req, res) => {
    try {
        const snapshots = db.prepare('SELECT id, label, round, turn_index, created_at FROM combat_snapshots ORDER BY id DESC').all();
        res.json(snapshots);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/combat/snapshots/audit', (req, res) => {
    try {
        const auditLogs = db.prepare('SELECT * FROM combat_restore_audit ORDER BY timestamp DESC LIMIT 100').all();
        res.json(auditLogs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/combat/snapshots/audit', (req, res) => {
    try {
        db.prepare('DELETE FROM combat_restore_audit').run();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.get('/api/combat/snapshots/:id/diff', (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const diff = computeDiff(db, id);
        if (!diff) {
            return res.status(404).json({ error: 'Snapshot not found' });
        }
        res.json(diff);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/combat/snapshots/:id/restore', (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const snapshot = db.prepare('SELECT label FROM combat_snapshots WHERE id = ?').get(id);
        if (!snapshot) {
            return res.status(404).json({ error: 'Snapshot not found' });
        }
        restoreSnapshot(db, id);
        loadCombatState();
        broadcastCombatState();
        broadcastPartyState();
        broadcastInitiative();
        broadcastTimelineImmediate();
        logAction('DM', `Restored combat snapshot: ${snapshot.label}`);
        res.json({ success: true, label: snapshot.label });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
    return isValidDmToken(db, token);
}

const requireDmHttp = requireDmRequest(db);
const playerPreviewSessions = new Map();
const PLAYER_PREVIEW_TTL_MS = 15 * 60 * 1000;

app.get('/api/auth/dm/status', requireDmHttp, (_req, res) => {
    res.json({ authenticated: true });
});

app.post('/api/player-preview/sessions', requireDmHttp, (req, res) => {
    const characterId = Number.parseInt(req.body?.characterId, 10);
    const character = db.prepare('SELECT id, name FROM characters WHERE id = ?').get(characterId);
    if (!character) return res.status(404).json({ error: 'Character not found' });

    const now = Date.now();
    for (const [token, session] of playerPreviewSessions) {
        if (session.expiresAt <= now) playerPreviewSessions.delete(token);
    }

    const token = randomUUID();
    const expiresAt = now + PLAYER_PREVIEW_TTL_MS;
    playerPreviewSessions.set(token, { characterId, expiresAt, clientId: null });
    return res.status(201).json({
        token,
        expiresAt: new Date(expiresAt).toISOString(),
        character,
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
    });
});

app.post('/api/v1/effects/bulk-apply', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
    if (!requireDm(token)) return res.status(401).json({ error: 'Unauthorized: Invalid DM Token' });

    try {
        const outcome = executeEffectCommand(db, req.body, {
            actorType: 'dm',
            actorId: 'DM',
            actorName: req.body?.payload?.actor || req.body?.actor || 'DM',
            sessionId: getActiveCombatSession(db)?.id ?? null,
            sessionRound: currentCombatRound,
            turnIndex: currentTurnIndex,
        }, { afterCommit: committed => broadcastStateDelta(committed) });
        return res.json({
            success: outcome.result?.success !== false,
            commandId: outcome.commandId,
            replayed: outcome.replayed,
            campaignVersion: outcome.campaignVersion,
            aggregateVersions: outcome.aggregateVersions,
            stateDelta: outcome.stateDelta,
            ...(outcome.result || {}),
        });
    } catch (error) {
        const status = error instanceof CommandConflictError ? 409 : 500;
        return res.status(status).json({
            success: false,
            error: error.message,
            code: error.code || 'COMMAND_FAILED',
            details: error.details || undefined,
        });
    }
});

// Retained fallback implementation; the orchestrated handler above always terminates matching requests.
app.post('/api/v1/effects/bulk-apply', async (req, res) => {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
        if (!requireDm(token)) {
            return res.status(401).json({ error: 'Unauthorized: Invalid DM Token' });
        }

        const { requestId, targets, effects, actor } = req.body;
        if (!Array.isArray(targets) || targets.length === 0) {
            return res.status(400).json({ error: 'No targets specified' });
        }
        if (!Array.isArray(effects) || effects.length === 0) {
            return res.status(400).json({ error: 'No effects specified' });
        }

        // Resolve targets via effects-engine (handles both characters and monsters)
        const resolved = resolveTargets(db, targets.map(t => ({ id: Number(t.id), type: t.type })));
        if (resolved.length === 0) {
            return res.status(400).json({ error: 'No valid targets found' });
        }

        const groupId = requestId;
        let flatRecords = [];

        try {
            flatRecords = db.transaction(() => {
                const records = [];
                for (const target of resolved) {
                    for (const effect of effects) {
                        const perTargetRequestId = requestId ? `${requestId}-${target.id}-${effect.type}` : undefined;

                        // Idempotency check per sub-event
                        if (perTargetRequestId) {
                            const exists = db.prepare('SELECT 1 FROM effect_events WHERE request_id = ?').get(perTargetRequestId);
                            if (exists) {
                                records.push({
                                    targetId: target.id,
                                    targetName: target.name,
                                    eventType: effect.type,
                                    logMessage: 'duplicate skipped',
                                    success: false
                                });
                                continue;
                            }
                        }

                        let result, eventType;
                        try {
                            if (target.type === 'character') {
                                switch (effect.type) {
                                    case 'damage':
                                        result = applyDamageEvent(db, target.id, effect.value || 0, effect.damageType || 'untyped');
                                        eventType = 'damage';
                                        break;
                                    case 'heal':
                                        result = applyHealEvent(db, target.id, effect.value || 0);
                                        eventType = 'heal';
                                        break;
                                    case 'condition':
                                        result = applyConditionEvent(db, target.id, effect.condition);
                                        eventType = 'condition_applied';
                                        break;
                                    case 'remove_condition':
                                        result = removeConditionEvent(db, target.id, effect.condition);
                                        eventType = 'condition_removed';
                                        break;
                                    default:
                                        result = { success: false, error: `Unknown effect: ${effect.type}` };
                                        eventType = 'unknown';
                                }
                            } else {
                                // Monster — damage/heal only (conditions noted but not stored in schema)
                                const entity = db.prepare('SELECT * FROM initiative_tracker WHERE id = ?').get(target.id);
                                if (!entity) {
                                    records.push({
                                        targetId: target.id,
                                        targetName: target.name,
                                        eventType: effect.type,
                                        logMessage: 'Monster not found',
                                        success: false
                                    });
                                    continue;
                                }
                                if (effect.type === 'damage') {
                                    const dmg = Math.max(0, effect.value || 0);
                                    const newHp = Math.max(0, entity.current_hp - dmg);
                                    db.prepare('UPDATE initiative_tracker SET current_hp = ? WHERE id = ?').run(newHp, target.id);
                                    result = {
                                        success: true,
                                        previousHp: entity.current_hp,
                                        newHp,
                                        bloodiedTransition: getBloodiedTransition(entity.current_hp, newHp, entity.max_hp, getAutomationRules(db)),
                                        logMessage: `${entity.entity_name} takes ${dmg} ${effect.damageType || 'untyped'} damage (${newHp}/${entity.max_hp} HP)`,
                                    };
                                    eventType = 'damage';
                                } else if (effect.type === 'heal') {
                                    const heal = Math.max(0, effect.value || 0);
                                    const newHp = Math.min(entity.max_hp, entity.current_hp + heal);
                                    db.prepare('UPDATE initiative_tracker SET current_hp = ? WHERE id = ?').run(newHp, target.id);
                                    result = {
                                        success: true,
                                        previousHp: entity.current_hp,
                                        newHp,
                                        bloodiedTransition: getBloodiedTransition(entity.current_hp, newHp, entity.max_hp, getAutomationRules(db)),
                                        logMessage: `${entity.entity_name} healed ${heal} HP (${newHp}/${entity.max_hp} HP)`,
                                    };
                                    eventType = 'heal';
                                } else {
                                    result = { success: true, logMessage: `${target.name}: ${effect.condition || effect.type} (noted)` };
                                    eventType = effect.type === 'condition' ? 'condition_applied' : 'condition_removed';
                                }
                            }

                            if (result.success) {
                                writeAuditEvent(db, {
                                    sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
                                    eventType,
                                    actor: actor || 'DM',
                                    targetId: target.id,
                                    targetName: target.name,
                                    payload: { ...effect },
                                    requestId: perTargetRequestId,
                                    description: result.logMessage,
                                    groupId,
                                });
                                writeBloodiedAuditEvent({
                                    transition: result.bloodiedTransition,
                                    targetId: target.id,
                                    targetType: target.type,
                                    targetName: target.name,
                                    previousHp: result.previousHp,
                                    currentHp: result.newHp,
                                });
                            }

                            records.push({
                                targetId: target.id,
                                targetName: target.name,
                                eventType,
                                logMessage: result.logMessage || result.error,
                                success: result.success
                            });
                        } catch (err) {
                            console.error(`Error processing effect ${effect.type} for target ${target.name}:`, err);
                            records.push({
                                targetId: target.id,
                                targetName: target.name,
                                eventType: effect.type,
                                logMessage: err.message,
                                success: false
                            });
                        }
                    }
                }
                return records;
            })();
        } catch (err) {
            console.error('Error executing bulk-apply transaction:', err);
            return res.status(500).json({ error: 'Failed to execute bulk apply: ' + err.message });
        }

        // Broadcast state updates
        broadcastPartyState();
        broadcastTimelineImmediate();

        // Log the group action
        logAction(actor || 'DM', `AoE [${effects.map(e => e.type).join('+')}] → ${resolved.map(t => t.name).join(', ')}`);

        res.json({ success: true, groupId, records: flatRecords });
    } catch (err) {
        console.error('Error in bulk-apply endpoint:', err);
        res.status(500).json({ error: err.message });
    }
});

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

app.get('/api/effect-timeline', requireDmHttp, (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 200, 1), 500);
        const active = getActiveCombatSession(db);
        const combatSessionId = req.query.sessionId !== undefined
            ? parseInt(req.query.sessionId)
            : (active?.id ?? null);
        if (req.query.sessionId !== undefined && isNaN(combatSessionId)) {
            return res.status(400).json({ error: 'Invalid combat session ID' });
        }
        const beforeId = req.query.beforeId === undefined ? undefined : parseInt(req.query.beforeId);
        const targetId = req.query.targetId === undefined ? undefined : parseInt(req.query.targetId);
        const events = getFilteredTimeline(db, {
            limit,
            combatSessionId,
            beforeId: Number.isNaN(beforeId) ? undefined : beforeId,
            targetId: Number.isNaN(targetId) ? undefined : targetId,
            eventType: req.query.eventType || undefined,
        });
        res.json(events);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/combat-sessions', requireDmHttp, (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
        res.json(listCombatSessions(db, limit));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/effect-timeline/character/:id', requireDmHttp, (req, res) => {
    try {
        const charId = parseInt(req.params.id);
        const limit = parseInt(req.query.limit) || 100;
        if (isNaN(charId)) return res.status(400).json({ error: 'Invalid character ID' });
        res.json(getCharacterProvenance(db, charId, limit));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sync-audit', requireDmHttp, (req, res) => {
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
try {
    const approvalRow = db.prepare("SELECT value FROM campaign_state WHERE key = 'approval_mode'").get();
    isApprovalMode = approvalRow ? approvalRow.value === '1' : false;
} catch (e) {
    console.error("[DB] Error loading approval mode state", e);
}
const playerSocketMap = new Map(); // socket.id -> { characterId, playerName }
const voiceRoom = new Map(); // socket.id -> { characterId, playerName }
const pendingEffects = new Map(); // pending_id -> { timeout, payload }

// Combat round/turn tracking (reset on start/end encounter)
let currentCombatRound = 0;
let currentTurnIndex = 0;

function loadCombatState() {
    try {
        const roundRow = db.prepare("SELECT value FROM campaign_state WHERE key = 'combat_round'").get();
        const turnRow = db.prepare("SELECT value FROM campaign_state WHERE key = 'combat_turn_index'").get();
        if (roundRow) currentCombatRound = parseInt(roundRow.value, 10) || 0;
        if (turnRow) currentTurnIndex = parseInt(turnRow.value, 10) || 0;
    } catch(e) { console.error("[DB] Error loading combat state", e); }
}

function saveCombatState() {
    try {
        db.prepare("INSERT OR REPLACE INTO campaign_state (key, value) VALUES ('combat_round', ?)").run(currentCombatRound.toString());
        db.prepare("INSERT OR REPLACE INTO campaign_state (key, value) VALUES ('combat_turn_index', ?)").run(currentTurnIndex.toString());
    } catch(e) { console.error("[DB] Error saving combat state", e); }
}

function broadcastCombatState() {
    io.emit('combat_state_sync', { round: currentCombatRound, turnIndex: currentTurnIndex });
    broadcastPlayerPreviewSnapshots();
}

loadCombatState();

// --- Helpers ---
let partyStateTimer = null;

function getResolvedPartyState() {
    const characters = getAllCharacters();
    return characters.map(char => {
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
}

function getWorldStateForPreview() {
    try {
        const time = db.prepare('SELECT value FROM campaign_state WHERE key = ?').get('current_time');
        const weather = db.prepare('SELECT value FROM campaign_state WHERE key = ?').get('current_weather');
        return {
            time: JSON.parse(time?.value || '{}'),
            weather: JSON.parse(weather?.value || '{}'),
        };
    } catch {
        return { time: {}, weather: {} };
    }
}

function getWorldMapForPreview() {
    const map = db.prepare('SELECT * FROM maps WHERE is_overworld = 1').get();
    if (!map) return null;
    return {
        ...map,
        map_url: map.image_path ? `/api/maps/file/${path.basename(map.image_path)}` : null,
        markers: db.prepare('SELECT * FROM map_markers WHERE parent_map_id = ?').all(map.id),
    };
}

function getBattleMapForPreview() {
    const map = db.prepare('SELECT * FROM maps WHERE is_active = 1').get();
    if (!map) return null;
    return {
        ...map,
        map_url: map.image_path ? `/api/maps/file/${path.basename(map.image_path)}` : null,
        tokens: db.prepare('SELECT * FROM map_tokens WHERE map_id = ?').all(map.id),
        markers: db.prepare('SELECT * FROM map_markers WHERE parent_map_id = ?').all(map.id),
    };
}

let playerPreviewProjectionVersion = 0;
let playerPreviewBroadcastTimer = null;

function createPlayerPreviewSnapshot(characterId) {
    return buildPlayerViewSnapshot({
        characterId,
        party: getResolvedPartyState(),
        initiative: getTrackerState(),
        timeline: getCombatTimeline(db),
        permissions: getPermissions(db),
        combatState: { round: currentCombatRound, turnIndex: currentTurnIndex },
        notes: db.prepare('SELECT * FROM party_notes ORDER BY updated_at DESC').all(),
        sharedLoot: db.prepare('SELECT * FROM shared_loot ORDER BY created_at DESC').all(),
        worldState: getWorldStateForPreview(),
        worldMap: getWorldMapForPreview(),
        battleMap: getBattleMapForPreview(),
        version: playerPreviewProjectionVersion,
    });
}

function emitPlayerPreviewSnapshot(socket) {
    const characterId = socket.data?.playerPreviewCharacterId;
    if (!characterId) return;
    if (socket.data.playerPreviewExpiresAt <= Date.now()) {
        socket.emit('player_preview_error', { message: 'Preview session expired. Open a new preview from the DM Dashboard.' });
        socket.disconnect(true);
        return;
    }
    const snapshot = createPlayerPreviewSnapshot(characterId);
    if (snapshot) socket.emit('player_preview_state', snapshot);
}

function broadcastPlayerPreviewSnapshots() {
    if (playerPreviewBroadcastTimer) clearTimeout(playerPreviewBroadcastTimer);
    playerPreviewBroadcastTimer = setTimeout(() => {
        playerPreviewProjectionVersion += 1;
        for (const socket of previewIo.sockets.values()) emitPlayerPreviewSnapshot(socket);
        playerPreviewBroadcastTimer = null;
    }, 50);
}

function getSocketProjectionContext(socket) {
    if (socket.castView) return { role: 'cast', characterId: null };
    if (socket.dmAuthenticated) return { role: 'dm', characterId: null };
    const player = playerSocketMap.get(socket.id);
    if (player) return { role: 'player', characterId: player.characterId };
    return { role: 'public', characterId: null };
}

function forEachConnectedSocket(callback) {
    for (const connectedSocket of io.sockets.sockets.values()) callback(connectedSocket);
}

function emitProjectedPartyState(socket, resolved = getResolvedPartyState()) {
    socket.emit('party_state', projectPartyState(resolved, getSocketProjectionContext(socket)));
}

function emitProjectedInitiativeState(socket, tracker = getTrackerState()) {
    socket.emit('initiative_state', projectInitiativeState(tracker, {
        ...getSocketProjectionContext(socket),
        permissions: getPermissions(db),
    }));
}

function emitProjectedTimeline(socket, events = getCombatTimeline(db)) {
    socket.emit('timeline_update', projectTimeline(events, getSocketProjectionContext(socket)));
}

function emitRoleState(socket) {
    emitProjectedPartyState(socket);
    emitProjectedInitiativeState(socket);
    emitProjectedTimeline(socket);
    socket.emit('permissions_state', getPermissions(db));
    socket.emit('combat_state_sync', { round: currentCombatRound, turnIndex: currentTurnIndex });
}

function broadcastStateDelta(outcome) {
    if (!outcome?.stateDelta) return;
    const resolvedParty = getResolvedPartyState();
    const tracker = getTrackerState();
    const timeline = getCombatTimeline(db);
    const logs = db.prepare('SELECT * FROM action_log ORDER BY id DESC LIMIT 100').all().reverse();
    forEachConnectedSocket(socket => {
        const projection = getSocketProjectionContext(socket);
        const projectedLogs = socket.dmAuthenticated
            ? logs
            : logs.map(({ effects_json: _effectsJson, ...log }) => log);
        socket.emit('state_delta', {
            ...outcome.stateDelta,
            state: {
                party: projectPartyState(resolvedParty, projection),
                initiative: projectInitiativeState(tracker, {
                    ...projection,
                    permissions: getPermissions(db),
                }),
                timeline: projectTimeline(timeline, projection),
                actionLog: socket.castView ? [] : projectedLogs,
                combat: { round: currentCombatRound, turnIndex: currentTurnIndex },
            },
        });
    });
    broadcastPlayerPreviewSnapshots();
}

function broadcastPartyState() {
    if (partyStateTimer) clearTimeout(partyStateTimer);
    partyStateTimer = setTimeout(() => {
        rawBroadcastPartyState();
        partyStateTimer = null;
    }, 50);
    broadcastPlayerPreviewSnapshots();
}

function rawBroadcastPartyState() {
    const resolved = getResolvedPartyState();
    forEachConnectedSocket(socket => emitProjectedPartyState(socket, resolved));
}

function broadcastPartyLoot() {
    const rows = db.prepare('SELECT * FROM shared_loot ORDER BY created_at DESC').all();
    const items = rows.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        rarity: r.rarity,
        stats_json: r.stats_json,
        dropped_by: r.dropped_by,
        created_at: r.created_at,
        vote_state_json: r.vote_state_json || null,
    }));
    io.emit('party_loot_state', items);
    broadcastPlayerPreviewSnapshots();
}

function broadcastLogs() {
    const logs = db.prepare('SELECT * FROM action_log ORDER BY id DESC LIMIT 100').all();
    const orderedLogs = logs.reverse();
    forEachConnectedSocket(socket => {
        if (socket.castView) return;
        const projectedLogs = socket.dmAuthenticated
            ? orderedLogs
            : orderedLogs.map(({ effects_json: _effectsJson, ...log }) => log);
        socket.emit('action_logged', projectedLogs);
    });
}

let initiativeTimer = null;
function broadcastInitiative() {
    if (initiativeTimer) clearTimeout(initiativeTimer);
    initiativeTimer = setTimeout(() => {
        rawBroadcastInitiative();
        initiativeTimer = null;
    }, 50);
    broadcastPlayerPreviewSnapshots();
}

function rawBroadcastInitiative() {
    const tracker = getTrackerState();
    forEachConnectedSocket(socket => emitProjectedInitiativeState(socket, tracker));
}

function broadcastNotes() {
    const notes = db.prepare('SELECT * FROM party_notes ORDER BY updated_at DESC').all();
    forEachConnectedSocket(socket => {
        if (!socket.castView) socket.emit('notes_state', notes);
    });
    broadcastPlayerPreviewSnapshots();
}

function broadcastWorldState() {
    try {
        const time = db.prepare('SELECT value FROM campaign_state WHERE key = "current_time"').get();
        const weather = db.prepare('SELECT value FROM campaign_state WHERE key = "current_weather"').get();
        io.emit('world_state', {
            time: JSON.parse(time?.value || '{}'),
            weather: JSON.parse(weather?.value || '{}')
        });
        broadcastPlayerPreviewSnapshots();
    } catch (_e) {}
}

let _timelineTimer = null;
function broadcastTimeline() {
    if (_timelineTimer) clearTimeout(_timelineTimer);
    _timelineTimer = setTimeout(() => {
        const events = getCombatTimeline(db);
        forEachConnectedSocket(socket => emitProjectedTimeline(socket, events));
        _timelineTimer = null;
    }, 100);
    broadcastPlayerPreviewSnapshots();
}
function broadcastTimelineImmediate() {
    if (_timelineTimer) clearTimeout(_timelineTimer);
    _timelineTimer = null;
    const events = getCombatTimeline(db);
    forEachConnectedSocket(socket => emitProjectedTimeline(socket, events));
    broadcastPlayerPreviewSnapshots();
}

function broadcastPermissions() {
    const perms = getPermissions(db);
    io.emit('permissions_state', perms);
    broadcastPlayerPreviewSnapshots();
}

function broadcastWorldMapState() {
    try {
        const map = db.prepare('SELECT * FROM maps WHERE is_overworld = 1').get();
        if (map) {
            const markers = db.prepare('SELECT * FROM map_markers WHERE parent_map_id = ?').all(map.id);
            const map_url = map.image_path ? `/api/maps/file/${path.basename(map.image_path)}` : null;
            const state = { ...map, map_url, markers };
            forEachConnectedSocket(socket => {
                socket.emit('world_map_state', socket.dmAuthenticated ? state : projectWorldMapState(state));
            });
        } else {
            io.emit('world_map_state', null);
        }
        broadcastPlayerPreviewSnapshots();
    } catch (e) { console.error('[WorldMap] Broadcast error:', e); }
}

function broadcastMapState() {
    const map = db.prepare('SELECT * FROM maps WHERE is_active = 1').get();
    if (map) {
        const tokens = db.prepare('SELECT * FROM map_tokens WHERE map_id = ?').all(map.id);
        const markers = db.prepare('SELECT * FROM map_markers WHERE parent_map_id = ?').all(map.id);
        const image_data = map.image_path ? `/api/maps/file/${path.basename(map.image_path)}` : null;
        const state = { ...map, image_data, map_url: image_data, tokens, markers };
        forEachConnectedSocket(socket => {
            socket.emit('map_state', socket.dmAuthenticated ? state : projectBattleMapState(state));
        });
    } else {
        io.emit('map_state', null);
    }
    broadcastPlayerPreviewSnapshots();
}

function logAction(actor, description, status = 'applied', effectsJson = null) {
    db.prepare(
        "INSERT INTO action_log (timestamp, actor, action_description, status, effects_json) VALUES (datetime('now'), ?, ?, ?, ?)"
    ).run(actor, description, status, effectsJson);
    broadcastLogs();
}

function writeBloodiedAuditEvent({ transition, targetId, targetType = 'character', targetName, previousHp, currentHp }) {
    if (!transition) return null;
    const thresholdPercent = getAutomationRules(db).bloodiedThresholdPercent;
    return writeAuditEvent(db, {
        sessionRound: currentCombatRound,
        turnIndex: currentTurnIndex,
        eventType: `bloodied_${transition}`,
        actor: 'Automation',
        targetId,
        targetType,
        targetName,
        payload: { previousHp, currentHp, thresholdPercent },
        description: `${targetName} ${transition === 'entered' ? 'became' : 'is no longer'} bloodied`,
    });
}

function resolveLootVote(db, lootId, io, broadcastPartyLoot, broadcastPartyState, logAction) {
    const item = db.prepare('SELECT * FROM shared_loot WHERE id = ?').get(lootId);
    if (!item || !item.vote_state_json) return;
    const voteState = JSON.parse(item.vote_state_json);
    const voteEntries = Object.entries(voteState.votes);
    const needers  = voteEntries.filter(([, v]) => v.vote === 'need' ).map(([id, v]) => ({ id, name: v.characterName }));
    const greeders = voteEntries.filter(([, v]) => v.vote === 'greed').map(([id, v]) => ({ id, name: v.characterName }));

    let winner = null;
    let winType = 'none';
    if (needers.length > 0) {
        winner = needers[Math.floor(Math.random() * needers.length)];
        winType = 'need';
    } else if (greeders.length > 0) {
        winner = greeders[Math.floor(Math.random() * greeders.length)];
        winType = 'greed';
    }

    if (winner) {
        const char = db.prepare('SELECT homebrew_inventory FROM characters WHERE id = ?').get(parseInt(winner.id));
        if (char) {
            const inv = JSON.parse(char.homebrew_inventory || '[]');
            const stats = JSON.parse(item.stats_json || '{}');
            inv.push({ id: `loot-${item.id}-${Date.now()}`, name: item.name, description: item.description, stats, equipped: false });
            db.prepare('UPDATE characters SET homebrew_inventory = ? WHERE id = ?').run(JSON.stringify(inv), parseInt(winner.id));
        }
        db.prepare('DELETE FROM shared_loot WHERE id = ?').run(lootId);
        broadcastPartyState();
    } else {
        // No winner — close the vote without awarding
        voteState.status = 'closed';
        db.prepare('UPDATE shared_loot SET vote_state_json = ? WHERE id = ?').run(JSON.stringify(voteState), lootId);
    }

    broadcastPartyLoot();
    io.emit('loot_vote_result', {
        lootId,
        winner: winner ? { id: winner.id, name: winner.name } : null,
        winType,
        votes: voteState.votes,
        itemName: item.name,
    });
    logAction('System', `Loot vote resolved: ${item.name} → ${winner ? winner.name + ' (' + winType + ')' : 'No winner (all passed)'}`);
}

function emitCommandResult(socket, eventName, acknowledge, outcome) {
    const mutation = outcome.result?.mutation;
    const successful = mutation ? mutation.success !== false : outcome.result?.success !== false;
    const response = {
        success: successful,
        commandId: outcome.commandId,
        replayed: outcome.replayed,
        aggregateVersion: outcome.aggregateVersion,
        aggregateVersions: outcome.aggregateVersions,
        campaignVersion: outcome.campaignVersion,
        stateDelta: outcome.stateDelta,
        result: outcome.result,
        ...(successful ? {} : {
            error: mutation?.error || outcome.result?.error || 'Command was rejected',
            code: 'COMMAND_REJECTED',
        }),
    };
    if (typeof acknowledge === 'function') acknowledge(response);
    socket.emit('command_result', response);
    if (eventName) {
        const eventResult = outcome.result?.mutation ?? outcome.result;
        socket.emit(eventName, { ...eventResult, ...response });
    }
}

function emitCommandError(socket, eventName, acknowledge, error) {
    const response = {
        success: false,
        error: error.message || 'Command failed',
        code: error.code || 'COMMAND_FAILED',
    };
    if (typeof acknowledge === 'function') acknowledge(response);
    socket.emit('command_result', response);
    if (eventName) socket.emit(eventName, response);
}

function executeCharacterSocketCommand({
    socket,
    acknowledge,
    resultEvent = null,
    commandType,
    characterId,
    requestId,
    commandId,
    expectedVersion,
    actor,
    payload,
    execute,
    buildAudit,
    afterCommit,
}) {
    const resolvedCommandId = commandId || requestId || randomUUID();
    try {
        const outcome = executeProcessedCommand(db, {
            commandId: resolvedCommandId,
            commandType,
            actorType: socket.dmAuthenticated ? 'dm' : 'player',
            actorId: playerSocketMap.get(socket.id)?.characterId ?? null,
            sessionId: getActiveCombatSession(db)?.id ?? null,
            aggregateKey: `character:${characterId}`,
            expectedVersion: expectedVersion ?? null,
            payload,
        }, () => {
            const result = execute();
            if (!result?.success) return { mutation: result, characterName: null };
            const charData = getCharacterData(db, characterId);
            const characterName = charData?.name ?? `Character ${characterId}`;
            if (result.mutated === false) return { mutation: result, characterName };
            const audit = buildAudit(result, characterName);
            writeAuditEvent(db, {
                sessionRound: currentCombatRound,
                turnIndex: currentTurnIndex,
                actor: actor || characterName,
                targetId: characterId,
                targetName: characterName,
                requestId: resolvedCommandId,
                ...audit,
            });
            db.prepare(`
                INSERT INTO action_log (timestamp, actor, action_description, status)
                VALUES (datetime('now'), ?, ?, 'applied')
            `).run(actor || characterName, result.logMessage || audit.description);
            return { mutation: result, characterName };
        }, {
            buildDelta: () => ({
                kind: commandType,
                scopes: ['party', 'initiative', 'timeline', 'action_log'],
                target: { id: Number(characterId), type: 'character' },
            }),
            afterCommit: committed => {
                broadcastStateDelta(committed);
                afterCommit?.(committed.result.mutation, committed.result.characterName);
            },
        });

        emitCommandResult(socket, resultEvent, acknowledge, outcome);
        if (!outcome.result?.mutation?.success && outcome.result?.mutation?.error) {
            socket.emit('rules_error', { message: outcome.result.mutation.error });
        }
        return outcome;
    } catch (error) {
        emitCommandError(socket, resultEvent, acknowledge, error);
        if (!(error instanceof CommandConflictError)) console.error(`[Command] ${commandType} failed:`, error);
        return null;
    }
}

// --- Socket.io ---
previewIo.on('connection', socket => {
    const allowedEvents = new Set(['register_player_preview', 'request_player_preview_state']);
    socket.use(([event], next) => {
        if (!allowedEvents.has(event)) {
            socket.emit('player_preview_error', { message: 'Player preview is read-only.' });
            return next(new Error('Player preview is read-only'));
        }
        if (event !== 'register_player_preview' && !socket.data.playerPreviewCharacterId) {
            socket.emit('player_preview_error', { message: 'Preview session is not registered.' });
            return next(new Error('Preview session is not registered'));
        }
        return next();
    });

    socket.on('register_player_preview', ({ token, clientId } = {}) => {
        const session = playerPreviewSessions.get(String(token || ''));
        const normalizedClientId = String(clientId || '');
        if (!session || session.expiresAt <= Date.now() || !normalizedClientId) {
            if (token) playerPreviewSessions.delete(String(token));
            socket.emit('player_preview_error', { message: 'Preview link is invalid or expired.' });
            return;
        }
        if (session.clientId && session.clientId !== normalizedClientId) {
            socket.emit('player_preview_error', { message: 'Preview link has already been opened in another tab.' });
            return;
        }

        session.clientId = normalizedClientId;
        socket.data.playerPreviewCharacterId = session.characterId;
        socket.data.playerPreviewExpiresAt = session.expiresAt;
        playerPreviewProjectionVersion += 1;
        emitPlayerPreviewSnapshot(socket);
    });

    socket.on('request_player_preview_state', () => emitPlayerPreviewSnapshot(socket));
});

io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    socket.use(([event], next) => {
        if (!canSocketReceiveEvent(socket, event)) {
            socket.emit('cast_read_only_error', { message: 'The encounter cast view is read-only.' });
            return next(new Error('Encounter cast view is read-only'));
        }
        next();
    });

    installSocketMutationBoundary(socket, {
        db,
        mutationEvents: new Set([
            'save_aura', 'toggle_aura', 'update_aura_targets', 'delete_aura',
            'save_smart_pin', 'delete_smart_pin', 'save_pins_to_template',
            'toggle_approval_mode', 'resolve_pending_action', 'resolve_pending_import',
            'concentration_check_result', 'toggle_feature', 'update_character',
            'dice_roll', 'server_dice_roll', 'dm_request_save', 'spawn_monster',
            'configure_boss_phases', 'transition_boss_phase', 'toggle_entity_visibility',
            'activate_map', 'move_token', 'sync_map_tokens', 'start_encounter',
            'next_turn', 'prev_turn', 'set_initiative', 'reorder_initiative',
            'auto_roll_initiative', 'dismiss_dead', 'clear_all_conditions',
            'add_marker', 'update_marker', 'delete_marker', 'update_initiative_hp',
            'request_effect', 'resolve_pending_effect', 'trigger_automation',
            'clear_effect_timeline', 'update_note', 'create_note', 'delete_note',
            'drop_loot', 'remove_loot', 'loot_vote_open', 'loot_vote_cast',
            'loot_vote_cancel', 'loot_vote_force_resolve', 'delete_character',
            'update_permissions', 'reverse_event', 'reverse_group',
            'blind_roll_response',
        ]),
        actor: connectedSocket => ({
            type: connectedSocket.dmAuthenticated ? 'dm' : 'player',
            id: playerSocketMap.get(connectedSocket.id)?.characterId ?? null,
        }),
        sessionId: () => getActiveCombatSession(db)?.id ?? null,
        afterCommit: committed => broadcastStateDelta(committed),
    });

    socket.on('negotiate_automation_contract', ({ supportedVersions } = {}, acknowledge) => {
        const result = negotiateVersion(supportedVersions);
        if (typeof acknowledge === 'function') acknowledge(result);
        socket.emit('automation_contract_negotiated', result);
    });

    socket.on('request_state_deltas', ({ afterVersion = 0, limit = 250 } = {}, acknowledge) => {
        const normalizedAfter = Math.max(0, Number(afterVersion) || 0);
        const currentVersion = getCampaignVersion(db);
        const earliest = db.prepare('SELECT MIN(campaign_version) AS version FROM state_deltas').get()?.version;
        const resyncRequired = earliest !== null && earliest !== undefined && normalizedAfter < earliest - 1;
        const result = {
            schemaVersion: '1.0.0',
            afterVersion: normalizedAfter,
            campaignVersion: currentVersion,
            aggregateVersions: getAggregateVersions(db),
            resyncRequired,
            deltas: resyncRequired ? [] : getStateDeltas(db, normalizedAfter, limit),
        };
        if (typeof acknowledge === 'function') acknowledge(result);
        socket.emit('state_delta_batch', result);
        if (resyncRequired) emitRoleState(socket);
    });

    // DM room join — validates stored token before admitting to dm_room
    socket.on('dm_join_room', ({ dmToken }) => {
        if (requireDm(dmToken)) {
            socket.join('dm_room');
            socket.dmAuthenticated = true;
            socket.castView = false;
            socket.emit('dm_room_joined', { success: true });
            emitRoleState(socket);
            socket.emit('action_logged', db.prepare('SELECT * FROM action_log ORDER BY id DESC LIMIT 100').all().reverse());
            socket.emit('notes_state', db.prepare('SELECT * FROM party_notes ORDER BY updated_at DESC').all());
            const pendingImports = db.prepare('SELECT * FROM pending_imports ORDER BY created_at ASC').all().map(r => ({
                id: r.id,
                characterId: r.character_id,
                playerName: r.player_name,
                url: r.url,
                flags: JSON.parse(r.diff_json || '{}').flags || [],
                diff: JSON.parse(r.diff_json || '{}').diff || {},
                incomingData: JSON.parse(r.incoming_data_json)
            }));
            socket.emit('pending_imports_sync', pendingImports);
        }
    });

    socket.on('register_cast_view', ({ encounterId } = {}) => {
        socket.leave('dm_room');
        socket.dmAuthenticated = false;
        socket.castView = true;
        socket.castEncounterId = encounterId ?? null;
        playerSocketMap.delete(socket.id);
        emitRoleState(socket);
    });

    socket.on('request_cast_state', () => emitRoleState(socket));

    // Relay DM prep note mutations to dm_room so other DM tabs stay in sync
    socket.on('relay_dm_note', ({ event, data }) => {
        if (socket.dmAuthenticated) {
            socket.to('dm_room').emit(event, data);
        }
    });

    emitRoleState(socket);
    socket.emit('approval_mode', isApprovalMode);

    // ── Companion view pull ───────────────────────────────────────────────────
    // Emits party_state only to the requesting socket (used by /companion/:id)
    socket.on('request_party_state', ({ characterId } = {}) => {
        if (characterId && !socket.dmAuthenticated && !socket.castView) {
            playerSocketMap.set(socket.id, { characterId: Number(characterId), playerName: 'Companion' });
        }
        emitProjectedPartyState(socket);
        emitProjectedTimeline(socket);
    });

    // --- Aura-Sync Sockets ---
    socket.on('save_aura', (auraData) => {
        const { createOrUpdateAura } = require('./services/effects-engine/auras');
        createOrUpdateAura(db, auraData);
        broadcastAuras();
        broadcastPartyState();
    });

    socket.on('toggle_aura', ({ auraId, active }) => {
        const { toggleAura } = require('./services/effects-engine/auras');
        toggleAura(db, auraId, active);
        broadcastAuras();
        broadcastPartyState();
    });

    socket.on('update_aura_targets', ({ auraId, targets }) => {
        const { updateAuraTargets } = require('./services/effects-engine/auras');
        updateAuraTargets(db, auraId, targets);
        broadcastAuras();
        broadcastPartyState();
    });

    socket.on('delete_aura', ({ id }) => {
        const { deleteAura } = require('./services/effects-engine/auras');
        deleteAura(db, id);
        broadcastAuras();
        broadcastPartyState();
    });

    // --- Smart Pins Sockets ---
    socket.on('save_smart_pin', (pinData) => {
        const { addOrUpdatePin } = require('./services/effects-engine/smartPins');
        addOrUpdatePin(db, pinData);
        broadcastSmartPins();
    });

    socket.on('delete_smart_pin', ({ id }) => {
        const { deletePin } = require('./services/effects-engine/smartPins');
        deletePin(db, id);
        broadcastSmartPins();
    });

    socket.on('save_pins_to_template', ({ encounterId }) => {
        const { savePinsToTemplate } = require('./services/effects-engine/smartPins');
        const res = savePinsToTemplate(db, encounterId);
        socket.emit('pins_saved_to_template_result', res);
    });

    socket.on('log_action', async (command, callback) => {
        const { actor, description, useLlm, commandId, requestId, expectedCampaignVersion, expectedAggregateVersions } = command || {};
        if (!actor || !description) return callback?.({ success: false });
        try {
            const effectsArray = useLlm
                ? await resolveActionLLM(description, db.prepare('SELECT * FROM characters').all())
                : [];
            const affectedIds = [...new Set((effectsArray || [])
                .map(effect => Number(effect.characterId))
                .filter(Number.isInteger))];
            const resolvedCommandId = commandId || requestId || randomUUID();
            const outcome = executeProcessedCommand(db, {
                commandId: resolvedCommandId,
                commandType: 'action.resolve',
                actorType: socket.dmAuthenticated ? 'dm' : 'player',
                actorId: playerSocketMap.get(socket.id)?.characterId ?? null,
                sessionId: getActiveCombatSession(db)?.id ?? null,
                expectedCampaignVersion: expectedCampaignVersion ?? null,
                aggregates: [
                    { key: 'collection:action_log', expectedVersion: expectedAggregateVersions?.['collection:action_log'] ?? null },
                    ...affectedIds.map(id => ({
                        key: `character:${id}`,
                        expectedVersion: expectedAggregateVersions?.[`character:${id}`] ?? null,
                    })),
                ],
                payload: { actor, description, useLlm: !!useLlm },
            }, () => {
                const warning = useLlm && !effectsArray ? 'LLM failed to parse.' : null;
                const pending = Boolean(useLlm && effectsArray && isApprovalMode);
                if (useLlm && effectsArray && !pending) {
                    for (const effect of effectsArray) {
                        const result = applyEffect(effect);
                        if (!result?.success) throw new Error(result?.error || `Unable to apply effect ${effect.type}`);
                    }
                }
                const suffix = warning ? ' (LLM failed to parse)' : useLlm && effectsArray ? ' (Resolved by LLM)' : '';
                db.prepare(`
                    INSERT INTO action_log (timestamp, actor, action_description, status, effects_json)
                    VALUES (datetime('now'), ?, ?, ?, ?)
                `).run(
                    actor,
                    description + suffix,
                    pending ? 'pending' : 'applied',
                    pending ? JSON.stringify({ type: 'multi', effects: effectsArray }) : null,
                );
                return { success: true, warning, pending };
            }, {
                buildDelta: () => ({
                    kind: 'action_resolved',
                    scopes: ['party', 'initiative', 'timeline', 'action_log'],
                    affectedCharacters: affectedIds,
                }),
                afterCommit: committed => broadcastStateDelta(committed),
            });
            callback?.({
                success: true,
                replayed: outcome.replayed,
                campaignVersion: outcome.campaignVersion,
                warning: outcome.result.warning || undefined,
            });
        } catch (error) {
            callback?.({ success: false, error: error.message, code: error.code || 'COMMAND_FAILED' });
        }
    });

    socket.on('toggle_approval_mode', (commandOrMode, legacyMode) => {
        const mode = typeof commandOrMode === 'boolean'
            ? commandOrMode
            : (legacyMode ?? commandOrMode?.mode ?? commandOrMode?.value);
        isApprovalMode = !!mode;
        try {
            db.prepare("INSERT OR REPLACE INTO campaign_state (key, value) VALUES ('approval_mode', ?)").run(isApprovalMode ? '1' : '0');
        } catch (e) {
            console.error("[DB] Error saving approval mode state", e);
        }
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

    socket.on('resolve_pending_import', ({ id, approved }) => {
        if (!socket.dmAuthenticated) return;
        try {
            const row = db.prepare('SELECT * FROM pending_imports WHERE id = ?').get(id);
            if (!row) return;

            if (approved) {
                const parsed = JSON.parse(row.incoming_data_json);
                const charId = row.character_id;

                if (charId) {
                    db.prepare(`
                        UPDATE characters SET
                            name = ?, class = ?, level = ?, max_hp = ?, ac = ?,
                            stats = ?, skills = ?, features = ?, features_traits = ?,
                            inventory = ?, spells = ?, backstory = ?,
                            raw_dndbeyond_json = ?, data_json = ?,
                            skill_proficiencies = ?, save_proficiencies = ?, attacks = ?
                        WHERE id = ?
                    `).run(
                        parsed.name, parsed.class, parsed.level, parsed.maxHp, parsed.ac,
                        parsed.stats, parsed.skills, parsed.features, parsed.features_traits,
                        parsed.inventory, parsed.spells, parsed.backstory,
                        parsed.raw_dndbeyond_json, parsed.data_json,
                        parsed.skill_proficiencies || '{}',
                        parsed.save_proficiencies  || '{}',
                        parsed.attacks             || '[]',
                        charId
                    );
                    logAction('DM', `Approved sync for character: ${parsed.name}`);
                } else {
                    const stmt = db.prepare(`
                        INSERT INTO characters (
                            name, class, level, max_hp, current_hp, ac,
                            stats, skills, features, features_traits, inventory, homebrew_inventory, spells, backstory,
                            raw_dndbeyond_json, data_json, skill_proficiencies, save_proficiencies, attacks
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?)
                    `);

                    const result = stmt.run(
                        parsed.name, parsed.class, parsed.level, parsed.maxHp, parsed.currentHp, parsed.ac,
                        parsed.stats, parsed.skills, parsed.features, parsed.features_traits, parsed.inventory,
                        parsed.spells, parsed.backstory, parsed.raw_dndbeyond_json, parsed.data_json,
                        parsed.skill_proficiencies || '{}',
                        parsed.save_proficiencies  || '{}',
                        parsed.attacks             || '[]',
                    );
                    const newCharId = result.lastInsertRowid;

                    db.prepare(`
                      INSERT INTO session_states (character_id, current_hp, temp_hp, death_saves_json, conditions_json, buffs_json, concentrating_on, slots_used_json, hd_used_json, feature_uses_json, active_features_json)
                      VALUES (?, ?, 0, '{"successes":0,"failures":0}', '[]', '[]', NULL, '{}', '{}', '{}', '[]')
                    `).run(newCharId, parsed.currentHp);
                    logAction('DM', `Approved import of new character: ${parsed.name}`);
                }
            } else {
                const parsed = JSON.parse(row.incoming_data_json);
                logAction('DM', `Rejected import/sync for character: ${parsed.name}`);
            }

            db.prepare('DELETE FROM pending_imports WHERE id = ?').run(id);

            broadcastPartyState();

            const remaining = db.prepare('SELECT * FROM pending_imports ORDER BY created_at ASC').all().map(r => ({
                id: r.id,
                characterId: r.character_id,
                playerName: r.player_name,
                url: r.url,
                flags: JSON.parse(r.diff_json || '{}').flags || [],
                diff: JSON.parse(r.diff_json || '{}').diff || {},
                incomingData: JSON.parse(r.incoming_data_json)
            }));
            io.to('dm_room').emit('pending_imports_sync', remaining);
        } catch (err) {
            console.error('Error resolving pending import:', err);
        }
    });

    socket.on('apply_effect_preset', (command, acknowledge) => {
        if (!socket.dmAuthenticated) { emitCommandError(socket, 'effect_preset_result', acknowledge, new Error('DM only')); return; }
        try {
            const preset = db.prepare('SELECT * FROM effect_presets WHERE id = ?').get(command?.presetId);
            if (!preset) throw new Error('Effect preset not found');
            const effects = JSON.parse(preset.effects_json || '[]');
            const outcome = executeEffectCommand(db, {
                commandId: command?.commandId,
                requestId: command?.requestId,
                targets: command?.targetIds,
                effects,
                actor: 'DM',
                expectedCampaignVersion: command?.expectedCampaignVersion,
                expectedAggregateVersions: command?.expectedAggregateVersions,
            }, {
                actorType: 'dm', actorId: 'DM', actorName: `Preset: ${preset.name}`,
                sessionId: getActiveCombatSession(db)?.id ?? null,
                sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
                sourcePresetId: preset.id,
            }, { afterCommit: committed => broadcastStateDelta(committed) });
            emitCommandResult(socket, 'effect_preset_result', acknowledge, outcome);
        } catch (error) {
            emitCommandError(socket, 'effect_preset_result', acknowledge, error);
            if (!(error instanceof CommandConflictError)) console.error('[Command] apply_effect_preset failed:', error);
        }
    });

    socket.on('update_hp', (payload, acknowledge) => {
        const { characterId, delta, actor, damageType, skipConcentrationAutoRoll, requestId, commandId, expectedVersion } = payload || {};
        const resolvedCommandId = commandId || requestId || randomUUID();
        const storePendingHpChange = (characterName) => {
            const actionText = delta < 0
                ? `${characterName} takes ${Math.abs(delta)} ${damageType || 'untyped'} damage`
                : `${characterName} is healed for ${delta} HP`;
            const outcome = executeProcessedCommand(db, {
                commandId: resolvedCommandId,
                commandType: 'character.hp.request',
                actorType: socket.dmAuthenticated ? 'dm' : 'player',
                actorId: playerSocketMap.get(socket.id)?.characterId ?? null,
                sessionId: getActiveCombatSession(db)?.id ?? null,
                payload: { characterId, delta, actor, damageType },
            }, () => {
                db.prepare(`
                    INSERT INTO action_log (timestamp, actor, action_description, status, effects_json)
                    VALUES (datetime('now'), ?, ?, 'pending', ?)
                `).run(
                    actor || 'Player',
                    actionText,
                    JSON.stringify({ type: 'hp', characterId, delta, damageType }),
                );
                return { success: true, pending: true };
            });
            emitCommandResult(socket, 'update_hp_result', acknowledge, outcome);
            if (!outcome.replayed) broadcastLogs();
        };
        // Cross-player permission check
        const socketInfo = playerSocketMap.get(socket.id);
        const actorCharId = socketInfo?.characterId;
        if (actorCharId && actorCharId !== characterId) {
            const perm = checkPermission(db, 'cross_player_effects', socket.dmAuthenticated, actorCharId, characterId);
            if (!perm.allowed) {
                const char = db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId);
                storePendingHpChange(char?.name || 'Character');
                socket.emit('rules_error', { message: perm.reason });
                return;
            }
        }

        if (isApprovalMode) {
            const char = db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId);
            if (!char) {
                emitCommandError(socket, 'update_hp_result', acknowledge, new Error('Character not found'));
                return;
            }
            storePendingHpChange(char.name);
            return;
        }
        try {
            const outcome = executeProcessedCommand(db, {
                commandId: resolvedCommandId,
                commandType: 'character.hp.update',
                actorType: socket.dmAuthenticated ? 'dm' : 'player',
                actorId: playerSocketMap.get(socket.id)?.characterId ?? null,
                sessionId: getActiveCombatSession(db)?.id ?? null,
                aggregateKey: `character:${characterId}`,
                expectedVersion: expectedVersion ?? null,
                payload: { characterId, delta, actor, damageType, skipConcentrationAutoRoll: !!skipConcentrationAutoRoll },
            }, () => {
                const result = delta < 0
                    ? applyDamageEvent(db, characterId, Math.abs(delta), damageType || 'untyped')
                    : applyHealEvent(db, characterId, delta);
                if (!result?.success) return { mutation: result, concentration: null };

                const charData = getCharacterData(db, characterId);
                const charName = charData?.name ?? `Character ${characterId}`;
                const desc = delta < 0
                    ? `${actor || 'System'} dealt ${Math.abs(delta)} ${damageType || 'untyped'} damage to ${charName}`
                    : `${actor || 'System'} healed ${charName} for ${delta} HP`;
                writeAuditEvent(db, {
                    sessionRound: currentCombatRound,
                    turnIndex: currentTurnIndex,
                    eventType: delta < 0 ? 'damage' : 'heal',
                    actor: actor || 'System',
                    targetId: characterId,
                    targetName: charName,
                    payload: {
                        value: Math.abs(delta),
                        damageType: delta < 0 ? (damageType || 'untyped') : null,
                        newHp: result.newHp,
                    },
                    requestId: resolvedCommandId,
                    description: desc,
                });
                writeBloodiedAuditEvent({
                    transition: result.bloodiedTransition,
                    targetId: characterId,
                    targetName: charName,
                    previousHp: result.previousHp,
                    currentHp: result.newHp,
                });

                let concentration = null;
                const shouldPrompt = skipConcentrationAutoRoll
                    || getAutomationRules(db).concentrationChecks === 'prompt';
                if (delta < 0 && result.concentrationCheck && shouldPrompt) {
                    const state = getSessionState(db, characterId);
                    concentration = {
                        mode: 'prompt',
                        characterId,
                        characterName: charName,
                        spellName: state?.concentratingOn,
                        dc: result.concentrationCheck.dc,
                    };
                } else if (delta < 0 && result.concentrationCheck) {
                    const state = getSessionState(db, characterId);
                    const conScore = charData?.abilityScores?.CON ?? 10;
                    const conMod = Math.floor((conScore - 10) / 2);
                    const roll = Math.floor(Math.random() * 20) + 1;
                    const total = roll + conMod;
                    const dc = result.concentrationCheck.dc;
                    const passed = total >= dc;
                    const spellName = state?.concentratingOn ?? 'Unknown Spell';
                    writeConcentrationCheckEvent(
                        db, characterId, charName, spellName,
                        roll, conMod, total, dc, passed,
                        currentCombatRound, currentTurnIndex,
                    );
                    if (!passed) dropConcentrationEvent(db, characterId);
                    concentration = {
                        mode: 'automatic', characterId, characterName: charName,
                        spellName, roll, total, dc, passed,
                    };
                }

                db.prepare(`
                    INSERT INTO action_log (timestamp, actor, action_description, status)
                    VALUES (datetime('now'), ?, ?, 'applied')
                `).run(actor || 'System', result.logMessage);

                return { mutation: result, concentration, characterName: charName };
            }, {
                buildDelta: () => ({
                    kind: 'character.hp.update',
                    scopes: ['party', 'initiative', 'timeline', 'action_log'],
                    target: { id: Number(characterId), type: 'character' },
                }),
                afterCommit: committed => broadcastStateDelta(committed),
            });

            emitCommandResult(socket, 'update_hp_result', acknowledge, outcome);
            if (outcome.replayed || !outcome.result?.mutation?.success) return;

            const result = outcome.result.mutation;
            const concentration = outcome.result.concentration;
            if (concentration?.mode === 'prompt') {
                io.emit('concentration_check_required', concentration);
            } else if (concentration?.mode === 'automatic') {
                io.emit(concentration.passed ? 'concentration_maintained' : 'concentration_broken', concentration);
            }

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
                io.to('dm_room').emit('roll_feed_event', {
                    id: Date.now(), actor: actor || 'System', characterId: String(characterId),
                    label: result.logMessage, source: null,
                    rollType: delta < 0 ? 'HP Damage' : 'HP Heal',
                    sides: 0, count: 0, modifier: 0, total: result.newHp,
                    rolls: [Math.abs(delta)],
                    damageType: delta < 0 ? (damageType || 'untyped') : null,
                    isPrivate: false,
                    timestamp: new Date().toISOString(),
                });
            }
        } catch (error) {
            emitCommandError(socket, 'update_hp_result', acknowledge, error);
            if (!(error instanceof CommandConflictError)) console.error('[Command] update_hp failed:', error);
        }
    });

    socket.on('set_temp_hp', (command, acknowledge) => {
        const { characterId, amount, actor, requestId, commandId, expectedVersion } = command || {};
        executeCharacterSocketCommand({
            socket, acknowledge, resultEvent: 'set_temp_hp_result',
            commandType: 'character.temp_hp.set', characterId,
            requestId, commandId, expectedVersion, actor,
            payload: { characterId, amount, actor },
            execute: () => setTempHpEvent(db, characterId, amount),
            buildAudit: (_result, characterName) => ({
                eventType: 'temp_hp',
                payload: { value: amount },
                description: `${actor || 'System'} set ${characterName}'s temp HP to ${amount}`,
            }),
        });
    });

    // Spell slot use, concentration changes, and audit history commit as one command.
    socket.on('cast_spell', (command, acknowledge) => {
        const {
            characterId, spellName, spellLevel, castAtLevel, isConcentration,
            damageDice, damageType, actor, requestId, commandId, expectedVersion,
        } = command || {};
        executeCharacterSocketCommand({
            socket, acknowledge, resultEvent: 'cast_spell_result',
            commandType: 'character.spell.cast', characterId,
            requestId, commandId, expectedVersion, actor,
            payload: {
                characterId, spellName, spellLevel, castAtLevel,
                isConcentration, damageDice, damageType, actor,
            },
            execute: () => {
                const effectiveLevel = castAtLevel ?? spellLevel;
                if (effectiveLevel > 0) {
                    const slotResult = useSpellSlotEvent(db, characterId, effectiveLevel);
                    if (!slotResult.success) return slotResult;
                }

                let concentrationError = null;
                if (isConcentration) {
                    const result = castConcentrationSpellEvent(
                        db,
                        characterId,
                        spellName,
                        null,
                    );
                    if (!result.success) concentrationError = result.error;
                }

                const levelLabel = effectiveLevel === 0 ? 'cantrip' : `level ${effectiveLevel}`;
                const upcastNote = castAtLevel && castAtLevel > spellLevel ? ` (upcast from ${spellLevel})` : '';
                return {
                    success: true,
                    effectiveLevel,
                    levelLabel,
                    upcastNote,
                    concentrationChanged: Boolean(isConcentration && !concentrationError),
                    concentrationError,
                    logMessage: `${spellName} cast at ${levelLabel}${upcastNote}`,
                };
            },
            buildAudit: (result, characterName) => ({
                eventType: 'spell_slot_used',
                payload: {
                    spellName,
                    spellLevel,
                    castAtLevel: result.effectiveLevel,
                    isConcentration,
                    damageDice,
                    damageType,
                },
                description: `${characterName} cast ${spellName} at ${result.levelLabel}${result.upcastNote}`,
            }),
            afterCommit: (result, characterName) => {
                io.to('dm_room').emit('dm_roll_feed', {
                    actor: characterName,
                    characterId,
                    label: spellName,
                    source: `${result.levelLabel}${result.upcastNote}`,
                    rollType: 'Spell Cast',
                    sides: 0,
                    count: 0,
                    modifier: 0,
                    total: 0,
                    rolls: [],
                    damageType: damageType || null,
                    isPrivate: false,
                });
                if (result.concentrationChanged) broadcastInitiative();
                if (result.concentrationError) {
                    socket.emit('rules_error', { message: result.concentrationError });
                }
            },
        });
    });

    socket.on('cast_concentration_spell', (command, acknowledge) => {
        const { characterId, spellName, slotLevel, actor, requestId, commandId, expectedVersion } = command || {};
        executeCharacterSocketCommand({
            socket, acknowledge, resultEvent: 'concentration_result',
            commandType: 'character.concentration.start', characterId,
            requestId, commandId, expectedVersion, actor,
            payload: { characterId, spellName, slotLevel, actor },
            execute: () => castConcentrationSpellEvent(db, characterId, spellName, slotLevel ?? null),
            buildAudit: (_result, characterName) => ({
                eventType: 'concentration_start',
                payload: { spellName, slotLevel },
                description: `${characterName} began concentrating on ${spellName}`,
            }),
            afterCommit: () => broadcastInitiative(),
        });
    });

    socket.on('drop_concentration', (command, acknowledge) => {
        const { characterId, actor, requestId, commandId, expectedVersion } = command || {};
        executeCharacterSocketCommand({
            socket, acknowledge, resultEvent: 'concentration_result',
            commandType: 'character.concentration.drop', characterId,
            requestId, commandId, expectedVersion, actor,
            payload: { characterId, actor },
            execute: () => {
                const result = dropConcentrationEvent(db, characterId);
                return { ...result, mutated: Boolean(result.droppedSpell) };
            },
            buildAudit: (result, characterName) => ({
                eventType: 'concentration_dropped',
                payload: { spellName: result.droppedSpell },
                description: `${characterName} dropped concentration on ${result.droppedSpell}`,
            }),
            afterCommit: () => broadcastInitiative(),
        });
    });

    socket.on('concentration_check_result', ({ characterId, spellName, passed, dc }) => {
        if (!passed) {
            const result = dropConcentrationEvent(db, characterId);
            if (result.success) {
                logAction('System', result.logMessage);
                broadcastPartyState();
                broadcastInitiative();
            }
        }
        const char = db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId);
        const label = char ? char.name : `Character ${characterId}`;
        logAction(label, `${label} ${passed ? 'maintained' : 'lost'} concentration on ${spellName} (DC ${dc}).`);
    });

    socket.on('apply_condition', (command, acknowledge) => {
        const { characterId, condition, actor, requestId, commandId, expectedVersion, durationRounds } = command || {};
        executeCharacterSocketCommand({
            socket, acknowledge, resultEvent: 'condition_result',
            commandType: 'character.condition.apply', characterId,
            requestId, commandId, expectedVersion, actor,
            payload: { characterId, condition, durationRounds, actor },
            execute: () => {
                const result = applyConditionEvent(db, characterId, condition, durationRounds);
                return { ...result, mutated: result.success && !result.alreadyPresent && !result.bypassed };
            },
            buildAudit: (_result, characterName) => {
                const durationStr = durationRounds > 0 ? ` (${durationRounds} rds)` : '';
                return {
                    eventType: 'condition_applied',
                    payload: { condition, durationRounds: durationRounds || null },
                    description: `${actor || 'System'} applied ${condition}${durationStr} to ${characterName}`,
                };
            },
        });
    });

    socket.on('remove_condition', (command, acknowledge) => {
        const { characterId, condition, actor, requestId, commandId, expectedVersion } = command || {};
        executeCharacterSocketCommand({
            socket, acknowledge, resultEvent: 'condition_result',
            commandType: 'character.condition.remove', characterId,
            requestId, commandId, expectedVersion, actor,
            payload: { characterId, condition, actor },
            execute: () => removeConditionEvent(db, characterId, condition),
            buildAudit: (_result, characterName) => ({
                eventType: 'condition_removed',
                payload: { condition },
                description: `${actor || 'System'} removed ${condition} from ${characterName}`,
            }),
        });
    });

    socket.on('apply_buff', (command, acknowledge) => {
        const {
            characterIds, buffData, actor, requestId, commandId, expectedVersion,
            expectedCampaignVersion, expectedAggregateVersions,
        } = command || {};
        const ids = (Array.isArray(characterIds) ? characterIds : [characterIds])
            .map(Number)
            .filter(Number.isInteger);
        const affectedIds = [...new Set([
            ...ids,
            ...(buffData?.isConcentration && buffData?.sourceCharacterId != null && Number.isInteger(Number(buffData.sourceCharacterId))
                ? [Number(buffData.sourceCharacterId)]
                : []),
        ])];
        const resolvedCommandId = commandId || requestId || randomUUID();
        try {
            const outcome = executeProcessedCommand(db, {
                commandId: resolvedCommandId,
                commandType: 'party.buff.apply',
                actorType: socket.dmAuthenticated ? 'dm' : 'player',
                actorId: playerSocketMap.get(socket.id)?.characterId ?? null,
                sessionId: getActiveCombatSession(db)?.id ?? null,
                expectedCampaignVersion: expectedCampaignVersion ?? null,
                aggregates: affectedIds.map(id => ({
                    key: `character:${id}`,
                    expectedVersion: expectedAggregateVersions?.[`character:${id}`]
                        ?? (affectedIds.length === 1 ? expectedVersion : null),
                })),
                payload: { characterIds: ids, buffData, actor },
            }, () => {
                if (ids.length === 0) return { success: false, error: 'No characters selected' };
                const resolvedBuffData = { ...(buffData || {}) };
                if (resolvedBuffData.isConcentration && resolvedBuffData.sourceCharacterId) {
                    const sourceCharacterId = Number(resolvedBuffData.sourceCharacterId);
                    const sourceState = getSessionState(db, sourceCharacterId);
                    if (!sourceState?.concentrationId || sourceState.concentratingOn !== resolvedBuffData.name) {
                        const concentration = castConcentrationSpellEvent(db, sourceCharacterId, resolvedBuffData.name, null);
                        if (!concentration.success) throw new Error(concentration.error || 'Unable to start concentration');
                        resolvedBuffData.concentrationId = concentration.concentrationId;
                    } else {
                        resolvedBuffData.concentrationId = sourceState.concentrationId;
                    }
                }

                const records = ids.map(id => {
                    const result = applyBuffEvent(db, id, resolvedBuffData);
                    if (!result.success) throw new Error(`Unable to apply buff to character ${id}`);
                    const charData = getCharacterData(db, id);
                    const characterName = charData?.name ?? `Character ${id}`;
                    writeAuditEvent(db, {
                        sessionRound: currentCombatRound,
                        turnIndex: currentTurnIndex,
                        eventType: 'buff_applied',
                        actor: actor || 'System',
                        targetId: id,
                        targetName: characterName,
                        payload: { buffData: resolvedBuffData },
                        requestId: `${resolvedCommandId}-buff-${id}`,
                        description: `${actor || 'System'} applied ${resolvedBuffData.name || 'buff'} to ${characterName}`,
                    });
                    db.prepare(`
                        INSERT INTO action_log (timestamp, actor, action_description, status)
                        VALUES (datetime('now'), ?, ?, 'applied')
                    `).run(actor || 'System', result.logMessage);
                    return { characterId: id, characterName, buff: result.buff };
                });
                return { success: true, records, concentrationChanged: Boolean(resolvedBuffData.isConcentration) };
            }, {
                buildDelta: () => ({
                    kind: 'party.buff.apply',
                    scopes: ['party', 'initiative', 'timeline', 'action_log'],
                    targets: ids.map(id => ({ id, type: 'character' })),
                }),
                afterCommit: committed => broadcastStateDelta(committed),
            });

            emitCommandResult(socket, 'buff_result', acknowledge, outcome);
        } catch (error) {
            emitCommandError(socket, 'buff_result', acknowledge, error);
            if (!(error instanceof CommandConflictError)) console.error('[Command] apply_buff failed:', error);
        }
    });

    socket.on('remove_buff', (command, acknowledge) => {
        const { characterId, buffId, actor, requestId, commandId, expectedVersion } = command || {};
        executeCharacterSocketCommand({
            socket, acknowledge, resultEvent: 'buff_result',
            commandType: 'character.buff.remove', characterId,
            requestId, commandId, expectedVersion, actor,
            payload: { characterId, buffId, actor },
            execute: () => removeBuffEvent(db, characterId, buffId),
            buildAudit: (_result, characterName) => ({
                eventType: 'buff_removed',
                payload: { buffId },
                description: `${actor || 'System'} removed buff from ${characterName}`,
            }),
        });
    });

    socket.on('toggle_feature', ({ characterId, featureName, actor, requestId }) => {
        const result = toggleFeatureEvent(db, characterId, featureName);
        if (result.success) {
            const charData = getCharacterData(db, characterId);
            const charName = charData?.name ?? `Character ${characterId}`;
            writeAuditEvent(db, {
                sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
                eventType: 'feature_toggled', actor: actor || 'System',
                targetId: characterId, targetName: charName,
                payload: { featureName, isActive: result.isActive }, requestId,
                description: `${actor || 'System'} ${result.isActive ? 'activated' : 'deactivated'} ${featureName} on ${charName}`,
            });
            logAction(actor || 'System', result.logMessage);
            broadcastPartyState();
            broadcastTimeline();
        }
    });

    socket.on('use_spell_slot', (command, acknowledge) => {
        const { characterId, slotLevel, actor, requestId, commandId, expectedVersion } = command || {};
        executeCharacterSocketCommand({
            socket, acknowledge, resultEvent: 'use_spell_slot_result',
            commandType: 'character.spell_slot.use', characterId,
            requestId, commandId, expectedVersion, actor,
            payload: { characterId, slotLevel, actor },
            execute: () => useSpellSlotEvent(db, characterId, slotLevel),
            buildAudit: (_result, characterName) => ({
                eventType: 'spell_slot_used',
                payload: { slotLevel },
                description: `${characterName} used a level ${slotLevel} spell slot`,
            }),
        });
    });

    socket.on('spend_hit_die', (command, acknowledge) => {
        const { characterId, dieType, actor, requestId, commandId, expectedVersion } = command || {};
        executeCharacterSocketCommand({
            socket, acknowledge, resultEvent: 'hit_die_result',
            commandType: 'character.hit_die.spend', characterId,
            requestId, commandId, expectedVersion, actor,
            payload: { characterId, dieType, actor },
            execute: () => spendHitDieEvent(db, characterId, dieType),
            buildAudit: (result, characterName) => ({
                eventType: 'heal',
                payload: { value: result.healed, dieType, roll: result.roll, conMod: result.conMod, source: 'hit_die' },
                description: `${characterName} spent a ${dieType}: rolled ${result.roll} + ${result.conMod} CON = ${result.healed} HP healed`,
            }),
            afterCommit: (result, characterName) => {
                io.to('dm_room').emit('dm_roll_feed', {
                    actor: characterName, characterId, label: `Hit Die (${dieType})`, source: 'Short Rest',
                    rollType: 'HP Heal', sides: parseInt(dieType.replace('d', ''), 10), count: 1,
                    modifier: result.conMod, total: result.healAmount, rolls: [result.roll],
                    damageType: null, isPrivate: false,
                });
            },
        });
    });

    socket.on('short_rest', (command, acknowledge) => {
        const { characterId, actor, requestId, commandId, expectedVersion } = command || {};
        executeCharacterSocketCommand({
            socket, acknowledge, resultEvent: 'short_rest_result',
            commandType: 'character.rest.short', characterId,
            requestId, commandId, expectedVersion, actor,
            payload: { characterId, actor },
            execute: () => shortRestEvent(db, characterId),
            buildAudit: (_result, characterName) => ({
                eventType: 'rest', payload: { restType: 'short' },
                description: `${characterName} took a short rest`,
            }),
            afterCommit: () => socket.emit('advance_time', { minutes: 60 }),
        });
    });

    socket.on('long_rest', (command, acknowledge) => {
        const { characterId, actor, requestId, commandId, expectedVersion } = command || {};
        executeCharacterSocketCommand({
            socket, acknowledge, resultEvent: 'long_rest_result',
            commandType: 'character.rest.long', characterId,
            requestId, commandId, expectedVersion, actor,
            payload: { characterId, actor },
            execute: () => longRestEvent(db, characterId),
            buildAudit: (_result, characterName) => ({
                eventType: 'rest', payload: { restType: 'long' },
                description: `${characterName} took a long rest`,
            }),
            afterCommit: () => socket.emit('advance_time', { minutes: 480 }),
        });
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

    function emitSaveResolved({ characterId, ability, dc, roll, passed, charName, rollVisibility }) {
        if (rollVisibility === 'public') {
            io.emit('save_resolved', { characterId, ability, dc, roll, passed, charName, rollVisibility });
            return;
        }

        io.to('dm_room').emit('save_resolved', { characterId, ability, dc, roll, passed, charName, rollVisibility });
        if (rollVisibility === 'private') {
            socket.emit('save_resolved', { characterId, ability, dc, roll, passed, charName, rollVisibility });
            return;
        }

        // Secret and super-secret save rolls are already acknowledged by the
        // roll routing layer, so this path only mirrors the final save result.
    }

    function handleDiceRoll(payload, { serverGenerated = false } = {}) {
        const {
            actor,
            sides,
            count,
            modifier,
            total,
            rolls,
            rollType,
            ability,
            label,
            source,
            damageType,
            characterId: payloadCharacterId,
        } = payload;
        const rollVisibility = normalizeRollVisibility(payload);
        const safeRolls = Array.isArray(rolls) ? rolls : [];
        const rollString = `${count}d${sides}${modifier !== 0 ? (modifier > 0 ? '+' + modifier : modifier) : ''}`;
        const detailString = safeRolls.length > 1 ? ` (${safeRolls.join(' + ')})` : '';
        const msg = `rolled ${total} on ${rollString}${detailString}`;

        if (isPublicRoll(rollVisibility)) logAction(actor || 'Someone', msg);

        // ── Auto-populate Initiative Tracker from player Initiative rolls ──
        if (rollType === 'Initiative' && getAutomationRules(db).initiativeSync) {
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

        const socketInfo = playerSocketMap.get(socket.id);
        if (rollType === 'Attack Roll') {
            const ammunitionCharacterId = socketInfo?.characterId ?? (Number(payloadCharacterId) || null);
            if (ammunitionCharacterId) {
                const ammunitionResult = consumeAmmunitionForAttack(db, ammunitionCharacterId, source || label);
                if (ammunitionResult.consumed > 0) {
                    const character = db.prepare('SELECT name FROM characters WHERE id = ?').get(ammunitionCharacterId);
                    writeAuditEvent(db, {
                        sessionRound: currentCombatRound,
                        turnIndex: currentTurnIndex,
                        eventType: 'ammunition_used',
                        actor: actor || character?.name || 'Player',
                        targetId: ammunitionCharacterId,
                        targetName: character?.name || null,
                        payload: ammunitionResult,
                        description: `${character?.name || 'Character'} used ${ammunitionResult.consumed} ${ammunitionResult.ammunitionName}`,
                    });
                    broadcastPartyState();
                    broadcastTimeline();
                    socket.emit('ammunition_updated', ammunitionResult);
                    socket.to('dm_room').emit('ammunition_updated', { characterId: ammunitionCharacterId, ...ammunitionResult });
                } else if (!ammunitionResult.success) {
                    socket.emit('ammunition_error', ammunitionResult);
                    socket.to('dm_room').emit('ammunition_error', { characterId: ammunitionCharacterId, ...ammunitionResult });
                }
            }
        }
        const feedEvent = {
            id: Date.now(),
            actor: actor || 'Someone',
            characterId: socketInfo?.characterId ?? (Number(payloadCharacterId) || null),
            label: label || rollType || 'Roll',
            source: source || null,
            rollType: rollType || 'Roll',
            sides, count, modifier, total, rolls: safeRolls,
            damageType: damageType || null,
            isPrivate: rollVisibility !== 'public',
            rollVisibility,
            serverGenerated,
            timestamp: new Date().toISOString(),
        };
        const routing = buildRollRouting(feedEvent, rollVisibility);
        if (routing.publicEvent) io.emit('roll_feed_event', routing.publicEvent);
        else io.to('dm_room').emit('roll_feed_event', routing.dmEvent);
        if (routing.rollerEvent) socket.emit('secret_roll_ack', routing.rollerEvent);

        // ── Sync-Linked Dice Rolls: auto-resolve pending saves ──
        const normalizedRollType = String(rollType || '').toLowerCase().replace(/\s+/g, '_');
        if ((normalizedRollType === 'saving_throw' || normalizedRollType === 'save') && ability) {
            const characterId = socketInfo?.characterId;
            if (characterId) {
                const pending = db.prepare(
                    `SELECT * FROM pending_saves WHERE character_id = ? AND ability = ? ORDER BY created_at ASC LIMIT 1`
                ).get(characterId, ability.toLowerCase());
                if (pending) {
                    const pendingVisibility = normalizeRollVisibility({ rollVisibility: pending.roll_visibility });
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
                    emitSaveResolved({ characterId, ability: pending.ability, dc: pending.dc, roll: total, passed, charName, rollVisibility: pendingVisibility });
                }
            }
        }
    }

    socket.on('dice_roll', (payload) => {
        handleDiceRoll(payload);
    });

    socket.on('server_dice_roll', (payload) => {
        const rolled = rollServerDice(payload);
        handleDiceRoll({
            ...payload,
            ...rolled,
            rollVisibility: normalizeRollVisibility(payload),
        }, { serverGenerated: true });
    });

    socket.on('dm_request_save', ({ targetCharacterIds, dc, ability, onFailEffects, onPassEffects, rollVisibility }) => {
        if (!Array.isArray(targetCharacterIds) || targetCharacterIds.length === 0) return;
        const normAbility = (ability || 'wis').toLowerCase();
        const requestedVisibility = normalizeRollVisibility({ rollVisibility });
        const insertPending = db.prepare(
            `INSERT INTO pending_saves (character_id, dc, ability, on_fail_json, on_pass_json, source, roll_visibility) VALUES (?, ?, ?, ?, ?, 'DM', ?)`
        );
        for (const charId of targetCharacterIds) {
            insertPending.run(charId, dc || 15, normAbility, JSON.stringify(onFailEffects || []), JSON.stringify(onPassEffects || []), requestedVisibility);
            for (const [socketId, info] of playerSocketMap.entries()) {
                if (info.characterId === charId) {
                    io.to(socketId).emit('pending_save_request', {
                        dc: dc || 15,
                        ability: normAbility,
                        source: 'DM',
                        rollVisibility: requestedVisibility,
                        timestamp: new Date().toISOString(),
                    });
                }
            }
        }
        logAction('DM', `Requested DC ${dc} ${normAbility.toUpperCase()} save from ${targetCharacterIds.length} character(s).`);
    });

    socket.on('spawn_monster', (monsterData) => {
        if (!socket.dmAuthenticated) { socket.emit('rules_error', { message: 'DM only' }); return; }
        try {
            spawnMonster(monsterData);
            broadcastInitiative();
            logAction('DM', `Spawned ${monsterData.name} into initiative.`);
        } catch (err) {
            console.error('[Combat] Error spawning monster:', err.message);
            socket.emit('rules_error', { message: 'Monster could not be spawned.' });
        }
    });

    socket.on('configure_boss_phases', ({ trackerId, phases }) => {
        if (!socket.dmAuthenticated) { socket.emit('rules_error', { message: 'DM only' }); return; }
        const result = configureBossPhases(db, trackerId, phases);
        if (!result.success) { socket.emit('rules_error', { message: result.error }); return; }
        broadcastInitiative();
        socket.emit('boss_phases_configured', { trackerId, ...result });
    });

    socket.on('transition_boss_phase', ({ trackerId, phaseIndex = null }) => {
        if (!socket.dmAuthenticated) { socket.emit('rules_error', { message: 'DM only' }); return; }
        const entity = db.prepare('SELECT entity_name FROM initiative_tracker WHERE id = ?').get(trackerId);
        const result = transitionBossPhase(db, trackerId, phaseIndex);
        if (!result.success) { socket.emit('rules_error', { message: result.error }); return; }
        if (!result.unchanged) {
            writeAuditEvent(db, {
                sessionRound: currentCombatRound,
                turnIndex: currentTurnIndex,
                eventType: 'boss_phase_transition',
                actor: 'DM',
                targetId: trackerId,
                targetType: 'monster',
                targetName: entity?.entity_name || 'Boss',
                payload: {
                    previousPhaseIndex: result.previousPhaseIndex,
                    currentPhaseIndex: result.currentPhaseIndex,
                    phaseName: result.phase.name,
                    hpMode: result.phase.hpMode,
                    currentHp: result.currentHp,
                },
                description: `${entity?.entity_name || 'Boss'} entered ${result.phase.name}`,
            });
            logAction('DM', `${entity?.entity_name || 'Boss'} entered ${result.phase.name}.`);
            broadcastInitiative();
            broadcastTimeline();
        }
        socket.emit('boss_phase_transitioned', { trackerId, ...result });
    });

    socket.on('toggle_entity_visibility', ({ entityId }) => {
        if (!socket.dmAuthenticated) { socket.emit('rules_error', { message: 'DM only' }); return; }
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
        if (!socket.dmAuthenticated) { socket.emit('rules_error', { message: 'DM only' }); return; }
        try {
            const automationRules = getAutomationRules(db);
            const partyCharacters = automationRules.initiativeSync ? getAllCharacters() : [];
            const tracker = startEncounter(encounterId, partyCharacters);
            if (!tracker) return;
            const encounterInfo = db.prepare('SELECT name FROM encounters WHERE id = ?').get(encounterId);
            const resolvedEncounterId = encounterInfo ? encounterId : null;
            startCombatSession(db, { encounterId: resolvedEncounterId, name: encounterInfo?.name || 'Ad Hoc Encounter' });
            currentCombatRound = 1;
            currentTurnIndex = 0;
            saveCombatState();
            broadcastCombatState();
            // Aura-Sync cleanup
            clearAllAuras(db);
            broadcastAuras();

            // Smart Pins load from template
            clearAllSmartPins(db);
            const encounter = db.prepare('SELECT notes_json FROM encounters WHERE id = ?').get(encounterId);
            if (encounter && encounter.notes_json) {
                try {
                    const notes = JSON.parse(encounter.notes_json);
                    if (Array.isArray(notes)) {
                        saveSmartPins(db, notes);
                    }
                } catch (err) {
                    console.error('[Combat] Error parsing encounter notes:', err.message);
                }
            }
            broadcastSmartPins();

            logAction('DM', '⚔️ Combat has begun!');
            broadcastInitiative();
            broadcastTimeline();
            broadcastPartyState();
        } catch (err) {
            console.error('[Combat] Error starting encounter:', err.message);
            socket.emit('rules_error', { message: 'Encounter could not be started.' });
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
        saveCombatState();
        broadcastCombatState();

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

        rawBroadcastInitiative();
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
        saveCombatState();
        broadcastCombatState();

        rawBroadcastInitiative();
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

    socket.on('auto_roll_initiative', () => {
        if (!socket.dmAuthenticated) { socket.emit('rules_error', { message: 'DM only' }); return; }
        const tracker = rollAllInitiative();
        broadcastInitiative();
        logAction('DM', 'Rolled initiative for all combatants.');
        socket.emit('auto_roll_result', { rolls: tracker.map(e => ({ name: e.entity_name, initiative: e.initiative })) });
    });

    socket.on('dismiss_dead', () => {
        if (!socket.dmAuthenticated) { socket.emit('rules_error', { message: 'DM only' }); return; }
        const result = db.prepare("DELETE FROM initiative_tracker WHERE entity_type IN ('monster', 'npc') AND current_hp <= 0").run();
        broadcastInitiative();
        logAction('DM', `Dismissed ${result.changes} dead combatant(s) from tracker.`);
        socket.emit('dismiss_dead_result', { dismissed: result.changes });
    });

    socket.on('clear_all_conditions', () => {
        if (!socket.dmAuthenticated) { socket.emit('rules_error', { message: 'DM only' }); return; }
        const pcEntries = db.prepare("SELECT character_id FROM initiative_tracker WHERE entity_type = 'pc' AND character_id IS NOT NULL").all();
        let cleared = 0;
        for (const entry of pcEntries) {
            const state = getSessionState(db, entry.character_id);
            if (state && state.activeConditions.length > 0) {
                state.activeConditions = [];
                state.conditionDurations = {};
                saveSessionState(db, state);
                cleared++;
            }
        }
        broadcastPartyState();
        broadcastInitiative();
        logAction('DM', `Cleared conditions from ${cleared} character(s).`);
        socket.emit('clear_conditions_result', { cleared });
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
        writeBloodiedAuditEvent({
            transition: getBloodiedTransition(entity.current_hp, newHp, entity.max_hp, getAutomationRules(db)),
            targetId: entity.entity_type === 'pc' && entity.character_id
                ? entity.character_id
                : trackerId,
            targetType: entity.entity_type === 'pc' ? 'character' : 'monster',
            targetName: entity.entity_name,
            previousHp: entity.current_hp,
            currentHp: newHp,
        });
        broadcastInitiative();
        broadcastTimeline();
    });

    socket.on('end_encounter', async (command, callback) => {
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
            const survivors = trackerState
                .filter(e => e.current_hp > 0)
                .map(e => {
                    return {
                        name: e.entity_name,
                        type: e.entity_type,
                        hp: e.current_hp,
                        maxHp: e.max_hp,
                        conditions: e.conditions || [],
                    };
                });

            let reportText = null;
            if (events.length >= 2) {
                try { reportText = await generateCombatReport({ events, survivors, totalRounds }); } catch (_) {}
            }
            const resolvedCommandId = command?.commandId || command?.requestId || randomUUID();
            const outcome = executeProcessedCommand(db, {
                commandId: resolvedCommandId,
                commandType: 'combat.encounter.end',
                actorType: socket.dmAuthenticated ? 'dm' : 'player',
                actorId: playerSocketMap.get(socket.id)?.characterId ?? null,
                sessionId: getActiveCombatSession(db)?.id ?? null,
                expectedCampaignVersion: command?.expectedCampaignVersion ?? null,
                aggregates: ['campaign:combat', 'collection:initiative', 'collection:auras', 'collection:smart_pins']
                    .map(key => ({ key, expectedVersion: command?.expectedAggregateVersions?.[key] ?? null })),
                payload: { totalRounds, eventCount: events.length },
            }, () => {
                archiveActiveCombatSession(db, totalRounds);
                endEncounter();
                currentCombatRound = 0;
                currentTurnIndex = 0;
                saveCombatState();
                clearAllAuras(db);
                clearAllSmartPins(db);
                db.prepare(`
                    INSERT INTO action_log (timestamp, actor, action_description, status)
                    VALUES (datetime('now'), 'DM', '🏁 Combat has ended.', 'applied')
                `).run();
                return { success: true, report: reportText, events, survivors, totalRounds };
            }, {
                buildDelta: () => ({
                    kind: 'combat_ended', scopes: ['party', 'initiative', 'timeline', 'action_log'], totalRounds,
                }),
                afterCommit: committed => broadcastStateDelta(committed),
            });
            callback?.({ ...outcome.result, replayed: outcome.replayed, campaignVersion: outcome.campaignVersion });
        } catch (err) {
            console.error('[Combat] Error ending encounter:', err.message);
            callback?.({ success: false, error: err.message });
        }
    });

    // ── Party Effect Engine ──────────────────────────────────────────────────
    socket.on('request_effect', ({ effects, targets, actor }) => {
        if (!effects || !Array.isArray(effects) || effects.length === 0) return;
        const records = previewPartyEffect(db, effects, targets || 'party');
        if (!records || records.length === 0 || !records.some(r => r.success)) {
            socket.emit('rules_error', { message: 'Effect preview yielded no valid targets or all failed.' });
            return;
        }

        const pendingId = randomUUID();
        const timeout = setTimeout(() => {
            pendingEffects.delete(pendingId);
            io.emit('effect_preview_expired', { pendingId });
            logAction(actor || 'System', `Pending effect request expired.`);
        }, 60000); // 60 seconds

        pendingEffects.set(pendingId, { timeout, payload: { effects, targets, actor }, records });
        io.emit('incoming_effect_preview', { pendingId, actor, records });
    });

    socket.on('resolve_pending_effect', ({ pendingId, action }) => {
        const pending = pendingEffects.get(pendingId);
        if (!pending) {
            socket.emit('rules_error', { message: 'Pending effect not found or expired.' });
            return;
        }

        clearTimeout(pending.timeout);
        pendingEffects.delete(pendingId);

        if (action === 'accept') {
            const { effects, targets, actor } = pending.payload;
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
            io.emit('effect_preview_resolved', { pendingId, action });
        } else {
            io.emit('effect_preview_resolved', { pendingId, action: 'reject' });
            logAction(pending.payload.actor || 'DM', `Effect request rejected.`);
        }
    });

    socket.on('apply_party_effect', (command, acknowledge) => {
        const normalized = command?.payload ? command : {
            ...command,
            targets: command?.targets || 'party',
        };
        try {
            const outcome = executeEffectCommand(db, normalized, {
                actorType: socket.dmAuthenticated ? 'dm' : 'player',
                actorId: playerSocketMap.get(socket.id)?.characterId ?? null,
                actorName: command?.payload?.actor || command?.actor || 'DM',
                sessionId: getActiveCombatSession(db)?.id ?? null,
                sessionRound: currentCombatRound,
                turnIndex: currentTurnIndex,
            }, { afterCommit: committed => broadcastStateDelta(committed) });
            emitCommandResult(socket, 'party_effect_result', acknowledge, outcome);
        } catch (error) {
            emitCommandError(socket, 'party_effect_result', acknowledge, error);
            if (!(error instanceof CommandConflictError)) console.error('[Command] apply_party_effect failed:', error);
        }
    });

    socket.on('trigger_automation', ({ presetId, actor }) => {
        const preset = db.prepare('SELECT * FROM automation_presets WHERE id = ?').get(presetId);
        if (!preset) return;
        let effects, targetsSpec;
        try { effects = JSON.parse(preset.effects_json); } catch { effects = []; }
        try { targetsSpec = JSON.parse(preset.targets_json); } catch { targetsSpec = 'party'; }

        // ── If preset requires a saving throw, insert pending_saves instead of applying immediately ──
        if (preset.save_dc) {
            const targets = resolveTargets(db, targetsSpec);
            const normAbility = (preset.save_ability || 'wis').toLowerCase();
            let onPassEffects;
            try { onPassEffects = JSON.parse(preset.save_on_pass_json || '[]'); } catch { onPassEffects = []; }

            const insertPending = db.prepare(
                `INSERT INTO pending_saves (character_id, dc, ability, on_fail_json, on_pass_json, source) VALUES (?, ?, ?, ?, ?, ?)`
            );
            let saveCount = 0;

            for (const target of targets) {
                if (target.type === 'character') {
                    // Characters get pending saves — they must roll
                    insertPending.run(
                        target.id, preset.save_dc, normAbility,
                        JSON.stringify(effects), JSON.stringify(onPassEffects),
                        `Macro: ${preset.name}`
                    );
                    // Notify the player's socket
                    for (const [socketId, info] of playerSocketMap.entries()) {
                        if (info.characterId === target.id) {
                            io.to(socketId).emit('pending_save_request', {
                                dc: preset.save_dc,
                                ability: normAbility,
                                source: `Macro: ${preset.name}`,
                                timestamp: new Date().toISOString(),
                            });
                        }
                    }
                    saveCount++;
                } else {
                    // Monsters don't roll — apply effects immediately
                    applyPartyEffect(
                        db, effects, [{ id: target.id, type: 'monster' }],
                        `Macro: ${preset.name}`, currentCombatRound, currentTurnIndex, 'action', preset.id
                    );
                }
            }

            if (saveCount > 0) {
                logAction(actor || 'DM', `Fired macro "${preset.name}" — DC ${preset.save_dc} ${normAbility.toUpperCase()} save requested from ${saveCount} character(s).`);
            }
            broadcastPartyState();
            broadcastInitiative();
            broadcastTimeline();
            return;
        }

        // ── No save required — apply effects immediately (original behavior) ──
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
        if (socket.castView) return;
        playerSocketMap.set(socket.id, { characterId: Number(characterId), playerName });
        emitRoleState(socket);
        socket.emit('action_logged', db.prepare('SELECT * FROM action_log ORDER BY id DESC LIMIT 100').all().reverse());
        socket.emit('notes_state', db.prepare('SELECT * FROM party_notes ORDER BY updated_at DESC').all());
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
                emitSaveResolved({
                    characterId,
                    ability: pending.ability,
                    dc: pending.dc,
                    roll: result,
                    passed,
                    charName,
                    rollVisibility: normalizeRollVisibility({ rollVisibility: pending.roll_visibility }),
                });
            }
        }
    });

    socket.on('end_session', async (command, callback) => {
        try {
            const logs = db.prepare('SELECT * FROM action_log ORDER BY id ASC').all();
            if (logs.length === 0) return callback?.({ success: false, error: 'No actions to recap.' });
            const recapText = await generateSessionRecap(logs);
            if (!recapText) return callback?.({ success: false, error: 'Ollama failed to generate recap.' });
            const outcome = executeProcessedCommand(db, {
                commandId: command?.commandId || command?.requestId || randomUUID(),
                commandType: 'campaign.session.end',
                actorType: socket.dmAuthenticated ? 'dm' : 'player',
                actorId: playerSocketMap.get(socket.id)?.characterId ?? null,
                expectedCampaignVersion: command?.expectedCampaignVersion ?? null,
                aggregates: ['collection:action_log', 'collection:session_recaps'].map(key => ({
                    key, expectedVersion: command?.expectedAggregateVersions?.[key] ?? null,
                })),
                payload: { logCount: logs.length },
            }, () => {
                db.prepare("INSERT INTO session_recaps (recap_text, raw_log) VALUES (?, ?)").run(recapText, JSON.stringify(logs));
                db.prepare('DELETE FROM action_log').run();
                return { success: true, recap: recapText };
            }, {
                buildDelta: () => ({ kind: 'session_ended', scopes: ['action_log', 'recaps'] }),
                afterCommit: committed => broadcastStateDelta(committed),
            });
            if (!outcome.replayed) await backupDatabase();
            const recaps = db.prepare('SELECT * FROM session_recaps ORDER BY created_at DESC').all();
            if (!outcome.replayed) io.emit('recaps_updated', recaps);
            callback?.({ ...outcome.result, replayed: outcome.replayed, campaignVersion: outcome.campaignVersion });
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

    socket.on('claim_loot', (command, acknowledge) => {
        const { lootId, characterId, characterName, requestId, commandId, expectedVersion } = command || {};
        const resolvedCommandId = commandId || requestId || randomUUID();
        // Permission check
        const perm = checkPermission(db, 'loot_claim', socket.dmAuthenticated, playerSocketMap.get(socket.id)?.characterId, characterId);
        if (!perm.allowed) {
            const item = db.prepare('SELECT name FROM shared_loot WHERE id = ?').get(lootId);
            const outcome = executeProcessedCommand(db, {
                commandId: resolvedCommandId,
                commandType: 'loot.claim.request',
                actorType: socket.dmAuthenticated ? 'dm' : 'player',
                actorId: playerSocketMap.get(socket.id)?.characterId ?? null,
                sessionId: getActiveCombatSession(db)?.id ?? null,
                payload: { lootId, characterId, characterName },
            }, () => {
                db.prepare(`
                    INSERT INTO action_log (timestamp, actor, action_description, status, effects_json)
                    VALUES (datetime('now'), ?, ?, 'pending', ?)
                `).run(
                    characterName || 'Player',
                    `wants to claim ${item?.name || 'item'} from loot pool`,
                    JSON.stringify({ type: 'loot_claim', lootId, characterId, characterName }),
                );
                return { success: true, pending: true, itemName: item?.name || 'item' };
            });
            emitCommandResult(socket, 'claim_loot_result', acknowledge, outcome);
            if (!outcome.replayed) broadcastLogs();
            socket.emit('rules_error', { message: perm.reason });
            return;
        }

        try {
            const outcome = executeProcessedCommand(db, {
                commandId: resolvedCommandId,
                commandType: 'loot.claim',
                actorType: socket.dmAuthenticated ? 'dm' : 'player',
                actorId: playerSocketMap.get(socket.id)?.characterId ?? null,
                sessionId: getActiveCombatSession(db)?.id ?? null,
                aggregateKey: `loot:${lootId}`,
                expectedVersion: expectedVersion ?? null,
                payload: { lootId, characterId, characterName },
            }, () => {
                const item = db.prepare('SELECT * FROM shared_loot WHERE id = ?').get(lootId);
                if (!item) return { success: false, error: 'Item already claimed' };
                const char = db.prepare('SELECT name, homebrew_inventory FROM characters WHERE id = ?').get(characterId);
                if (!char) return { success: false, error: 'Character not found' };

                const inventory = JSON.parse(char.homebrew_inventory || '[]');
                inventory.push({
                    id: `loot-${item.id}-${resolvedCommandId}`,
                    name: item.name,
                    description: item.description,
                    type: 'item',
                    stats: JSON.parse(item.stats_json || '{}'),
                    isHomebrew: true,
                    equipped: false,
                    quantity: 1,
                });
                db.prepare('UPDATE characters SET homebrew_inventory = ? WHERE id = ?').run(JSON.stringify(inventory), characterId);
                db.prepare('DELETE FROM shared_loot WHERE id = ?').run(lootId);

                const resolvedCharacterName = characterName || char.name || 'Player';
                writeAuditEvent(db, {
                    sessionRound: currentCombatRound,
                    turnIndex: currentTurnIndex,
                    eventType: 'loot_claimed',
                    actor: resolvedCharacterName,
                    targetId: characterId,
                    targetName: resolvedCharacterName,
                    payload: { itemName: item.name, itemId: item.id, rarity: item.rarity },
                    requestId: resolvedCommandId,
                    description: `${resolvedCharacterName} claimed ${item.name} from the party loot pool`,
                });
                db.prepare(`
                    INSERT INTO action_log (timestamp, actor, action_description, status)
                    VALUES (datetime('now'), ?, ?, 'applied')
                `).run(resolvedCharacterName, `claimed ${item.name} from the party loot pool`);
                return { success: true, itemName: item.name, characterName: resolvedCharacterName };
            });

            emitCommandResult(socket, 'claim_loot_result', acknowledge, outcome);
            if (outcome.replayed || !outcome.result?.success) return;
            broadcastLogs();
            broadcastPartyLoot();
            broadcastPartyState();
            broadcastTimeline();
            io.to('dm_room').emit('roll_feed_event', {
                id: Date.now(),
                actor: outcome.result.characterName,
                characterId: String(characterId),
                label: `${outcome.result.characterName} looted ${outcome.result.itemName}`,
                source: null,
                rollType: 'Loot Claimed',
                sides: 0, count: 0, modifier: 0, total: 0, rolls: [],
                damageType: null,
                isPrivate: false,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            emitCommandError(socket, 'claim_loot_result', acknowledge, error);
            if (!(error instanceof CommandConflictError)) console.error('[Command] claim_loot failed:', error);
        }
    });

    socket.on('remove_loot', ({ lootId }) => {
        db.prepare('DELETE FROM shared_loot WHERE id = ?').run(lootId);
        broadcastPartyLoot();
    });

    socket.on('loot_vote_open', ({ lootId }) => {
        if (!socket.dmAuthenticated) { socket.emit('rules_error', { message: 'DM only' }); return; }
        const item = db.prepare('SELECT * FROM shared_loot WHERE id = ?').get(lootId);
        if (!item) return;
        const voteState = { status: 'open', votes: {} };
        db.prepare('UPDATE shared_loot SET vote_state_json = ? WHERE id = ?').run(JSON.stringify(voteState), lootId);
        broadcastPartyLoot();
        io.emit('loot_vote_opened', { lootId, itemName: item.name });
    });

    socket.on('loot_vote_cast', ({ lootId, vote, characterId, characterName }) => {
        const item = db.prepare('SELECT * FROM shared_loot WHERE id = ?').get(lootId);
        if (!item || !item.vote_state_json) return;
        const voteState = JSON.parse(item.vote_state_json);
        if (voteState.status !== 'open') return;
        if (!['need', 'greed', 'pass'].includes(vote)) return;
        voteState.votes[String(characterId)] = { vote, characterName: characterName || 'Player' };
        db.prepare('UPDATE shared_loot SET vote_state_json = ? WHERE id = ?').run(JSON.stringify(voteState), lootId);
        broadcastPartyLoot();
        // Check if all connected players have voted
        const connectedCharIds = [...playerSocketMap.values()]
            .filter(p => p.characterId)
            .map(p => String(p.characterId));
        const allVoted = connectedCharIds.length > 0 && connectedCharIds.every(id => voteState.votes[id]);
        if (allVoted) resolveLootVote(db, lootId, io, broadcastPartyLoot, broadcastPartyState, logAction);
    });

    socket.on('loot_vote_cancel', ({ lootId }) => {
        if (!socket.dmAuthenticated) { socket.emit('rules_error', { message: 'DM only' }); return; }
        db.prepare('UPDATE shared_loot SET vote_state_json = NULL WHERE id = ?').run(lootId);
        broadcastPartyLoot();
    });

    socket.on('loot_vote_force_resolve', ({ lootId }) => {
        if (!socket.dmAuthenticated) { socket.emit('rules_error', { message: 'DM only' }); return; }
        resolveLootVote(db, lootId, io, broadcastPartyLoot, broadcastPartyState, logAction);
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

    // ── Group Undo ────────────────────────────────────────────────────────────
    socket.on('reverse_group', ({ groupId }) => {
        if (!socket.dmAuthenticated) { socket.emit('rules_error', { message: 'DM only' }); return; }
        if (!groupId) { socket.emit('rules_error', { message: 'groupId required' }); return; }

        const REVERSIBLE = ['damage', 'heal', 'condition_applied', 'condition_removed'];
        const groupEvents = db.prepare(
            `SELECT * FROM effect_events WHERE group_id = ? AND is_reversed = 0 AND event_type IN (${REVERSIBLE.map(() => '?').join(',')})`
        ).all(groupId, ...REVERSIBLE);

        if (groupEvents.length === 0) {
            socket.emit('rules_error', { message: 'No reversible events in this group (already undone?)' });
            return;
        }

        let reversed = 0;
        db.transaction(() => {
            for (const ev of groupEvents) {
                const result = reverseEvent(db, ev.id, 'DM', applyDamageEvent, applyHealEvent, applyConditionEvent, removeConditionEvent);
                if (result.success) reversed++;
            }
        })();

        broadcastPartyState();
        broadcastTimelineImmediate();
        logAction('DM', `Group undo — reversed ${reversed} event(s) from AoE group ${groupId}`);
    });

    // ── AoE / Multi-target Effect ──────────────────────────────────────────────
    // targets: Array<{ id: string|number, type: 'character'|'monster' }>
    // effects: Array<{ type: 'damage'|'heal'|'condition'|'remove_condition', value?: number, damageType?: string, condition?: string }>
    // requestId is used as group_id so all child events can be correlated in the Combat Log.
    socket.on('apply_aoe_effect', (command, acknowledge) => {
        if (!socket.dmAuthenticated) { emitCommandError(socket, 'aoe_effect_result', acknowledge, new Error('DM only')); return; }
        try {
            const outcome = executeEffectCommand(db, command, {
                actorType: 'dm',
                actorId: playerSocketMap.get(socket.id)?.characterId ?? 'DM',
                actorName: command?.payload?.actor || command?.actor || 'DM',
                sessionId: getActiveCombatSession(db)?.id ?? null,
                sessionRound: currentCombatRound,
                turnIndex: currentTurnIndex,
            }, { afterCommit: committed => broadcastStateDelta(committed) });
            emitCommandResult(socket, 'aoe_effect_result', acknowledge, outcome);
        } catch (error) {
            emitCommandError(socket, 'aoe_effect_result', acknowledge, error);
            if (!(error instanceof CommandConflictError)) console.error('[Command] apply_aoe_effect failed:', error);
        }
    });

    socket.on('apply_aoe_effect_legacy', ({ requestId, targets, effects, actor }) => {
        if (!socket.dmAuthenticated) { socket.emit('rules_error', { message: 'DM only' }); return; }
        if (!Array.isArray(targets) || targets.length === 0) { socket.emit('rules_error', { message: 'No targets specified' }); return; }
        if (!Array.isArray(effects) || effects.length === 0) { socket.emit('rules_error', { message: 'No effects specified' }); return; }

        // Resolve targets via effectEngine (handles both characters and monsters)
        const resolved = resolveTargets(db, targets.map(t => ({ id: Number(t.id), type: t.type })));
        if (resolved.length === 0) { socket.emit('rules_error', { message: 'No valid targets found' }); return; }

        // Use requestId as both idempotency base and group_id for batch correlation.
        // Per-target requestId suffix prevents cross-target dedup collisions.
        const groupId = requestId;
        const records = [];

        const db_tx = db.transaction(() => {
            for (const target of resolved) {
                for (const effect of effects) {
                    const perTargetRequestId = requestId ? `${requestId}-${target.id}-${effect.type}` : undefined;

                    // Idempotency check per sub-event
                    if (perTargetRequestId) {
                        const exists = db.prepare('SELECT 1 FROM effect_events WHERE request_id = ?').get(perTargetRequestId);
                        if (exists) { records.push({ targetId: target.id, targetName: target.name, eventType: effect.type, logMessage: 'duplicate skipped', success: false }); continue; }
                    }

                    let result, eventType;
                    if (target.type === 'character') {
                        ({ result, eventType } = (() => {
                            switch (effect.type) {
                                case 'damage': return { result: applyDamageEvent(db, target.id, effect.value || 0, effect.damageType || 'untyped'), eventType: 'damage' };
                                case 'heal':   return { result: applyHealEvent(db, target.id, effect.value || 0), eventType: 'heal' };
                                case 'condition': return { result: applyConditionEvent(db, target.id, effect.condition), eventType: 'condition_applied' };
                                case 'remove_condition': return { result: removeConditionEvent(db, target.id, effect.condition), eventType: 'condition_removed' };
                                default: return { result: { success: false, error: `Unknown effect: ${effect.type}` }, eventType: 'unknown' };
                            }
                        })());
                    } else {
                        // Monster — damage/heal only (conditions noted but not stored in schema)
                        const entity = db.prepare('SELECT * FROM initiative_tracker WHERE id = ?').get(target.id);
                        if (!entity) { records.push({ targetId: target.id, targetName: target.name, eventType: effect.type, logMessage: 'Monster not found', success: false }); continue; }
                        if (effect.type === 'damage') {
                            const dmg = Math.max(0, effect.value || 0);
                            const newHp = Math.max(0, entity.current_hp - dmg);
                            db.prepare('UPDATE initiative_tracker SET current_hp = ? WHERE id = ?').run(newHp, target.id);
                            result = {
                                success: true,
                                previousHp: entity.current_hp,
                                newHp,
                                bloodiedTransition: getBloodiedTransition(entity.current_hp, newHp, entity.max_hp, getAutomationRules(db)),
                                logMessage: `${entity.entity_name} takes ${dmg} ${effect.damageType || 'untyped'} damage (${newHp}/${entity.max_hp} HP)`,
                            };
                            eventType = 'damage';
                        } else if (effect.type === 'heal') {
                            const heal = Math.max(0, effect.value || 0);
                            const newHp = Math.min(entity.max_hp, entity.current_hp + heal);
                            db.prepare('UPDATE initiative_tracker SET current_hp = ? WHERE id = ?').run(newHp, target.id);
                            result = {
                                success: true,
                                previousHp: entity.current_hp,
                                newHp,
                                bloodiedTransition: getBloodiedTransition(entity.current_hp, newHp, entity.max_hp, getAutomationRules(db)),
                                logMessage: `${entity.entity_name} healed ${heal} HP (${newHp}/${entity.max_hp} HP)`,
                            };
                            eventType = 'heal';
                        } else {
                            result = { success: true, logMessage: `${target.name}: ${effect.condition || effect.type} (noted)` };
                            eventType = effect.type === 'condition' ? 'condition_applied' : 'condition_removed';
                        }
                    }

                    if (result.success) {
                        writeAuditEvent(db, {
                            sessionRound: currentCombatRound, turnIndex: currentTurnIndex,
                            eventType,
                            actor: actor || 'DM',
                            targetId: target.id,
                            targetName: target.name,
                            payload: { ...effect },
                            requestId: perTargetRequestId,
                            description: result.logMessage,
                            groupId,
                        });
                        writeBloodiedAuditEvent({
                            transition: result.bloodiedTransition,
                            targetId: target.id,
                            targetType: target.type,
                            targetName: target.name,
                            previousHp: result.previousHp,
                            currentHp: result.newHp,
                        });
                    }

                    records.push({ targetId: target.id, targetName: target.name, eventType, logMessage: result.logMessage || result.error, success: result.success });
                }
            }
        });

        db_tx();

        broadcastPartyState();
        broadcastTimelineImmediate();
        socket.emit('aoe_effect_result', { groupId, records });
        logAction(actor || 'DM', `AoE [${effects.map(e => e.type).join('+')}] → ${resolved.map(t => t.name).join(', ')}`);
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
    console.log(`[Server] Arcane Ally backend running on http://localhost:${PORT}`);
});
