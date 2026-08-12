'use strict';

const { getSocketRole } = require('./socketAuthorization');

const AUDIENCES = Object.freeze({
  AUTH_RESULT: 'auth-result',
  CAST_CONTRACT: 'cast-contract',
  PLAYER_AND_DM: 'player-and-dm',
  VOICE_ROOM: 'voice-room',
  DM_ONLY: 'dm-only',
});

const AUTH_RESULT_EVENTS = [
  'access_denied',
  'authorization_error',
];

const CAST_CONTRACT_EVENTS = [
  'party_state',
  'initiative_state',
  'combat_state_sync',
];

const PLAYER_AND_DM_EVENTS = [
  'timeline_update',
  'party_loot_state',
  'world_state',
  'world_map_state',
  'map_state',
  'loot_vote_result',
  'concentration_broken',
  'concentration_maintained',
  'concentration_check_required',
  'hp_change_event',
  'rules_error',
  'hit_die_result',
  'advance_time',
  'save_resolved',
  'roll_feed_event',
  'secret_roll_ack',
  'pending_save_request',
  'sound_event',
  'tick_conditions',
  'refresh_quests',
  'whisper_received',
  'whisper_sent',
  'blind_roll_requested',
  'loot_vote_opened',
];

const VOICE_ROOM_EVENTS = [
  'voice_existing_peers',
  'voice_peer_joined',
  'voice_room_state',
  'voice_peer_left',
  'voice_offer',
  'voice_answer',
  'voice_ice_candidate',
  'voice_peer_speaking',
];

const DM_ONLY_EVENTS = [
  'active_auras_sync',
  'combat_smart_pins_sync',
  'recaps_updated',
  'dm_room_joined',
  'permissions_state',
  'action_logged',
  'notes_state',
  'pending_imports_sync',
  'pending_import_created',
  'approval_mode',
  'pins_saved_to_template_result',
  'dm_roll_feed',
  'boss_phases_configured',
  'boss_phase_transitioned',
  'auto_roll_result',
  'dismiss_dead_result',
  'clear_conditions_result',
  'blind_roll_result_dm',
  'aoe_effect_result',
  'incoming_effect_preview',
  'effect_preview_resolved',
  'effect_preview_expired',
  'dm_note_created',
  'dm_note_updated',
  'dm_note_deleted',
];

function classify(events, audience) {
  return events.map(event => [event, Object.freeze({ audience })]);
}

const OUTBOUND_EVENT_POLICIES = Object.freeze(Object.fromEntries([
  ...classify(AUTH_RESULT_EVENTS, AUDIENCES.AUTH_RESULT),
  ...classify(CAST_CONTRACT_EVENTS, AUDIENCES.CAST_CONTRACT),
  ...classify(PLAYER_AND_DM_EVENTS, AUDIENCES.PLAYER_AND_DM),
  ...classify(VOICE_ROOM_EVENTS, AUDIENCES.VOICE_ROOM),
  ...classify(DM_ONLY_EVENTS, AUDIENCES.DM_ONLY),
]));

function defaultRecipient(socket) {
  return {
    role: getSocketRole(socket),
    characterId: socket.accessGrant?.characterId ?? null,
  };
}

function isAudienceAllowed(audience, role, socket) {
  if (audience === AUDIENCES.AUTH_RESULT) return true;
  if (audience === AUDIENCES.CAST_CONTRACT) return ['cast', 'player', 'dm'].includes(role);
  if (audience === AUDIENCES.PLAYER_AND_DM) return role === 'player' || role === 'dm';
  if (audience === AUDIENCES.VOICE_ROOM) {
    return (role === 'player' || role === 'dm') && socket.rooms.has('voice_room');
  }
  return audience === AUDIENCES.DM_ONLY && role === 'dm';
}

function createOutboundSocketDelivery(io, {
  getRecipient = defaultRecipient,
  projectors = {},
} = {}) {
  function send(socket, event, payload) {
    const policy = OUTBOUND_EVENT_POLICIES[event];
    if (!socket || !policy) return false;

    const recipient = getRecipient(socket);
    if (!recipient || !isAudienceAllowed(policy.audience, recipient.role, socket)) return false;

    const projector = projectors[event];
    const projectedPayload = projector ? projector(payload, recipient, socket) : payload;
    if (projectedPayload === undefined) return false;
    socket.emit(event, projectedPayload);
    return true;
  }

  function eachSocket(callback) {
    for (const socket of io.sockets.sockets.values()) callback(socket);
  }

  function broadcast(event, payload) {
    let delivered = 0;
    eachSocket(socket => {
      if (send(socket, event, payload)) delivered += 1;
    });
    return delivered;
  }

  function dm(event, payload, { exceptSocketId = null } = {}) {
    let delivered = 0;
    eachSocket(socket => {
      const recipient = getRecipient(socket);
      if (socket.id !== exceptSocketId
          && recipient?.role === 'dm'
          && socket.rooms.has('dm_room')
          && send(socket, event, payload)) delivered += 1;
    });
    return delivered;
  }

  function character(characterId, event, payload) {
    const normalizedCharacterId = Number(characterId);
    let delivered = 0;
    eachSocket(socket => {
      const recipient = getRecipient(socket);
      if (recipient?.role === 'player'
          && Number(recipient.characterId) === normalizedCharacterId
          && send(socket, event, payload)) delivered += 1;
    });
    return delivered;
  }

  function socketId(targetSocketId, event, payload) {
    return send(io.sockets.sockets.get(targetSocketId), event, payload);
  }

  function except(sourceSocket, event, payload) {
    let delivered = 0;
    eachSocket(socket => {
      if (socket.id !== sourceSocket.id && send(socket, event, payload)) delivered += 1;
    });
    return delivered;
  }

  return Object.freeze({ broadcast, character, dm, except, send, socketId });
}

module.exports = {
  AUDIENCES,
  OUTBOUND_EVENT_POLICIES,
  createOutboundSocketDelivery,
};
