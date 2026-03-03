import React, { useState, useEffect, useRef } from 'react';
import socket from './socket';
import PartyDashboard from './components/PartyDashboard';
import ActionLog from './components/ActionLog';
import DndBeyondImporter from './components/DndBeyondImporter';
import RulesAssistant from './components/RulesAssistant';
import SessionRecap from './components/SessionRecap';
import PartyNotes from './components/PartyNotes';
import DmWhisperPanel from './components/DmWhisperPanel';
import HomebrewCreator from './components/HomebrewCreator';
import CharacterSheetModal from './components/CharacterSheetModal';
import Compendium from './components/Compendium';
import PartySidebar from './components/PartySidebar';
import CharacterSheetView from './components/CharacterSheetView';
import DmDashboard from './components/DmDashboard';
import DiceRoller from './components/DiceRoller';
import MapViewer from './components/MapViewer';
import SessionEndModal from './components/SessionEndModal';
import SoundReceiver from './components/SoundReceiver';
import QuestTracker from './components/QuestTracker';
import AtmosphereOverlay from './components/AtmosphereOverlay';
import RecapArchive from './components/RecapArchive';
import NPCManager from './components/NPCManager';
import LootManager from './components/LootManager';

// ── New components from rules engine phase ───────────────────────────────────
import InitiativeTracker from './components/InitiativeTracker';
import { ConcentrationAlert } from './components/ConcentrationAlert';

// ─── Prop adapter ─────────────────────────────────────────────────────────────
function normaliseCharacter(raw) {
  return {
    id: raw.id,
    name: raw.name,
    classes: raw.classes ?? [{ name: raw.class ?? 'Unknown', level: raw.level ?? 1 }],
    currentHp: raw.current_hp ?? raw.currentHp ?? 0,
    maxHp: raw.max_hp ?? raw.maxHp ?? 1,
    tempHp: raw.temp_hp ?? raw.tempHp ?? 0,
    ac: raw.ac ?? 10,
    conditions: raw.conditions ?? [],
    concentratingOn: raw.concentrating_on ?? raw.concentratingOn ?? null,
    spellSlotsMax: raw.spell_slots_max ?? raw.spellSlotsMax ?? {},
    spellSlotsUsed: (() => {
      const v = raw.spell_slots_used ?? raw.spellSlotsUsed ?? raw.spell_slots;
      if (!v) return {};
      if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } }
      return v;
    })(),
    deathSaves: raw.death_saves ?? raw.deathSaves ?? { successes: 0, failures: 0 },
    ...raw,
  };
}

function normaliseTrackerEntity(raw) {
  return {
    ...raw,
    conditions: raw.conditions ?? [],
    concentrating_on: raw.concentrating_on ?? null,
  };
}

const TABS = [
  { id: 'party', label: '🛡️ Party' },
  { id: 'map', label: '🗺️ Map' },
  { id: 'quests', label: '📜 Quests' },
  { id: 'initiative', label: '⚔ Initiative' },
  { id: 'campaign', label: '📜 Campaign' },
  { id: 'notes', label: '📋 Notes' },
];

function App() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('party');
  const [party, setParty] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tracker, setTracker] = useState([]);
  const [notes, setNotes] = useState([]);
  const [roundNumber, setRoundNumber] = useState(1);
  const [isConnected, setIsConnected] = useState(false);
  const [isApprovalMode, setIsApprovalMode] = useState(false);
  const [showHomebrewCreator, setShowHomebrewCreator] = useState(false);
  const [showCompendium, setShowCompendium] = useState(false);
  const [showRecapArchive, setShowRecapArchive] = useState(false);
  const [showNpcManager, setShowNpcManager] = useState(false);
  const [showLootManager, setShowLootManager] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [currentRecap, setCurrentRecap] = useState(null);
  const [isDm, setIsDm] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const prevHpMapRef = useRef({});

  // ── Socket Listeners ───────────────────────────────────────────────────────
  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('party_state', (data) => {
      const normalised = data.map(normaliseCharacter);
      setParty(prev => {
        prev.forEach(c => { prevHpMapRef.current[c.id] = c.currentHp; });
        return normalised;
      });
    });

    socket.on('action_logged', (data) => setLogs(data));
    socket.on('approval_mode', (mode) => setIsApprovalMode(mode));

    socket.on('initiative_state', (data) => {
      setTracker(data.map(normaliseTrackerEntity));
    });

    socket.on('notes_state', (data) => setNotes(data));

    socket.on('recaps_updated', (data) => {
      if (data && data.length > 0) {
        setCurrentRecap(data[0].recap_text);
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('party_state');
      socket.off('action_logged');
      socket.off('approval_mode');
      socket.off('initiative_state');
      socket.off('notes_state');
      socket.off('recaps_updated');
    };
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleNextTurn() {
    socket.emit('next_turn');
  }

  function handleEndEncounter() {
    socket.emit('end_encounter');
    setRoundNumber(1);
  }

  async function toggleDm() {
    if (isDm) {
      setIsDm(false);
    } else {
      const pin = prompt("Enter Master PIN:");
      if (!pin) return;

      try {
        const res = await fetch('/api/auth/dm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        });
        if (res.ok) {
          setIsDm(true);
        } else {
          alert("Invalid Key.");
        }
      } catch (err) {
        alert("Auth server unreachable.");
      }
    }
  }

  // ── Tab content ────────────────────────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {
      case 'party':
        return <CharacterSheetView character={selectedCharacter} />;

      case 'map':
        return <MapViewer isGm={isDm} party={party} />;

      case 'quests':
        return <QuestTracker isDm={isDm} />;

      case 'initiative':
        return (
          <div className="max-w-[500px] mx-auto p-4">
            <InitiativeTracker
              entities={tracker}
              roundNumber={roundNumber}
              onNextTurn={handleNextTurn}
              onEndEncounter={handleEndEncounter}
              isGm={isDm}
            />
          </div>
        );

      case 'campaign':
        return <div className="p-4"><SessionRecap /></div>;

      case 'notes':
        return <div className="p-4"><PartyNotes notes={notes} /></div>;

      default:
        return null;
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AtmosphereOverlay />
      <header className="p-3 bg-dnd-surface border-b border-dnd-border flex justify-between items-center shrink-0 z-50 relative">
        <div className="flex items-center gap-3">
          <h1
            className="fantasy-heading cursor-help select-none text-xl m-0"
            onClick={toggleDm}
          >
            🐉 DnD Party Sync {isDm && <span className="text-dnd-gold text-xs ml-2">[DM]</span>}
          </h1>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-dnd-green shadow-[0_0_6px_rgba(34,197,94,0.5)]' : 'bg-dnd-red shadow-[0_0_6px_rgba(239,68,68,0.5)]'}`} title={isConnected ? 'Connected' : 'Disconnected'} />
        </div>

        <div className="hidden md:flex items-center gap-2">
          <button className="btn-secondary px-3 py-1.5 text-xs text-white" onClick={() => setShowLootManager(true)}>💰 Loot</button>
          <button className="btn-secondary px-3 py-1.5 text-xs text-white" onClick={() => setShowNpcManager(true)}>👥 NPCs</button>
          <button className="btn-secondary px-3 py-1.5 text-xs text-white" onClick={() => setShowRecapArchive(true)}>📜 Chronicles</button>
          <button className="btn-secondary px-3 py-1.5 text-xs text-white" onClick={() => setShowCompendium(true)}>📦 Compendium</button>
          <button className="btn-secondary px-3 py-1.5 text-xs text-white" onClick={() => setShowHomebrewCreator(true)}>🔮 Creator</button>
          {isDm && (
            <label className="flex items-center gap-2 cursor-pointer text-xs text-dnd-gold ml-2">
              <input type="checkbox" checked={isApprovalMode} onChange={(e) => socket.emit('toggle_approval_mode', e.target.checked)} className="accent-dnd-gold" />
              DM Queue
            </label>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button className="md:hidden btn-ghost text-xl text-white" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          {isMenuOpen ? '✕' : '☰'}
        </button>

        {/* Mobile Menu Overlay */}
        {isMenuOpen && (
          <div className="absolute top-full left-0 right-0 bg-dnd-surface border-b border-dnd-border p-4 flex flex-col gap-4 shadow-2xl md:hidden animate-in slide-in-from-top-4 duration-200 z-50">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] text-dnd-muted font-bold uppercase tracking-widest pl-2">Navigation</span>
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`text-left px-4 py-3 rounded-lg transition-all ${activeTab === tab.id ? 'bg-dnd-gold/10 text-dnd-gold' : 'text-dnd-text hover:bg-white/5'}`}
                  onClick={() => { setActiveTab(tab.id); setIsMenuOpen(false); }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 pt-2 border-t border-dnd-border">
              <span className="text-[10px] text-dnd-muted font-bold uppercase tracking-widest pl-2">Tools</span>
              <button className="btn-secondary w-full justify-start py-3" onClick={() => { setShowLootManager(true); setIsMenuOpen(false); }}>💰 Loot Forger</button>
              <button className="btn-secondary w-full justify-start py-3" onClick={() => { setShowNpcManager(true); setIsMenuOpen(false); }}>👥 NPC Archive</button>
              <button className="btn-secondary w-full justify-start py-3" onClick={() => { setShowRecapArchive(true); setIsMenuOpen(false); }}>📜 Chronicles</button>
              <button className="btn-secondary w-full justify-start py-3" onClick={() => { setShowCompendium(true); setIsMenuOpen(false); }}>📦 Compendium</button>
              <button className="btn-secondary w-full justify-start py-3" onClick={() => { setShowHomebrewCreator(true); setIsMenuOpen(false); }}>🔮 Creator</button>
              {isDm && (
                <div className="px-4 py-2 bg-dnd-navy rounded-lg border border-dnd-border">
                  <label className="flex items-center gap-3 cursor-pointer text-sm text-dnd-gold">
                    <input type="checkbox" checked={isApprovalMode} onChange={(e) => socket.emit('toggle_approval_mode', e.target.checked)} className="accent-dnd-gold" />
                    DM Approval Queue
                  </label>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Layout Toggle */}
      {isDm ? (
        <main style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }}>
          <DmDashboard
            party={party}
            logs={logs}
            isApprovalMode={isApprovalMode}
            onCharacterClick={(char) => setSelectedCharacter(char)}
            socket={socket}
          />
        </main>
      ) : (
        <>
          <nav className="tab-nav hidden md:flex shrink-0 bg-dnd-surface border-b border-dnd-border px-4 py-2 gap-2 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.id}
                className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-dnd-gold text-dnd-navy' : 'text-dnd-muted hover:text-white hover:bg-white/10'}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[250px_minmax(0,1fr)_300px] overflow-hidden">

            {/* Left Pane: Party Tracker */}
            <aside className="hidden lg:flex flex-col h-full bg-gray-900 border-r border-dnd-border">
              <PartySidebar
                party={party}
                selectedCharacterId={selectedCharacter?.id}
                onCharacterClick={(char) => { setSelectedCharacter(char); setActiveTab('party'); }}
                prevHpMap={prevHpMapRef.current}
              />
            </aside>

            {/* Center Pane: Dynamic Content (Character Sheet, Map, Initiative) */}
            <main className="flex-1 overflow-y-auto bg-gray-900 custom-scrollbar relative">
              {renderTabContent()}
            </main>

            {/* Right Pane: Dice & Log */}
            <aside className="h-[40vh] lg:h-full flex flex-col overflow-hidden bg-dnd-surface border-l border-dnd-border shrink-0">
              <div className="p-3 border-b border-dnd-border shrink-0 bg-gray-950">
                <DiceRoller characterName={selectedCharacter ? selectedCharacter.name : "Player"} />
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                <ActionLog logs={logs} party={party} approvalMode={isApprovalMode} />
              </div>
              <div className="p-4 border-t border-dnd-border shrink-0 bg-gray-950">
                <DndBeyondImporter />
              </div>
            </aside>
          </div>
        </>
      )}

      <RulesAssistant />
      <DmWhisperPanel party={party} />

      <SoundReceiver />

      <ConcentrationAlert
        socket={socket}
        characterId={null}
      />

      {showHomebrewCreator && (
        <HomebrewCreator onClose={() => setShowHomebrewCreator(false)} />
      )}

      {showCompendium && (
        <Compendium party={party} onClose={() => setShowCompendium(false)} />
      )}

      {showRecapArchive && (
        <RecapArchive onClose={() => setShowRecapArchive(false)} />
      )}

      {showNpcManager && (
        <NPCManager isDm={isDm} onClose={() => setShowNpcManager(false)} />
      )}

      {showLootManager && (
        <LootManager isDm={isDm} party={party} onClose={() => setShowLootManager(false)} />
      )}

      {selectedCharacter && isDm && (
        <CharacterSheetModal
          character={selectedCharacter}
          onClose={() => setSelectedCharacter(null)}
        />
      )}

      {currentRecap && (
        <SessionEndModal
          recap={currentRecap}
          onClose={() => setCurrentRecap(null)}
        />
      )}
    </div>
  );
}

export default App;
