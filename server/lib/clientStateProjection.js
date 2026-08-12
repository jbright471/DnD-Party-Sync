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

      if (role === 'cast') {
        const isMonster = entity.entity_type !== 'pc';
        return {
          id: entity.id,
          character_id: entity.character_id ?? null,
          entity_name: entity.entity_name,
          entity_type: entity.entity_type,
          initiative: entity.initiative ?? null,
          current_hp: isMonster ? null : (entity.current_hp ?? null),
          max_hp: isMonster ? null : (entity.max_hp ?? null),
          ac: isMonster ? null : (entity.ac ?? null),
          hp_status: entity.hp_status ?? null,
          is_active: entity.is_active ?? 0,
        };
      }

      const hideMonsterDetails = entity.entity_type !== 'pc' && !canViewExactMonsterHp;
      return {
        id: entity.id,
        character_id: entity.character_id ?? null,
        entity_name: entity.entity_name,
        entity_type: entity.entity_type,
        initiative: entity.initiative ?? null,
        current_hp: hideMonsterDetails ? null : (entity.current_hp ?? null),
        max_hp: hideMonsterDetails ? null : (entity.max_hp ?? null),
        ac: hideMonsterDetails ? null : (entity.ac ?? null),
        hp_status: entity.hp_status ?? null,
        is_active: entity.is_active ?? 0,
        sort_order: entity.sort_order ?? null,
        instance_id: entity.instance_id ?? null,
        conditions: Array.isArray(entity.conditions) ? entity.conditions : [],
        concentrating_on: entity.concentrating_on ?? null,
      };
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

function projectMapState(map, { role = 'public' } = {}) {
  if (map == null || role === 'dm') return map;
  if (role !== 'player') return undefined;

  const tokens = Array.isArray(map.tokens) ? map.tokens : [];
  const markers = Array.isArray(map.markers) ? map.markers : [];
  return {
    id: map.id,
    name: map.name,
    grid_size: map.grid_size,
    map_url: map.map_url ?? null,
    image_data: map.image_data ?? null,
    tokens: tokens
      .filter(token => token.is_hidden !== 1)
      .map(token => ({
        id: token.id,
        map_id: token.map_id,
        entity_id: token.entity_id,
        entity_name: token.entity_name,
        entity_type: token.entity_type,
        x: token.x,
        y: token.y,
      })),
    markers: markers
      .filter(marker => marker.is_hidden !== 1 && marker.is_discovered === 1)
      .map(marker => ({
        id: marker.id,
        parent_map_id: marker.parent_map_id,
        linked_map_id: marker.linked_map_id ?? null,
        name: marker.name,
        type: marker.type,
        x: marker.x,
        y: marker.y,
        description: marker.description,
      })),
  };
}

function canSocketReceiveEvent(socket, eventName) {
  return !socket.castView || CAST_ALLOWED_EVENTS.has(eventName);
}

module.exports = {
  projectPartyState,
  projectInitiativeState,
  projectMapState,
  projectTimeline,
  canSocketReceiveEvent,
};
