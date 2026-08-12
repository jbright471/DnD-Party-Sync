'use strict';

const HP_MODES = new Set(['reset', 'retain', 'proportional']);

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBossPhases(phases, fallback = {}) {
  if (!Array.isArray(phases)) return [];
  return phases.map((phase, index) => ({
    name: String(phase?.name || `Phase ${index + 1}`).trim(),
    maxHp: positiveNumber(phase?.maxHp ?? phase?.hp, positiveNumber(fallback.maxHp, 1)),
    ac: positiveNumber(phase?.ac, positiveNumber(fallback.ac, 10)),
    hpMode: HP_MODES.has(phase?.hpMode) ? phase.hpMode : 'reset',
    clearConditions: phase?.clearConditions === true,
    clearBuffs: phase?.clearBuffs === true,
    stats: phase?.stats && typeof phase.stats === 'object' ? phase.stats : null,
  }));
}

function parseBossPhases(value) {
  try {
    return JSON.parse(value || '[]');
  } catch {
    return [];
  }
}

function configureBossPhases(db, trackerId, phases) {
  const entity = db.prepare('SELECT * FROM initiative_tracker WHERE id = ?').get(trackerId);
  if (!entity || entity.entity_type === 'pc') return { success: false, error: 'Monster not found' };

  const normalized = normalizeBossPhases(phases, { maxHp: entity.max_hp, ac: entity.ac });
  if (normalized.length < 2) return { success: false, error: 'A boss needs at least two phases' };

  const currentPhaseIndex = Math.min(Math.max(entity.current_phase_index || 0, 0), normalized.length - 1);
  db.prepare(`
    UPDATE initiative_tracker
    SET boss_phases_json = ?, current_phase_index = ?, phase_name = ?
    WHERE id = ?
  `).run(JSON.stringify(normalized), currentPhaseIndex, normalized[currentPhaseIndex].name, trackerId);

  return { success: true, phases: normalized, currentPhaseIndex };
}

function transitionBossPhase(db, trackerId, requestedPhaseIndex = null) {
  return db.transaction(() => {
    const entity = db.prepare('SELECT * FROM initiative_tracker WHERE id = ?').get(trackerId);
    if (!entity || entity.entity_type === 'pc') return { success: false, error: 'Monster not found' };

    const phases = normalizeBossPhases(parseBossPhases(entity.boss_phases_json), {
      maxHp: entity.max_hp,
      ac: entity.ac,
    });
    if (phases.length < 2) return { success: false, error: 'No boss phases configured' };

    const currentPhaseIndex = Math.min(Math.max(entity.current_phase_index || 0, 0), phases.length - 1);
    const nextPhaseIndex = requestedPhaseIndex === null
      ? currentPhaseIndex + 1
      : Number.parseInt(requestedPhaseIndex, 10);
    if (!Number.isInteger(nextPhaseIndex) || nextPhaseIndex < 0 || nextPhaseIndex >= phases.length) {
      return { success: false, error: 'That boss phase is unavailable' };
    }
    if (nextPhaseIndex === currentPhaseIndex) {
      return { success: true, unchanged: true, currentPhaseIndex, phase: phases[currentPhaseIndex] };
    }

    const phase = phases[nextPhaseIndex];
    const oldMaxHp = Math.max(entity.max_hp, 1);
    let nextHp = phase.maxHp;
    if (phase.hpMode === 'retain') nextHp = Math.min(entity.current_hp, phase.maxHp);
    if (phase.hpMode === 'proportional') {
      nextHp = Math.max(0, Math.round((entity.current_hp / oldMaxHp) * phase.maxHp));
    }

    const conditionsJson = phase.clearConditions ? '[]' : (entity.conditions_json || '[]');
    const buffsJson = phase.clearBuffs ? '[]' : (entity.buffs_json || '[]');
    const statsJson = phase.stats ? JSON.stringify(phase.stats) : entity.stats_json;

    db.prepare(`
      UPDATE initiative_tracker
      SET current_hp = ?, max_hp = ?, ac = ?, stats_json = ?,
          conditions_json = ?, buffs_json = ?, current_phase_index = ?, phase_name = ?
      WHERE id = ?
    `).run(
      nextHp,
      phase.maxHp,
      phase.ac,
      statsJson,
      conditionsJson,
      buffsJson,
      nextPhaseIndex,
      phase.name,
      trackerId,
    );

    return {
      success: true,
      previousPhaseIndex: currentPhaseIndex,
      currentPhaseIndex: nextPhaseIndex,
      phase,
      previousHp: entity.current_hp,
      currentHp: nextHp,
    };
  }).immediate();
}

module.exports = { normalizeBossPhases, configureBossPhases, transitionBossPhase };
