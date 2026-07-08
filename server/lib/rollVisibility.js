'use strict';

const ROLL_VISIBILITIES = new Set(['public', 'private', 'secret', 'super_secret']);
const ROLLABLE_SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);

function normalizeRollVisibility(payload = {}) {
  const raw = payload.rollVisibility || payload.visibility;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase().replace(/-/g, '_');
    if (ROLL_VISIBILITIES.has(normalized)) return normalized;
  }
  return payload.isPrivate ? 'private' : 'public';
}

function isPublicRoll(visibility) {
  return normalizeRollVisibility({ rollVisibility: visibility }) === 'public';
}

function buildSecretRollAcknowledgement(event, visibility) {
  if (visibility === 'super_secret') return null;
  if (visibility !== 'secret') return null;

  return {
    id: event.id,
    actor: event.actor,
    characterId: event.characterId ?? null,
    label: event.label || event.rollType || 'Roll',
    rollType: event.rollType || 'Roll',
    rollVisibility: visibility,
    masked: true,
    message: 'Fate sealed',
    timestamp: event.timestamp,
  };
}

function buildRollRouting(event, visibilityInput) {
  const rollVisibility = normalizeRollVisibility({ rollVisibility: visibilityInput });
  const dmEvent = {
    ...event,
    rollVisibility,
    isPrivate: rollVisibility !== 'public',
  };

  return {
    dmEvent,
    publicEvent: rollVisibility === 'public' ? { ...dmEvent, isPrivate: false } : null,
    rollerEvent: buildSecretRollAcknowledgement(dmEvent, rollVisibility),
  };
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function rollServerDice(spec = {}) {
  const { sides, count = 1, modifier = 0, rollMode: rawRollMode = 'straight' } = spec;
  const safeSides = toPositiveInt(sides, 20);
  const dieSides = ROLLABLE_SIDES.has(safeSides) ? safeSides : 20;
  const safeModifier = Number.parseInt(modifier, 10) || 0;
  const rollMode = typeof rawRollMode === 'string'
    ? rawRollMode.trim().toLowerCase()
    : 'straight';

  if (dieSides === 20 && (rollMode === 'advantage' || rollMode === 'disadvantage')) {
    const rolls = [
      Math.floor(Math.random() * dieSides) + 1,
      Math.floor(Math.random() * dieSides) + 1,
    ];
    const keptRoll = rollMode === 'advantage' ? Math.max(...rolls) : Math.min(...rolls);
    return {
      sides: dieSides,
      count: 2,
      modifier: safeModifier,
      rolls,
      keptRoll,
      rollMode,
      total: keptRoll + safeModifier,
    };
  }

  const safeCount = Math.min(Math.max(toPositiveInt(count, 1), 1), 20);
  const rolls = Array.from({ length: safeCount }, () => Math.floor(Math.random() * dieSides) + 1);
  const total = rolls.reduce((sum, roll) => sum + roll, 0) + safeModifier;

  return {
    sides: dieSides,
    count: safeCount,
    modifier: safeModifier,
    rolls,
    total,
  };
}

module.exports = {
  normalizeRollVisibility,
  isPublicRoll,
  buildRollRouting,
  rollServerDice,
};
