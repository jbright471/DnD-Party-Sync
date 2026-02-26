import React, { useState, useEffect } from 'react';
import socket from './socket';
import PartyDashboard from './components/PartyDashboard';
import ActionLog from './components/ActionLog';
import DndBeyondImporter from './components/DndBeyondImporter';
import RulesAssistant from './components/RulesAssistant';
import InitiativeTracker from './components/InitiativeTracker';
import SessionRecap from './components/SessionRecap';
import PartyNotes from './components/PartyNotes';
import DmWhisperPanel from './components/DmWhisperPanel';
import HomebrewCreator from './components/HomebrewCreator';

const TABS = [
  { id: 'party', label: '🛡️ Party', icon: '⚔' },
  { id: 'initiative', label: '⚔ Initiative', icon: '⚔' },
  { id: 'campaign', label: '📜 Campaign', icon: '📜' },
  { id: 'notes', label: '📋 Notes', icon: '📋' },
];

function App() {
  // ---- State ----
  const [activeTab, setActiveTab] = useState('party');
  const [party, setParty] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tracker, setTracker] = useState([]);
  const [notes, setNotes] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isApprovalMode, setIsApprovalMode] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const [showHomebrewCreator, setShowHomebrewCreator] = useState(false);

  // ---- Socket Listeners ----
  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('party_state', (data) => setParty(data));
    socket.on('action_logged', (data) => setLogs(data));
    socket.on('approval_mode', (mode) => setIsApprovalMode(mode));
    socket.on('initiative_state', (data) => setTracker(data));
    socket.on('notes_state', (data) => setNotes(data));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('party_state');
      socket.off('action_logged');
      socket.off('approval_mode');
      socket.off('initiative_state');
      socket.off('notes_state');
    };
  }, []);

  // ---- Tab Content ----
  const renderTabContent = () => {
    switch (activeTab) {
      case 'party':
        return <PartyDashboard party={party} onAddClick={() => setShowImporter(true)} />;
      case 'initiative':
        return <InitiativeTracker tracker={tracker} party={party} />;
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
      {/* ===== Header ===== */}
      <header style={{
        padding: '0.75rem 1.5rem',
        background: 'var(--dnd-surface)',
        borderBottom: '1px solid var(--dnd-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 className="fantasy-heading" style={{ fontSize: '1.3rem', margin: 0 }}>
            🐉 DnD Party Sync
          </h1>
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: isConnected ? 'var(--dnd-green)' : 'var(--dnd-red)',
            boxShadow: `0 0 6px ${isConnected ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'}`,
          }} title={isConnected ? 'Connected' : 'Disconnected'} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Homebrew Button */}
          <button
            className="btn-secondary"
            onClick={() => setShowHomebrewCreator(true)}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
          >
            🔮 Homebrew
          </button>
          {/* DM Approval Toggle */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            cursor: 'pointer', fontSize: '0.8rem', color: 'var(--dnd-muted)',
          }}>
            <input
              type="checkbox"
              checked={isApprovalMode}
              onChange={(e) => socket.emit('toggle_approval_mode', e.target.checked)}
              style={{ accentColor: 'var(--dnd-gold)' }}
            />
            DM Queue
          </label>
        </div>
      </header>

      {/* ===== Tab Navigation ===== */}
      <nav className="tab-nav" style={{ flexShrink: 0 }}>
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

      {/* ===== Main Content ===== */}
      <div className="app-main-grid" style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 380px',
        overflow: 'hidden',
      }}>
        {/* Left Panel — Dynamic Tab Content */}
        <main style={{ padding: '1.25rem 1.5rem', overflowY: 'auto' }}>
          {renderTabContent()}
        </main>

        {/* Right Sidebar — Always Visible */}
        <aside className="app-sidebar" style={{
          borderLeft: '1px solid var(--dnd-border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Session Log */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <ActionLog logs={logs} party={party} approvalMode={isApprovalMode} />
          </div>

          {/* Importer Section */}
          <div style={{ borderTop: '1px solid var(--dnd-border)', padding: '1rem' }}>
            <DndBeyondImporter />
          </div>
        </aside>
      </div>

      {/* ===== Floating Panels ===== */}
      <RulesAssistant />
      <DmWhisperPanel party={party} />

      {/* ===== Modals ===== */}
      {showHomebrewCreator && (
        <HomebrewCreator onClose={() => setShowHomebrewCreator(false)} />
      )}
    </div>
  );
}

export default App;
