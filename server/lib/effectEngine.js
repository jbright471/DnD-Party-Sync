/**
 * @backend-smith — Effect Engine
 * Deterministic, event-sourced cross-target effect processor.
 *
 * Design principles:
 *  - Every applied effect writes an immutable row to effect_events.
 *  - Multi-target effects run inside a single SQLite transaction for atomicity.
 *  - Characters use rulesIntegration (session_states). Monsters use initiative_tracker directly.
 *  - Conflicts are resolved by rulesIntegration (e.g. concentration, already-present conditions).
 *  - Turn-trigger presets and auras are both resolved here; server.js hooks into next_turn.
 */

const {
    applyDamageEvent,
    applyHealEvent,
    applyConditionEvent,
    removeConditionEvent,
    applyBuffEvent,
} = require('./rulesIntegration');

// ─── Target resolution ────────────────────────────────────────────────────────

/**
 * Resolve a targets spec into an array of { id, type, name } objects.
 * targetsSpec: 'party' | 'enemies' | Array<{ id, type: 'character'|'monster' }>
 */
function resolveTargets(db, targetsSpec) {
    if (targetsSpec === 'party') {
        return db.prepare('SELECT id, name FROM characters').all()
            .map(c => ({ id: c.id, type: 'character', name: c.name }));
    }
    if (targetsSpec === 'enemies') {
        return db.prepare("SELECT id, entity_name as name FROM initiative_tracker WHERE entity_type = 'monster'").all()
            .map(e => ({ id: e.id, type: 'monster', name: e.name }));
    }
    if (Array.isArray(targetsSpec)) {
        return targetsSpec.map(t => {
            if (t.type === 'monster') {
                const row = db.prepare('SELECT id, entity_name as name FROM initiative_tracker WHERE id = ?').get(t.id);
                return row ? { id: row.id, type: 'monster', name: row.name } : null;
            }
            const row = db.prepare('SELECT id, name FROM characters WHERE id = ?').get(t.id);
            return row ? { id: row.id, type: 'character', name: row.name } : null;
        }).filter(Boolean);
    }
    return [];
}

// ─── Single-effect application ────────────────────────────────────────────────

function applyToCharacter(db, targetId, effect) {
    switch (effect.type) {
        case 'damage':
            return { result: applyDamageEvent(db, targetId, effect.value || 0, effect.damageType || 'untyped'), eventType: 'damage' };
        case 'heal':
            return { result: applyHealEvent(db, targetId, effect.value || 0), eventType: 'heal' };
        case 'condition':
            return { result: applyConditionEvent(db, targetId, effect.condition), eventType: 'condition_applied' };
        case 'remove_condition':
            return { result: removeConditionEvent(db, targetId, effect.condition), eventType: 'condition_removed' };
        case 'buff':
            return { result: applyBuffEvent(db, targetId, effect.buffData), eventType: 'buff_applied' };
        default:
            return { result: { success: false, error: `Unknown effect type: ${effect.type}` }, eventType: 'unknown' };
    }
}

function applyToMonster(db, trackerId, effect) {
    const entity = db.prepare('SELECT * FROM initiative_tracker WHERE id = ?').get(trackerId);
    if (!entity) return { result: { success: false, error: 'Monster not found' }, eventType: 'unknown' };

    switch (effect.type) {
        case 'damage': {
            const dmg = Math.max(0, effect.value || 0);
            const newHp = Math.max(0, entity.current_hp - dmg);
            db.prepare('UPDATE initiative_tracker SET current_hp = ? WHERE id = ?').run(newHp, trackerId);
            return {
                result: { success: true, logMessage: `${entity.entity_name} takes ${dmg} ${effect.damageType || 'untyped'} damage (${newHp}/${entity.max_hp} HP)` },
                eventType: 'damage',
            };
        }
        case 'heal': {
            const heal = Math.max(0, effect.value || 0);
            const newHp = Math.min(entity.max_hp, entity.current_hp + heal);
            db.prepare('UPDATE initiative_tracker SET current_hp = ? WHERE id = ?').run(newHp, trackerId);
            return {
                result: { success: true, logMessage: `${entity.entity_name} healed for ${heal} HP (${newHp}/${entity.max_hp} HP)` },
                eventType: 'heal',
            };
        }
        // Conditions and buffs are not tracked for monsters in the current schema.
        // Log a record but return early.
        case 'condition':
            return { result: { success: true, logMessage: `${entity.entity_name}: ${effect.condition} (noted)` }, eventType: 'condition_applied' };
        case 'remove_condition':
            return { result: { success: true, logMessage: `${entity.entity_name}: ${effect.condition} removed (noted)` }, eventType: 'condition_removed' };
        default:
            return { result: { success: false, error: `Effect type '${effect.type}' unsupported for monsters` }, eventType: 'unknown' };
    }
}

function writeEventRecord(db, { sessionRound, turnIndex, phase, eventType, actor, target, payloadJson, parentEventId, sourcePresetId }) {
    return db.prepare(`
        INSERT INTO effect_events
            (session_round, turn_index, phase, event_type, actor, target_id, target_type, target_name, payload_json, parent_event_id, source_preset_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        sessionRound || 0, turnIndex || 0, phase || 'action',
        eventType, actor,
        target.id, target.type, target.name,
        payloadJson,
        parentEventId || null, sourcePresetId || null
    ).lastInsertRowid;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Apply an array of effects to an array of resolved targets, inside a transaction.
 * Returns an array of { targetId, targetName, eventType, logMessage, success } records.
 */
function applyPartyEffect(db, effects, targetsSpec, actor, sessionRound, turnIndex, phase, sourcePresetId) {
    const targets = resolveTargets(db, targetsSpec);
    const records = [];

    db.transaction(() => {
        for (const target of targets) {
            // Skip entities that are already at 0 HP (Dead) for damage effects
            if (target.type === 'monster') {
                const entity = db.prepare('SELECT current_hp FROM initiative_tracker WHERE id = ?').get(target.id);
                if (entity && entity.current_hp <= 0 && effects.every(e => e.type === 'damage')) continue;
            }

            for (const effect of effects) {
                const { result, eventType } = target.type === 'character'
                    ? applyToCharacter(db, target.id, effect)
                    : applyToMonster(db, target.id, effect);

                if (result.success) {
                    writeEventRecord(db, {
                        sessionRound, turnIndex, phase, eventType, actor,
                        target,
                        payloadJson: JSON.stringify(effect),
                        parentEventId: null,
                        sourcePresetId,
                    });
                }

                records.push({
                    targetId: target.id,
                    targetName: target.name,
                    eventType,
                    logMessage: result.logMessage || result.error,
                    success: result.success,
                });
            }
        }
    })();

    return records;
}

/**
 * Process turn-trigger presets that match the given phase and active entity.
 * Called from server.js on the `next_turn` socket event.
 */
function processTurnTriggers(db, phase, activeEntityId, sessionRound, turnIndex) {
    const presets = db.prepare(`
        SELECT * FROM automation_presets
        WHERE preset_type = 'turn_trigger'
          AND trigger_phase = ?
          AND is_active = 1
          AND (trigger_entity_id = ? OR trigger_entity_id IS NULL)
    `).all(phase, activeEntityId);

    const allRecords = [];
    for (const preset of presets) {
        const effects = JSON.parse(preset.effects_json || '[]');
        let targetsSpec;
        try { targetsSpec = JSON.parse(preset.targets_json); } catch { targetsSpec = 'party'; }

        // Write an automation_trigger parent event
        const _parentId = writeEventRecord(db, {
            sessionRound, turnIndex, phase,
            eventType: 'automation_trigger',
            actor: `Auto: ${preset.name}`,
            target: { id: null, type: 'system', name: 'System' },
            payloadJson: JSON.stringify({ presetName: preset.name }),
            parentEventId: null,
            sourcePresetId: preset.id,
        });

        const records = applyPartyEffect(db, effects, targetsSpec, `Auto: ${preset.name}`, sessionRound, turnIndex, phase, preset.id);
        allRecords.push(...records);
    }
    return allRecords;
}

/**
 * Process aura presets for the entity whose turn is starting/ending.
 * Auras apply effects to their specified targets on each trigger.
 */
function processAurasForTurn(db, activeEntityId, sessionRound, turnIndex, phase) {
    const auras = db.prepare(`
        SELECT * FROM automation_presets
        WHERE preset_type = 'aura'
          AND is_active = 1
          AND (trigger_phase = ? OR trigger_phase IS NULL)
    `).all(phase);

    const allRecords = [];
    for (const aura of auras) {
        const effects = JSON.parse(aura.effects_json || '[]');
        let targetsSpec;
        try { targetsSpec = JSON.parse(aura.targets_json); } catch { targetsSpec = 'party'; }

        const records = applyPartyEffect(db, effects, targetsSpec, `Aura: ${aura.name}`, sessionRound, turnIndex, phase, aura.id);
        allRecords.push(...records);
    }
    return allRecords;
}

/**
 * Retrieve the full effect timeline ordered by round → turn → id.
 * Optionally restricted to the last N events for performance.
 */
function getCombatTimeline(db, limit = 200) {
    return db.prepare(`
        SELECT * FROM effect_events
        ORDER BY session_round ASC, turn_index ASC, id ASC
        LIMIT ?
    `).all(limit);
}

/**
 * Clear all effect events (called at start of new combat or by DM).
 */
function clearTimeline(db) {
    db.prepare('DELETE FROM effect_events').run();
}

/**
 * Write a concentration check/broken event to the timeline.
 */
function writeConcentrationCheckEvent(db, characterId, characterName, spellName, roll, modifier, total, dc, passed, sessionRound, turnIndex) {
    return writeEventRecord(db, {
        sessionRound, turnIndex, phase: 'reaction',
        eventType: passed ? 'concentration_check' : 'concentration_broken',
        actor: 'System',
        target: { id: characterId, type: 'character', name: characterName },
        payloadJson: JSON.stringify({ spellName, roll, modifier, total, dc, passed }),
        parentEventId: null,
        sourcePresetId: null,
    });
}

/**
 * Retrieve the effect timeline with optional filters.
 */
function getFilteredTimeline(db, { limit = 200, round, eventType, targetId } = {}) {
    let where = [];
    let params = [];
    if (round !== undefined) { where.push('session_round = ?'); params.push(round); }
    if (eventType) { where.push('event_type = ?'); params.push(eventType); }
    if (targetId !== undefined) { where.push('target_id = ?'); params.push(targetId); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return db.prepare(`
        SELECT * FROM effect_events ${whereClause}
        ORDER BY session_round ASC, turn_index ASC, id ASC
        LIMIT ?
    `).all(...params, limit);
}

module.exports = {
    applyPartyEffect,
    processTurnTriggers,
    processAurasForTurn,
    getCombatTimeline,
    getFilteredTimeline,
    clearTimeline,
    resolveTargets,
    writeConcentrationCheckEvent,
};
