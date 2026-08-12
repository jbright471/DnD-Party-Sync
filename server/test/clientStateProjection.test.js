'use strict';

import { describe, expect, it } from 'vitest';
import {
  projectInitiativeState,
  projectMapState,
  projectPartyState,
  projectTimeline,
  canSocketReceiveEvent,
} from '../lib/clientStateProjection.js';

describe('client state projections', () => {
  const tracker = [
    { id: 1, entity_type: 'pc', entity_name: 'Aria', current_hp: 20, max_hp: 30, ac: 15, is_hidden: 0 },
    { id: 2, entity_type: 'monster', entity_name: 'Wyrm', current_hp: 90, max_hp: 120, ac: 18, hp_status: 'Healthy', is_hidden: 0, stats_json: { str: 22 }, buffs_json: '[{"name":"Secret Ward"}]', boss_phases_json: '[{"name":"Hidden Phase"}]' },
    { id: 3, entity_type: 'monster', entity_name: 'Hidden Stalker', current_hp: 40, max_hp: 40, ac: 14, hp_status: 'Healthy', is_hidden: 1 },
  ];

  it('keeps hidden monsters out of every non-DM initiative view', () => {
    const result = projectInitiativeState(tracker, { role: 'cast' });
    expect(result.map(entry => entry.entity_name)).toEqual(['Aria', 'Wyrm']);
  });

  it('redacts exact monster values for cast views while retaining health status', () => {
    const result = projectInitiativeState(tracker, { role: 'cast' });
    const monster = result.find(entry => entry.entity_type === 'monster');
    expect(monster).toMatchObject({ current_hp: null, max_hp: null, ac: null, hp_status: 'Healthy' });
    expect(monster).not.toHaveProperty('stats_json');
    expect(monster).not.toHaveProperty('boss_phases_json');
    expect(monster).not.toHaveProperty('buffs_json');
  });

  it('uses a deliberate cast initiative DTO allowlist instead of copying source fields', () => {
    const result = projectInitiativeState([{
      id: 4,
      entity_type: 'monster',
      entity_name: 'Sentinel Drake',
      initiative: 18,
      hp_status: 'Bloodied',
      current_hp: 1,
      max_hp: 999,
      ac: 30,
      is_hidden: 0,
      notes: 'PRIVATE_NOTES_SENTINEL',
      permissions: 'PRIVATE_PERMISSIONS_SENTINEL',
      pending_save: 'PRIVATE_SAVE_SENTINEL',
      loot: 'PRIVATE_LOOT_SENTINEL',
    }], { role: 'cast' });

    expect(result[0]).toEqual({
      id: 4,
      character_id: null,
      entity_type: 'monster',
      entity_name: 'Sentinel Drake',
      initiative: 18,
      hp_status: 'Bloodied',
      current_hp: null,
      max_hp: null,
      ac: null,
      is_active: 0,
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_/);
  });

  it('honors the player monster HP permission', () => {
    const redacted = projectInitiativeState(tracker, { role: 'player', permissions: { view_monster_hp: 'dm_only' } });
    const open = projectInitiativeState(tracker, { role: 'player', permissions: { view_monster_hp: 'open' } });
    expect(redacted[1].current_hp).toBeNull();
    expect(open[1].current_hp).toBe(90);
  });

  it('uses an allowlist for player initiative summaries and omits DM internals', () => {
    const result = projectInitiativeState([{
      ...tracker[1],
      notes: 'DM_NOTES_SENTINEL',
      permissions: 'DM_PERMISSIONS_SENTINEL',
      pending_save: 'DM_PENDING_SAVE_SENTINEL',
      loot_admin: 'DM_LOOT_SENTINEL',
    }], { role: 'player', permissions: { view_monster_hp: 'dm_only' } });

    expect(result[0]).toEqual({
      id: 2,
      character_id: null,
      entity_name: 'Wyrm',
      entity_type: 'monster',
      initiative: null,
      current_hp: null,
      max_hp: null,
      ac: null,
      hp_status: 'Healthy',
      is_active: 0,
      sort_order: null,
      instance_id: null,
      conditions: [],
      concentrating_on: null,
    });
    expect(JSON.stringify(result)).not.toMatch(/DM_/);
  });

  it('reduces cast party payloads to display-safe fields', () => {
    const result = projectPartyState([{ id: 1, name: 'Aria', currentHp: 20, maxHp: 30, inventory: [{ name: 'Secret Key' }], backstory: 'Hidden' }], { role: 'cast' });
    expect(result[0]).toMatchObject({ id: 1, name: 'Aria', currentHp: 20, maxHp: 30 });
    expect(result[0]).not.toHaveProperty('inventory');
    expect(result[0]).not.toHaveProperty('backstory');
  });

  it('gives players their own full sheet and party-safe summaries for everyone else', () => {
    const characters = [
      { id: 1, name: 'Aria', currentHp: 20, maxHp: 30, inventory: [{ name: 'Owned Key' }] },
      { id: 2, name: 'Borin', currentHp: 25, maxHp: 25, inventory: [{ name: 'Private Letter' }] },
    ];
    const result = projectPartyState(characters, { role: 'player', characterId: 1 });
    expect(result[0].inventory).toEqual([{ name: 'Owned Key' }]);
    expect(result[1]).toMatchObject({ name: 'Borin', currentHp: 25, maxHp: 25 });
    expect(result[1]).not.toHaveProperty('inventory');
  });

  it('limits player timelines to owned and party-wide events', () => {
    const events = [
      { id: 1, target_type: 'character', target_id: 10, event_type: 'damage' },
      { id: 2, target_type: 'character', target_id: 11, event_type: 'heal' },
      { id: 3, target_type: 'system', target_id: null, event_type: 'round_started' },
    ];
    expect(projectTimeline(events, { role: 'player', characterId: 10 }).map(event => event.id)).toEqual([1, 3]);
    expect(projectTimeline(events, { role: 'cast' })).toEqual([]);
  });

  it('projects player maps without hidden tokens, undiscovered markers, or map internals', () => {
    const result = projectMapState({
      id: 7,
      name: 'Ruins',
      grid_size: 50,
      image_data: '/api/maps/file/ruins.webp',
      image_path: 'C:/DM_MAP_PATH_SENTINEL',
      group_id: 'DM_GROUP_SENTINEL',
      tokens: [
        { id: 1, map_id: 7, entity_id: 'aria', entity_name: 'Aria', entity_type: 'pc', x: 2, y: 3, is_hidden: 0 },
        { id: 2, map_id: 7, entity_id: 'stalker', entity_name: 'HIDDEN_TOKEN_SENTINEL', entity_type: 'monster', x: 4, y: 5, is_hidden: 1 },
      ],
      markers: [
        { id: 3, parent_map_id: 7, linked_map_id: null, name: 'Gate', type: 'location', x: 6, y: 7, description: 'Open', is_discovered: 1, is_hidden: 0 },
        { id: 4, parent_map_id: 7, name: 'HIDDEN_MARKER_SENTINEL', is_discovered: 1, is_hidden: 1 },
        { id: 5, parent_map_id: 7, name: 'UNDISCOVERED_MARKER_SENTINEL', is_discovered: 0, is_hidden: 0 },
      ],
    }, { role: 'player', characterId: 1 });

    expect(result).toEqual({
      id: 7,
      name: 'Ruins',
      grid_size: 50,
      map_url: null,
      image_data: '/api/maps/file/ruins.webp',
      tokens: [{ id: 1, map_id: 7, entity_id: 'aria', entity_name: 'Aria', entity_type: 'pc', x: 2, y: 3 }],
      markers: [{ id: 3, parent_map_id: 7, linked_map_id: null, name: 'Gate', type: 'location', x: 6, y: 7, description: 'Open' }],
    });
    expect(JSON.stringify(result)).not.toMatch(/DM_|HIDDEN_|UNDISCOVERED_/);
  });

  it('allows cast sockets to request state but rejects mutation events', () => {
    const castSocket = { castView: true };
    expect(canSocketReceiveEvent(castSocket, 'request_cast_state')).toBe(true);
    expect(canSocketReceiveEvent(castSocket, 'set_initiative')).toBe(false);
    expect(canSocketReceiveEvent({ castView: false }, 'set_initiative')).toBe(true);
  });
});
