import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import socket from '../socket';
import { Character, Party, ActionLogEntry, SharedLootItem, SpellSlots, LootVoteState } from '../types/character';
import { EffectEvent } from '../types/effects';
import { toast } from 'sonner';

interface Note {
  id: number;
  category: string;
  title: string;
  content: string;
  updated_by: string;
  updated_at: string;
}

export interface ResourcePermissions {
  loot_claim: 'open' | 'dm_approval' | 'owner_only';
  cross_player_effects: 'open' | 'dm_approval';
  inventory_transfer: 'open' | 'dm_approval';
  view_monster_hp: 'open' | 'dm_only';
  edit_party_notes: 'open' | 'dm_only';
  condition_self_apply: 'open' | 'dm_approval';
}

interface GameState {
  characters: Character[];
  party: Party | null;
  initiativeState: any[];
  roundNumber: number;
  notes: Note[];
  actionLog: ActionLogEntry[];
  isApprovalMode: boolean;
  effectEvents: EffectEvent[];
  sharedLoot: SharedLootItem[];
  isDm: boolean;
  dmToken: string | null;
  permissions: ResourcePermissions;
  pendingImports: any[];
}

function mergeSpellSlots(maxMap: Record<string, number> | undefined, usedMap: Record<string, number> | undefined): SpellSlots {
  const slots: SpellSlots = {};
  if (!maxMap) return slots;
  for (const [lvl, max] of Object.entries(maxMap)) {
    const level = Number(lvl);
    if (level < 1 || level > 9 || !max) continue;
    slots[level] = { max: max as number, used: (usedMap?.[lvl] as number) || 0 };
  }
  return slots;
}

function normaliseCharacter(raw: any): Character {
  return {
    id: raw.id?.toString(),
    name: raw.name || 'Unknown',
    class: raw.class || 'Unknown',
    level: raw.level || 1,
    hp: {
      current: raw.currentHp ?? raw.current_hp ?? 0,
      max: raw.maxHp ?? raw.max_hp ?? 1,
      temp: raw.tempHp ?? raw.temp_hp ?? 0,
    },
    ac: raw.ac || 10,
    acBreakdown: raw.acBreakdown || [],
    abilityScores: raw.abilityScores || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    // Server stores conditions lowercase; normalise to Title Case to match DND_CONDITIONS.
    // Lowercase first so any mixed-case leakage (e.g. "PRONE") is correctly capitalised.
    conditions: (raw.conditions || []).map((c: string) => {
      const lower = (c || '').toLowerCase().trim();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }),
    // Duration keys are lowercase on the server — keep them lowercase so ConditionBadges lookup stays consistent.
    conditionDurations: Object.fromEntries(
      Object.entries(raw.conditionDurations || {}).map(([k, v]) => [k.toLowerCase().trim(), v as number])
    ),
    equipment: raw.inventory || [],
    homebrewInventory: raw.homebrewInventory || [],
    spellSlots: mergeSpellSlots(raw.spellSlotsMax, raw.spellSlotsUsed),
    spells: raw.spells || [],
    abilities: raw.features || [],
    skillProficiencies: raw.skillProficiencies || {},
    saveProficiencies: raw.saveProficiencies || {},
    proficiencyBonus: raw.proficiencyBonus ?? (Math.floor(((raw.level || 1) - 1) / 4) + 2),
    speed: raw.speed || 30,
    initiative: raw.initiativeBonus || 0,
    activeBuffs: raw.buffs || [],
    concentratingOn: raw.concentratingOn,
    attacks: raw.attacks || [],
    raw_dndbeyond_json: raw.raw_dndbeyond_json,
    hitDice: raw.hitDice || {},
    hitDiceUsed: raw.hitDiceUsed || {},
    provenance: raw.provenance,
  };
}

const GameContext = createContext<{
  state: GameState;
  socket: any;
  setDmAuth: (token: string) => void;
  clearDmAuth: () => void;
}>({
  state: {
    characters: [],
    party: null,
    initiativeState: [],
    roundNumber: 1,
    notes: [],
    actionLog: [],
    isApprovalMode: false,
    effectEvents: [],
    sharedLoot: [],
    isDm: false,
    dmToken: null,
    permissions: { loot_claim: 'open', cross_player_effects: 'open', inventory_transfer: 'open', view_monster_hp: 'open', edit_party_notes: 'open', condition_self_apply: 'open' },
    pendingImports: [],
  },
  socket: null,
  setDmAuth: () => {},
  clearDmAuth: () => {},
});

export function GameProvider({ children }: { children: ReactNode }) {
  const [party, setParty] = useState<Character[]>([]);
  const [initiativeState, setInitiativeState] = useState<any[]>([]);
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);
  const [roundNumber, setRoundNumber] = useState(1);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isApprovalMode, setIsApprovalMode] = useState(false);
  const [effectEvents, setEffectEvents] = useState<EffectEvent[]>([]);
  const [sharedLoot, setSharedLoot] = useState<SharedLootItem[]>([]);
  const [pendingImports, setPendingImports] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<ResourcePermissions>({ loot_claim: 'open', cross_player_effects: 'open', inventory_transfer: 'open', view_monster_hp: 'open', edit_party_notes: 'open', condition_self_apply: 'open' });
  const [isDm, setIsDm] = useState<boolean>(() => {
    return !!localStorage.getItem('dm_token');
  });
  const [dmToken, setDmTokenState] = useState<string | null>(() => {
    return localStorage.getItem('dm_token');
  });

  const setDmAuth = useCallback((token: string) => {
    localStorage.setItem('dm_token', token);
    setDmTokenState(token);
    setIsDm(true);
    socket.emit('dm_join_room', { dmToken: token });
  }, []);

  const clearDmAuth = useCallback(() => {
    localStorage.removeItem('dm_token');
    setDmTokenState(null);
    setIsDm(false);
  }, []);

  useEffect(() => {
    socket.on('party_state', (data: any[]) => {
      setParty(data.map(normaliseCharacter));
    });

    socket.on('initiative_state', (data: any[]) => {
      setInitiativeState(data);
    });

    socket.on('action_logged', (data: any[]) => {
      setActionLog(data);
    });

    socket.on('notes_state', (data: Note[]) => {
      setNotes(data);
    });

    socket.on('approval_mode', (mode: boolean) => {
      setIsApprovalMode(mode);
    });

    socket.on('timeline_update', (data: EffectEvent[]) => {
      setEffectEvents(data);
    });

    socket.on('party_loot_state', (data: any[]) => {
      setSharedLoot(data.map(item => ({
        ...item,
        stats: typeof item.stats_json === 'string' ? JSON.parse(item.stats_json || '{}') : (item.stats || {}),
        droppedBy: item.dropped_by || item.droppedBy || 'DM',
        createdAt: item.created_at || item.createdAt || '',
        voteState: item.vote_state_json
          ? (typeof item.vote_state_json === 'string' ? JSON.parse(item.vote_state_json) : item.vote_state_json) as LootVoteState
          : null,
      })));
    });

    socket.on('permissions_state', (data: ResourcePermissions) => {
      setPermissions(data);
    });

    socket.on('combat_state_sync', (data: { round: number; turnIndex: number }) => {
      setRoundNumber(data.round);
    });

    socket.on('pending_imports_sync', (data: any[]) => {
      setPendingImports(data);
    });

    socket.on('pending_import_created', (data: any) => {
      setPendingImports(prev => {
        const exists = prev.some(item => item.id === data.id);
        if (exists) {
          return prev.map(item => item.id === data.id ? data : item);
        }
        return [...prev, data];
      });
      const token = localStorage.getItem('dm_token');
      if (token) {
        toast.info(`New character import pending: ${data.playerName}`);
      }
    });

    // Re-join DM room on reconnect
    socket.on('connect', () => {
      const token = localStorage.getItem('dm_token');
      if (token) {
        socket.emit('dm_join_room', { dmToken: token });
      }
      socket.emit('refresh_party');
      socket.emit('refresh_party_loot');
    });

    socket.emit('refresh_party');
    socket.emit('refresh_party_loot');

    // Join DM room if token exists
    const storedToken = localStorage.getItem('dm_token');
    if (storedToken) {
      fetch('/api/effect-timeline', { headers: { 'X-DM-Token': storedToken } })
        .then(r => r.json())
        .then(setEffectEvents)
        .catch(() => {});
      socket.emit('dm_join_room', { dmToken: storedToken });
    } else {
      setEffectEvents([]);
    }

    return () => {
      socket.off('party_state');
      socket.off('initiative_state');
      socket.off('action_logged');
      socket.off('notes_state');
      socket.off('approval_mode');
      socket.off('timeline_update');
      socket.off('party_loot_state');
      socket.off('permissions_state');
      socket.off('combat_state_sync');
      socket.off('pending_imports_sync');
      socket.off('pending_import_created');
      socket.off('connect');
    };
  }, []);

  const state: GameState = {
    characters: party,
    party: {
      name: "The Party",
      code: "SYNC",
      members: party,
      actionLog: actionLog,
      combat: initiativeState.length > 0 ? {
        active: true,
        combatants: initiativeState.map(e => ({
          characterId: e.character_id?.toString(),
          name: e.entity_name,
          initiative: e.initiative,
          dexterity: 10,
        })),
        currentTurnIndex: initiativeState.findIndex(e => e.is_active),
        round: roundNumber
      } : null
    },
    initiativeState,
    roundNumber,
    notes,
    actionLog,
    isApprovalMode,
    effectEvents,
    sharedLoot,
    isDm,
    dmToken,
    permissions,
    pendingImports,
  };

  return (
    <GameContext.Provider value={{ state, socket, setDmAuth, clearDmAuth }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}
