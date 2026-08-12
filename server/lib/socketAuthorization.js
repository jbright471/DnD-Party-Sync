'use strict';

const { checkPermission } = require('./permissions');

const EVENT_CLASSES = Object.freeze({
  BOOTSTRAP: 'bootstrap',
  CAST_READ: 'cast-read',
  PLAYER_SELF: 'player-self',
  PLAYER_COLLABORATION: 'player-collaboration',
  DM_ONLY: 'dm-only',
  TRANSPORT_LIFECYCLE: 'transport-lifecycle',
});

const BOOTSTRAP_EVENTS = [
  'dm_join_room',
  'register_cast_view',
  'register_player',
];

const CAST_READ_EVENTS = [
  'request_cast_state',
];

const PLAYER_SELF_EVENTS = [
  'request_party_state',
  'update_hp',
  'set_temp_hp',
  'cast_spell',
  'cast_concentration_spell',
  'drop_concentration',
  'concentration_check_result',
  'apply_condition',
  'remove_condition',
  'apply_buff',
  'remove_buff',
  'toggle_feature',
  'use_spell_slot',
  'spend_hit_die',
  'short_rest',
  'long_rest',
  'update_character',
  'dice_roll',
  'server_dice_roll',
  'blind_roll_response',
  'claim_loot',
  'loot_vote_cast',
];

const PLAYER_COLLABORATION_EVENTS = [
  'voice_join',
  'voice_leave',
  'voice_offer',
  'voice_answer',
  'voice_ice_candidate',
  'voice_speaking',
  'request_effect',
];

const DM_ONLY_EVENTS = [
  'relay_dm_note',
  'save_aura',
  'toggle_aura',
  'update_aura_targets',
  'delete_aura',
  'save_smart_pin',
  'delete_smart_pin',
  'save_pins_to_template',
  'log_action',
  'toggle_approval_mode',
  'resolve_pending_action',
  'resolve_pending_import',
  'apply_effect_preset',
  'advance_time',
  'dm_request_save',
  'spawn_monster',
  'configure_boss_phases',
  'transition_boss_phase',
  'toggle_entity_visibility',
  'play_sound',
  'activate_map',
  'move_token',
  'sync_map_tokens',
  'start_encounter',
  'next_turn',
  'prev_turn',
  'set_initiative',
  'reorder_initiative',
  'auto_roll_initiative',
  'dismiss_dead',
  'clear_all_conditions',
  'add_marker',
  'update_marker',
  'delete_marker',
  'refresh_world_map',
  'update_initiative_hp',
  'end_encounter',
  'resolve_pending_effect',
  'apply_party_effect',
  'trigger_automation',
  'clear_effect_timeline',
  'update_note',
  'create_note',
  'delete_note',
  'refresh_quests_global',
  'dm_whisper',
  'blind_roll_request',
  'end_session',
  'refresh_party',
  'refresh_party_loot',
  'drop_loot',
  'remove_loot',
  'loot_vote_open',
  'loot_vote_cancel',
  'loot_vote_force_resolve',
  'delete_character',
  'update_permissions',
  'refresh_permissions',
  'reverse_event',
  'reverse_group',
  'apply_aoe_effect',
];

function classify(events, classification) {
  return events.map(event => [event, classification]);
}

const EVENT_CLASSIFICATIONS = Object.freeze(Object.fromEntries([
  ...classify(BOOTSTRAP_EVENTS, EVENT_CLASSES.BOOTSTRAP),
  ...classify(CAST_READ_EVENTS, EVENT_CLASSES.CAST_READ),
  ...classify(PLAYER_SELF_EVENTS, EVENT_CLASSES.PLAYER_SELF),
  ...classify(PLAYER_COLLABORATION_EVENTS, EVENT_CLASSES.PLAYER_COLLABORATION),
  ...classify(DM_ONLY_EVENTS, EVENT_CLASSES.DM_ONLY),
  ['disconnect', EVENT_CLASSES.TRANSPORT_LIFECYCLE],
]));

const CHARACTER_ID_EVENTS = new Set([
  'update_hp',
  'set_temp_hp',
  'cast_spell',
  'cast_concentration_spell',
  'drop_concentration',
  'concentration_check_result',
  'apply_condition',
  'remove_condition',
  'remove_buff',
  'toggle_feature',
  'use_spell_slot',
  'spend_hit_die',
  'short_rest',
  'long_rest',
  'update_character',
  'blind_roll_response',
  'claim_loot',
  'loot_vote_cast',
  'voice_join',
]);

const DENIED_ERROR = Object.freeze({
  code: 'SOCKET_EVENT_FORBIDDEN',
  message: 'Not authorized for this event.',
});

const SCOPE_ERROR = Object.freeze({
  code: 'SOCKET_CHARACTER_SCOPE_MISMATCH',
  message: 'Not authorized for this character.',
});

const CROSS_CHARACTER_PERMISSIONS = Object.freeze({
  update_hp: 'cross_player_effects',
  claim_loot: 'loot_claim',
});

function createPermissionTargetAuthorizer(db) {
  return function authorizePlayerTarget({ event, actorCharacterId, targetCharacterId }) {
    const permission = CROSS_CHARACTER_PERMISSIONS[event];
    if (!permission) return false;
    return checkPermission(
      db,
      permission,
      false,
      actorCharacterId,
      targetCharacterId,
    ).allowed;
  };
}

function getSocketRole(socket) {
  if (socket.dmAuthenticated === true) return 'dm';
  if (socket.accessGrant?.role === 'player' && socket.accessGrant.characterId != null) return 'player';
  if (socket.accessGrant?.role === 'cast') return 'cast';
  return 'unauthenticated';
}

function isBootstrapAllowed(event, role) {
  if (event === 'dm_join_room') return role === 'unauthenticated' || role === 'dm';
  if (event === 'register_cast_view') return role === 'cast';
  if (event === 'register_player') return role === 'player';
  return false;
}

function canInvoke(classification, event, role) {
  if (!classification || classification === EVENT_CLASSES.TRANSPORT_LIFECYCLE) return false;
  if (classification === EVENT_CLASSES.BOOTSTRAP) return isBootstrapAllowed(event, role);
  if (role === 'dm') return true;
  if (classification === EVENT_CLASSES.CAST_READ) return role === 'cast';
  if (classification === EVENT_CLASSES.PLAYER_SELF
      || classification === EVENT_CLASSES.PLAYER_COLLABORATION) {
    return role === 'player';
  }
  return false;
}

function normalizeCharacterId(value) {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
}

function collectCharacterIds(value, collected = new Set(), seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return collected;
  seen.add(value);

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === 'characterId' || key === 'sourceCharacterId') {
      if (nestedValue != null) collected.add(normalizeCharacterId(nestedValue));
    } else if (key === 'characterIds') {
      if (!Array.isArray(nestedValue)) collected.add(null);
      else nestedValue.forEach(id => collected.add(normalizeCharacterId(id)));
    } else {
      collectCharacterIds(nestedValue, collected, seen);
    }
  }
  return collected;
}

function bindPlayerPayload(
  event,
  payload,
  socket,
  resolveCharacterIdentity,
  authorizePlayerTarget,
) {
  const boundCharacterId = normalizeCharacterId(socket.accessGrant?.characterId);
  if (boundCharacterId === null) return false;

  const referencedCharacterIds = collectCharacterIds(payload);
  for (const targetCharacterId of referencedCharacterIds) {
    if (targetCharacterId === null) return false;
    if (targetCharacterId !== boundCharacterId && !authorizePlayerTarget({
      event,
      actorCharacterId: boundCharacterId,
      targetCharacterId,
    })) return false;
  }

  if (CHARACTER_ID_EVENTS.has(event) && payload.characterId == null) {
    payload.characterId = boundCharacterId;
  }
  if (event === 'apply_buff') payload.characterIds = [boundCharacterId];

  const identity = resolveCharacterIdentity(boundCharacterId) || {};
  const characterName = typeof identity.name === 'string' && identity.name.trim()
    ? identity.name
    : `Character ${boundCharacterId}`;
  payload.actor = characterName;
  if ('characterName' in payload || ['dice_roll', 'server_dice_roll', 'claim_loot', 'loot_vote_cast'].includes(event)) {
    const targetCharacterId = normalizeCharacterId(payload.characterId);
    const targetIdentity = targetCharacterId === null
      ? identity
      : (resolveCharacterIdentity(targetCharacterId) || {});
    payload.characterName = typeof targetIdentity.name === 'string' && targetIdentity.name.trim()
      ? targetIdentity.name
      : characterName;
  }
  if ('playerName' in payload || event === 'voice_join') payload.playerName = characterName;
  return true;
}

function createSocketAuthorizationMiddleware(socket, {
  resolveCharacterIdentity = () => null,
  authorizePlayerTarget = () => false,
  emitToSocket = () => false,
} = {}) {
  return function authorizeSocketPacket(packet, next) {
    const [event] = packet;
    const classification = EVENT_CLASSIFICATIONS[event];
    const role = getSocketRole(socket);

    if (!canInvoke(classification, event, role)) {
      emitToSocket('authorization_error', { ...DENIED_ERROR });
      return next(new Error(DENIED_ERROR.message));
    }

    if (role === 'player'
        && (event === 'register_player'
          || classification === EVENT_CLASSES.PLAYER_SELF
          || classification === EVENT_CLASSES.PLAYER_COLLABORATION)) {
      const payload = packet[1];
      if (payload == null) packet[1] = {};
      if (typeof packet[1] !== 'object'
          || !bindPlayerPayload(
            event,
            packet[1],
            socket,
            resolveCharacterIdentity,
            authorizePlayerTarget,
          )) {
        emitToSocket('authorization_error', { ...SCOPE_ERROR });
        return next(new Error(SCOPE_ERROR.message));
      }
    }

    return next();
  };
}

module.exports = {
  DENIED_ERROR,
  EVENT_CLASSES,
  EVENT_CLASSIFICATIONS,
  SCOPE_ERROR,
  createPermissionTargetAuthorizer,
  createSocketAuthorizationMiddleware,
  getSocketRole,
};
