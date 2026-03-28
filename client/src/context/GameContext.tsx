import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import socket from '../socket';
import { Character, Party, ActionLogEntry, SharedLootItem } from '../types/character';
import { EffectEvent } from '../types/effects';

interface Note {
  id: number;
  category: string;
  title: string;
  content: string;
  updated_by: string;
  updated_at: string;
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
    // Server stores conditions lowercase; normalise to Title Case to match DND_CONDITIONS
    conditions: (raw.conditions || []).map((c: string) => c.charAt(0).toUpperCase() + c.slice(1)),
    equipment: raw.inventory || [],
    homebrewInventory: raw.homebrewInventory || [],
    spellSlots: raw.spellSlotsMax || {},
    spells: raw.spells || [],
    abilities: raw.features || [],
    proficiencyBonus: raw.proficiencyBonus || 2,
    speed: raw.speed || 30,
    initiative: raw.initiativeBonus || 0,
    activeBuffs: raw.buffs || [],
    concentratingOn: raw.concentratingOn,
    attacks: raw.attacks || [],
    raw_dndbeyond_json: raw.raw_dndbeyond_json
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

    socket.on('party_loot_state', (data: SharedLootItem[]) => {
      setSharedLoot(data);
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

    // Load initial effect timeline
    fetch('/api/effect-timeline')
      .then(r => r.json())
      .then(setEffectEvents)
      .catch(() => {});

    // Join DM room if token exists
    const storedToken = localStorage.getItem('dm_token');
    if (storedToken) {
      socket.emit('dm_join_room', { dmToken: storedToken });
    }

    return () => {
      socket.off('party_state');
      socket.off('initiative_state');
      socket.off('action_logged');
      socket.off('notes_state');
      socket.off('approval_mode');
      socket.off('timeline_update');
      socket.off('party_loot_state');
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
