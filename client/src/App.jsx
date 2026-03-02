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
import DmDashboard from './components/DmDashboard';
import DiceRoller from './components/DiceRoller';
import MapViewer from './components/MapViewer';
import SessionEndModal from './components/SessionEndModal';
import SoundReceiver from './components/SoundReceiver';

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

  function toggleDm() {
    if (isDm) {
      setIsDm(false);
    } else {
      const pin = prompt("Enter Master PIN:");
      if (pin === "1234") {
        setIsDm(true);
      } else {
        alert("Invalid Key.");
      }
    }
  }

  // ── Tab content ────────────────────────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {
      case 'party':
        return (
          <PartyDashboard
            party={party}
            prevHpMap={prevHpMapRef.current}
            onAddClick={() => {/* trigger importer */ }}
            onCharacterClick={(char) => setSelectedCharacter(char)}
          />
        );

      case 'map':
        return <MapViewer isGm={isDm} />;

      case 'initiative':
        return (
          <div style={{ maxWidth: 500 }}>
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
        return <SessionRecap />;

      case 'notes':
        return <PartyNotes notes={notes} />;

      default:
        return null;
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SoundReceiver />
      <header style={{
        padding: '0.75rem 1.5rem',
        background: 'var(--dnd-surface)',
        borderBottom: '1px solid var(--dnd-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
        zIndex: 100,
        position: 'relative'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1
            className="fantasy-heading cursor-help select-none"
            style={{ fontSize: '1.2rem', margin: 0 }}
            onClick={toggleDm}
          >
            🐉 Party Sync {isDm && <span className="text-dnd-gold text-xs ml-1">[DM]</span>}
          </h1>
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: isConnected ? 'var(--dnd-green)' : 'var(--dnd-red)',
            boxShadow: `0 0 6px ${isConnected ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'}`,
          }} title={isConnected ? 'Connected' : 'Disconnected'} />
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-3">
          <button
            className="btn-secondary"
            onClick={() => setShowCompendium(true)}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
          >
            📜 Compendium
          </button>
          <button
            className="btn-secondary"
            onClick={() => setShowHomebrewCreator(true)}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
          >
            🔮 Creator
          </button>
          {isDm && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              cursor: 'pointer', fontSize: '0.8rem', color: 'var(--dnd-gold)',
            }}>
              <input
                type="checkbox"
                checked={isApprovalMode}
                onChange={(e) => socket.emit('toggle_approval_mode', e.target.checked)}
                style={{ accentColor: 'var(--dnd-gold)' }}
              />
              DM Queue
            </label>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden btn-ghost text-xl"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
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
              <button
                className="btn-secondary w-full justify-start py-3"
                onClick={() => { setShowCompendium(true); setIsMenuOpen(false); }}
              >
                📜 Compendium
              </button>
              <button
                className="btn-secondary w-full justify-start py-3"
                onClick={() => { setShowHomebrewCreator(true); setIsMenuOpen(false); }}
              >
                🔮 Creator
              </button>
              {isDm && (
                <div className="px-4 py-2 bg-dnd-navy rounded-lg border border-dnd-border">
                  <label className="flex items-center gap-3 cursor-pointer text-sm text-dnd-gold">
                    <input
                      type="checkbox"
                      checked={isApprovalMode}
                      onChange={(e) => socket.emit('toggle_approval_mode', e.target.checked)}
                      style={{ accentColor: 'var(--dnd-gold)' }}
                    />
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
          <nav className="tab-nav hidden md:flex" style={{ flexShrink: 0 }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'tab-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="app-main-grid" style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '1fr 380px',
            overflow: 'hidden',
          }}>
            <main style={{ padding: '1.25rem 1.5rem', overflowY: 'auto' }}>
              {renderTabContent()}
            </main>

            <aside className="app-sidebar" style={{
              borderLeft: '1px solid var(--dnd-border)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}>
              <div style={{ padding: '1rem', borderBottom: '1px solid var(--dnd-border)' }}>
                <DiceRoller characterName="Player" />
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <ActionLog logs={logs} party={party} approvalMode={isApprovalMode} />
              </div>
              <div style={{ borderTop: '1px solid var(--dnd-border)', padding: '1rem' }}>
                <DndBeyondImporter />
              </div>
            </aside>
          </div>
        </>
      )}

      <RulesAssistant />
      <DmWhisperPanel party={party} />

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

      {selectedCharacter && (
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
