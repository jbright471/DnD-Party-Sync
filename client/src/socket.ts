import { io, Socket } from 'socket.io-client';
import { AUTOMATION_SCHEMA_VERSION, CommandEnvelope, StateDelta } from './types/automation-contracts';
import { generateRequestId } from './lib/requestId';

// Browser builds use the same origin and rely on the host to proxy /socket.io.
// Direct/mobile builds may set VITE_SERVER_URL, but REST /api traffic still needs a reachable proxy.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const socket: Socket = io(SERVER_URL, {
  // On mobile the connection is cross-origin; withCredentials not needed for this app
  transports: SERVER_URL ? ['websocket'] : ['websocket', 'polling'],
});

const TRANSACTIONAL_SOCKET_EVENTS = new Set([
  'apply_effect_preset',
  'log_action',
  'end_encounter', 'end_session',
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
  'update_permissions', 'reverse_event', 'reverse_group', 'blind_roll_response',
]);

const nativeEmit = socket.emit.bind(socket);
socket.emit = ((eventName: string, ...args: any[]) => {
  if (TRANSACTIONAL_SOCKET_EVENTS.has(eventName)) {
    const first = args[0];
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      args[0] = { ...first, commandId: first.commandId || first.requestId || generateRequestId() };
    } else {
      args.unshift({ commandId: generateRequestId() });
    }
  }
  return nativeEmit(eventName, ...args);
}) as typeof socket.emit;

let campaignVersion = 0;
const aggregateVersions: Record<string, number> = {};

function absorbVersion(value: Partial<StateDelta> | undefined) {
  if (!value) return;
  if (Number.isInteger(value.campaignVersion) && Number(value.campaignVersion) >= campaignVersion) {
    campaignVersion = Number(value.campaignVersion);
  }
  for (const [key, version] of Object.entries(value.aggregateVersions || {})) {
    if (Number.isInteger(version)) aggregateVersions[key] = Math.max(aggregateVersions[key] || 0, version);
  }
}

socket.on('connect', () => {
  console.log('[Socket] Connected to server:', socket.id);
  socket.emit('negotiate_automation_contract', { supportedVersions: [AUTOMATION_SCHEMA_VERSION] });
  socket.emit('request_state_deltas', { afterVersion: campaignVersion }, (result: any) => {
    absorbVersion(result);
    if (result?.resyncRequired) {
      campaignVersion = Number(result.campaignVersion) || 0;
      return;
    }
    for (const delta of result?.deltas || []) absorbVersion(delta);
    campaignVersion = Math.max(campaignVersion, Number(result?.campaignVersion) || 0);
  });
});

socket.on('state_delta', absorbVersion);
socket.on('command_result', absorbVersion);
socket.on('state_delta_batch', (result: any) => {
  absorbVersion(result);
  for (const delta of result?.deltas || []) absorbVersion(delta);
  campaignVersion = Math.max(campaignVersion, Number(result?.campaignVersion) || 0);
});

socket.on('disconnect', () => {
  console.log('[Socket] Disconnected');
});

export default socket;

export function createCommandEnvelope<TPayload>(
  commandType: string,
  payload: TPayload,
  affectedAggregateKeys: string[],
  actor: CommandEnvelope<TPayload>['actor'] = { type: 'integration', id: null },
): CommandEnvelope<TPayload> {
  return {
    commandId: generateRequestId(),
    commandType,
    schemaVersion: AUTOMATION_SCHEMA_VERSION,
    expectedCampaignVersion: campaignVersion,
    expectedAggregateVersions: Object.fromEntries(
      affectedAggregateKeys.map(key => [key, aggregateVersions[key] || 0]),
    ),
    actor,
    payload,
  };
}
