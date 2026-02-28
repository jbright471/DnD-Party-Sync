// components/ConcentrationAlert.jsx
// Listens for 'concentration_check_required' socket event.
// Shows the player a modal with the DC and lets them record pass/fail.
// On resolution, emits 'concentration_check_result' back to server.
//
// Socket event shape (from rulesEngine):
//   concentration_check_required: { characterId, spellName, dc }
//
// Usage:
//   <ConcentrationAlert socket={socket} characterId={myCharacterId} />

import { useState, useEffect } from 'react';

// Pulse ring animation via keyframes injected once
function injectStyles() {
  if (document.getElementById('conc-alert-styles')) return;
  const style = document.createElement('style');
  style.id = 'conc-alert-styles';
  style.textContent = `
    @keyframes conc-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
      50% { box-shadow: 0 0 0 12px rgba(245, 158, 11, 0); }
    }
    @keyframes conc-fadein {
      from { opacity: 0; transform: translateY(-8px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes conc-overlay-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    .conc-btn:hover { filter: brightness(1.15); }
    .conc-btn:active { transform: scale(0.97); }
  `;
  document.head.appendChild(style);
}

// d20 SVG icon
function D20Icon({ size = 32, color = '#f59e0b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <polygon
        points="12,2 22,8 22,16 12,22 2,16 2,8"
        stroke={color} strokeWidth="1.5" fill={`${color}18`}
      />
      <polygon
        points="12,2 17,8 12,14 7,8"
        stroke={color} strokeWidth="1" fill={`${color}22`}
      />
      <text
        x="12" y="16.5" textAnchor="middle"
        fontSize="7" fontWeight="bold" fill={color}
        fontFamily="'JetBrains Mono', monospace"
      >
        20
      </text>
    </svg>
  );
}

// Single alert card (one pending check)
function CheckCard({ check, onResolve }) {
  const { characterId, spellName, dc, id } = check;
  const [rolling, setRolling] = useState(false);

  function handle(passed) {
    setRolling(true);
    setTimeout(() => onResolve(id, passed), 150);
  }

  return (
    <div style={{
      background: '#0d1117',
      border: '1px solid #f59e0b66',
      padding: '20px 24px',
      animation: 'conc-fadein 0.2s ease forwards',
      position: 'relative',
      clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)',
    }}>
      {/* Corner cut accent */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: 14, height: 14,
        background: '#f59e0b',
        clipPath: 'polygon(100% 0, 100% 100%, 0 0)',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{
          animation: 'conc-pulse 1.8s infinite',
          borderRadius: '50%', padding: 4,
        }}>
          <D20Icon size={36} color="#f59e0b" />
        </div>
        <div>
          <div style={{
            fontSize: 11, color: '#f59e0b', letterSpacing: '0.2em',
            textTransform: 'uppercase',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            CONCENTRATION CHECK
          </div>
          <div style={{
            fontSize: 18, fontWeight: 700, color: '#e2e8f0',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            fontFamily: "'Rajdhani', sans-serif",
          }}>
            {spellName}
          </div>
        </div>
      </div>

      {/* DC display */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '12px 0', marginBottom: 16,
        borderTop: '1px solid #1e2d3d',
        borderBottom: '1px solid #1e2d3d',
        gap: 12,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 44, fontWeight: 700, lineHeight: 1,
            color: '#f59e0b',
            fontFamily: "'JetBrains Mono', monospace",
          }}>{dc}</div>
          <div style={{
            fontSize: 10, color: '#475569', letterSpacing: '0.2em',
            marginTop: 2, textTransform: 'uppercase',
          }}>CON SAVE DC</div>
        </div>
        <div style={{
          borderLeft: '1px solid #1e2d3d', paddingLeft: 12,
          fontSize: 12, color: '#64748b', maxWidth: 140,
          lineHeight: 1.5,
          fontFamily: "'Rajdhani', sans-serif",
        }}>
          Roll CON save. On failure, {spellName} ends.
        </div>
      </div>

      {/* Pass / Fail buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="conc-btn"
          onClick={() => handle(true)}
          disabled={rolling}
          style={{
            flex: 1, padding: '10px 0',
            background: '#052e16', border: '1px solid #22c55e66',
            color: '#22c55e', cursor: 'pointer',
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 700, fontSize: 14, letterSpacing: '0.12em',
            textTransform: 'uppercase',
            transition: 'filter 0.15s, transform 0.1s',
          }}>
          ✓ Passed
        </button>
        <button
          className="conc-btn"
          onClick={() => handle(false)}
          disabled={rolling}
          style={{
            flex: 1, padding: '10px 0',
            background: '#450a0a', border: '1px solid #ef444466',
            color: '#ef4444', cursor: 'pointer',
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 700, fontSize: 14, letterSpacing: '0.12em',
            textTransform: 'uppercase',
            transition: 'filter 0.15s, transform 0.1s',
          }}>
          ✗ Failed
        </button>
      </div>
    </div>
  );
}

// Main component — mounts to a portal-like fixed overlay
export function ConcentrationAlert({ socket, characterId }) {
  const [pendingChecks, setPendingChecks] = useState([]);
  const counterRef = useRef(0);

  useEffect(() => {
    injectStyles();
  }, []);

  useEffect(() => {
    if (!socket) return;

    function onCheckRequired({ characterId: targetId, spellName, dc }) {
      // Only show if this alert is for this player's character
      if (characterId && targetId !== characterId) return;

      setPendingChecks(prev => [
        ...prev,
        { id: ++counterRef.current, characterId: targetId, spellName, dc },
      ]);
    }

    socket.on('concentration_check_required', onCheckRequired);
    return () => socket.off('concentration_check_required', onCheckRequired);
  }, [socket, characterId]);

  function handleResolve(checkId, passed) {
    const check = pendingChecks.find(c => c.id === checkId);
    if (check && socket) {
      socket.emit('concentration_check_result', {
        characterId: check.characterId,
        spellName: check.spellName,
        passed,
      });
    }
    setPendingChecks(prev => prev.filter(c => c.id !== checkId));
  }

  if (pendingChecks.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(3px)',
      animation: 'conc-overlay-in 0.15s ease',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 12,
        width: '100%', maxWidth: 400, padding: '0 16px',
      }}>
        {pendingChecks.map(check => (
          <CheckCard key={check.id} check={check} onResolve={handleResolve} />
        ))}
      </div>
    </div>
  );
}

export default ConcentrationAlert;
