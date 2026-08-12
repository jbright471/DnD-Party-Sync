'use strict';

const CAST_ALLOWED_EVENTS = new Set(['register_cast_view', 'request_cast_state']);

function normalizeId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function projectPartySummary(character) {
  return {
    id: character.id,
    name: character.name,
    class: character.class,
    level: character.level,
    currentHp: character.currentHp ?? character.current_hp ?? 0,
    maxHp: character.maxHp ?? character.max_hp ?? 1,
    tempHp: character.tempHp ?? character.temp_hp ?? 0,
    ac: character.ac ?? character.baseAc ?? 10,
    speed: character.speed ?? 30,
    conditions: character.conditions ?? character.activeConditions ?? [],
    concentratingOn: character.concentratingOn ?? null,
  };
}

function projectPartyState(characters, { role = 'public', characterId = null } = {}) {
  if (role === 'dm') return characters;

  const ownedCharacterId = role === 'player' ? normalizeId(characterId) : null;
  return characters.map(character => (
    ownedCharacterId !== null && normalizeId(character.id) === ownedCharacterId
      ? character
      : projectPartySummary(character)
  ));
}

function projectInitiativeState(tracker, { role = 'public', permissions = {} } = {}) {
  const isDm = role === 'dm';
  const canViewExactMonsterHp = role === 'player' && permissions.view_monster_hp === 'open';

  return tracker
    .filter(entity => isDm || entity.is_hidden !== 1)
    .map(entity => {
      if (isDm) return entity;

      const projected = { ...entity };
      delete projected.stats_json;
      delete projected.buffs;
      delete projected.buffs_json;
      delete projected.boss_phases;
      delete projected.boss_phases_json;
      delete projected.conditions_json;

      if (entity.entity_type !== 'pc' && !canViewExactMonsterHp) {
        projected.current_hp = null;
        projected.max_hp = null;
        projected.ac = null;
      }

      return projected;
    });
}

function projectTimeline(events, { role = 'public', characterId = null } = {}) {
  if (role === 'dm') return events;
  if (role !== 'player') return [];

  const normalizedCharacterId = normalizeId(characterId);
  if (normalizedCharacterId === null) return [];

  return events.filter(event => (
    (event.target_type === 'character' && normalizeId(event.target_id) === normalizedCharacterId)
    || event.target_type === 'system'
    || event.event_type === 'automation_trigger'
  ));
}

function canSocketReceiveEvent(socket, eventName) {
  return !socket.castView || CAST_ALLOWED_EVENTS.has(eventName);
}

module.exports = {
  projectPartyState,
  projectInitiativeState,
  projectTimeline,
  canSocketReceiveEvent,
};
