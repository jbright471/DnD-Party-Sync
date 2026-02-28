// FRONTEND INTEGRATION GUIDE
// ============================================================
// Shows how to wire the three new components into your React app.
// Assumes you already have a socket.io connection via client/src/socket.js
// ============================================================

// ─── 1. Add Google Fonts to your index.html ──────────────────────────────────
// Add inside <head> before your CSS:
//
// <link rel="preconnect" href="https://fonts.googleapis.com">
// <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
// <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">


// ─── 2. Update broadcastPartyState() on the server ───────────────────────────
// In server.js, update broadcastPartyState() to include session state data:
//
// function broadcastPartyState() {
//   const characters = getAllCharacters();
//   const resolved = characters.map(char => {
//     const session = db.prepare(
//       'SELECT * FROM session_states WHERE character_id = ?'
//     ).get(char.id);
//
//     return {
//       ...char,
//       // New fields from session_states:
//       temp_hp: session?.temp_hp ?? 0,
//       conditions: JSON.parse(session?.conditions_json ?? '[]'),
//       concentrating_on: session?.concentrating_on ?? null,
//       spell_slots_used: JSON.parse(session?.slots_used_json ?? '{}'),
//       // Keep existing fields: current_hp, max_hp, ac, etc.
//     };
//   });
//   io.emit('party_state', resolved);
// }


// ─── 3. Update initiative broadcast to include conditions ─────────────────────
// In server.js / routes/initiative.js, when emitting initiative_state,
// join session_states to include conditions:
//
// function broadcastInitiative() {
//   const tracker = db.prepare('SELECT * FROM initiative_tracker ORDER BY sort_order ASC').all();
//   const enriched = tracker.map(entity => {
//     if (!entity.character_id) return { ...entity, conditions: [], concentrating_on: null };
//     const session = db.prepare(
//       'SELECT conditions_json, concentrating_on FROM session_states WHERE character_id = ?'
//     ).get(entity.character_id);
//     return {
//       ...entity,
//       conditions: JSON.parse(session?.conditions_json ?? '[]'),
//       concentrating_on: session?.concentrating_on ?? null,
//     };
//   });
//   io.emit('initiative_state', enriched);
// }


// ─── 4. Add concentration_check_result handler to server.js ──────────────────
// Inside io.on('connection'):
//
// socket.on('concentration_check_result', ({ characterId, spellName, passed }) => {
//   if (!passed) {
//     const result = dropConcentrationEvent(db, characterId);
//     if (result.success) {
//       logAction('System', result.logMessage);
//       broadcastPartyState();
//     }
//   }
//   // If passed, nothing changes — concentration holds
//   const char = db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId);
//   const label = char ? char.name : `Character ${characterId}`;
//   logAction(label, `${label} ${passed ? 'maintained' : 'lost'} concentration on ${spellName} (DC ${dc}).`);
// });


// ─── 5. Example App.jsx wiring ───────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { CharacterCard } from './components/CharacterCard';
import { InitiativeTracker } from './components/InitiativeTracker';
import { ConcentrationAlert } from './components/ConcentrationAlert';

// Your existing socket setup — replace with your actual socket.js import
const socket = io('http://localhost:3001');

export default function App() {
  const [partyState, setPartyState] = useState([]);
  const [initiativeState, setInitiativeState] = useState([]);
  const [roundNumber, setRoundNumber] = useState(1);

  // Track previous HP values for flash animation on CharacterCard
  const prevHpRef = useRef({});

  // Your player's character ID (set from auth/session)
  const myCharacterId = null; // e.g., 3 — null means DM (shows all conc checks)

  const isGm = true; // toggle based on your auth

  useEffect(() => {
    socket.on('party_state', (characters) => {
      // Capture previous HP before updating
      setPartyState(prev => {
        characters.forEach(c => {
          const old = prev.find(p => p.id === c.id);
          if (old) prevHpRef.current[c.id] = old.current_hp;
        });
        return characters;
      });
    });

    socket.on('initiative_state', (tracker) => {
      setInitiativeState(tracker);
    });

    return () => {
      socket.off('party_state');
      socket.off('initiative_state');
    };
  }, []);

  function handleNextTurn() {
    socket.emit('next_turn');
  }

  function handleEndEncounter() {
    socket.emit('end_encounter');
    setRoundNumber(1);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#060a10',
      color: '#e2e8f0',
      display: 'flex',
      gap: 24,
      padding: 24,
      fontFamily: "'Rajdhani', sans-serif",
    }}>

      {/* Party grid */}
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 11, letterSpacing: '0.2em', color: '#334155',
          textTransform: 'uppercase', marginBottom: 12,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          PARTY STATUS
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 12,
        }}>
          {partyState.map(char => (
            <CharacterCard
              key={char.id}
              character={{
                id: char.id,
                name: char.name,
                classes: char.classes ?? [{ name: char.class, level: char.level }],
                currentHp: char.current_hp,
                maxHp: char.max_hp,
                tempHp: char.temp_hp ?? 0,
                ac: char.ac,
                conditions: char.conditions ?? [],
                concentratingOn: char.concentrating_on ?? null,
                spellSlotsMax: char.spell_slots_max ?? {},
                spellSlotsUsed: JSON.parse(char.spell_slots ?? '{}'),
                deathSaves: char.death_saves ?? { successes: 0, failures: 0 },
              }}
              prevHp={prevHpRef.current[char.id] ?? char.current_hp}
              isPlayer={char.id === myCharacterId}
            />
          ))}
        </div>
      </div>

      {/* Sidebar: Initiative tracker */}
      <div style={{ width: 340, flexShrink: 0 }}>
        <div style={{
          fontSize: 11, letterSpacing: '0.2em', color: '#334155',
          textTransform: 'uppercase', marginBottom: 12,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          COMBAT
        </div>
        <InitiativeTracker
          entities={initiativeState}
          roundNumber={roundNumber}
          onNextTurn={handleNextTurn}
          onEndEncounter={handleEndEncounter}
          isGm={isGm}
        />
      </div>

      {/* Concentration check overlay — always mounted */}
      <ConcentrationAlert
        socket={socket}
        characterId={myCharacterId}
      />
    </div>
  );
}


// ─── 6. Prop shape reference ──────────────────────────────────────────────────

// CharacterCard expects:
// {
//   id: number,
//   name: string,
//   classes: Array<{ name: string, level: number }>,
//   currentHp: number,
//   maxHp: number,
//   tempHp: number,           // from session_states.temp_hp
//   ac: number,
//   conditions: string[],     // from session_states.conditions_json
//   concentratingOn: string|null,  // from session_states.concentrating_on
//   spellSlotsMax: Record<string, number>,   // from character data_json
//   spellSlotsUsed: Record<string, number>,  // from session_states.slots_used_json
//   deathSaves: { successes: number, failures: number },
// }
// prevHp: number  (previous currentHp for flash animation)

// InitiativeTracker expects entities[]:
// {
//   id: number,
//   entity_name: string,
//   entity_type: 'pc' | 'npc' | 'monster',
//   initiative: number,
//   current_hp: number,
//   max_hp: number,
//   ac: number,
//   is_active: boolean | 0 | 1,
//   conditions: string[],        // joined from session_states
//   concentrating_on: string|null,
// }

// ConcentrationAlert expects:
//   socket: Socket.io client instance
//   characterId: number | null  (null = show all, e.g. for GM)
