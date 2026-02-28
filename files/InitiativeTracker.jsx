// components/InitiativeTracker.jsx
// Expects initiative_state socket event shape:
// Array of {
//   id, entity_name, entity_type ('pc' | 'npc' | 'monster'),
//   initiative, current_hp, max_hp, ac, is_active,
//   sort_order, character_id,
//   // Injected from session_states join (optional):
//   conditions, concentrating_on
// }

import { useState, useEffect, useRef } from 'react';

const CONDITION_META = {
  blinded:       { icon: '◎', color: '#94a3b8' },
  charmed:       { icon: '♥', color: '#f472b6' },
  deafened:      { icon: '◌', color: '#94a3b8' },
  exhaustion:    { icon: '↓', color: '#fb923c' },
  frightened:    { icon: '!', color: '#fbbf24' },
  grappled:      { icon: '⊕', color: '#a78bfa' },
  incapacitated: { icon: '×', color: '#f87171' },
  invisible:     { icon: '◇', color: '#c084fc' },
  paralyzed:     { icon: '‖', color: '#60a5fa' },
  petrified:     { icon: '◆', color: '#9ca3af' },
  poisoned:      { icon: '✦', color: '#4ade80' },
  prone:         { icon: '↘', color: '#fb923c' },
  restrained:    { icon: '⊗', color: '#f97316' },
  stunned:       { icon: '~', color: '#38bdf8' },
  unconscious:   { icon: '●', color: '#f87171' },
};

function getHpColor(pct) {
  if (pct > 0.6) return '#22c55e';
  if (pct > 0.3) return '#f59e0b';
  if (pct > 0)   return '#ef4444';
  return '#7f1d1d';
}

function HpMiniBar({ current, max }) {
  const pct = max > 0 ? Math.max(0, current / max) : 0;
  const color = getHpColor(pct);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
      <div style={{
        flex: 1, height: 3, background: '#0f172a', position: 'relative',
        minWidth: 48,
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct * 100}%`,
          background: color,
          transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1), background 0.3s',
          boxShadow: `0 0 4px ${color}88`,
        }} />
      </div>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11, color,
        minWidth: 36, textAlign: 'right',
        lineHeight: 1,
      }}>
        {current}/{max}
      </span>
    </div>
  );
}

function ConditionChips({ conditions = [] }) {
  if (!conditions.length) return null;
  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 3 }}>
      {conditions.map(cond => {
        const meta = CONDITION_META[cond.toLowerCase()] || { icon: '?', color: '#94a3b8' };
        return (
          <span
            key={cond}
            title={cond}
            style={{
              fontSize: 10,
              color: meta.color,
              padding: '1px 5px',
              border: `1px solid ${meta.color}44`,
              background: `${meta.color}12`,
              letterSpacing: '0.06em',
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {meta.icon} {cond}
          </span>
        );
      })}
    </div>
  );
}

function TurnIndicator({ isActive }) {
  return (
    <div style={{
      width: 3,
      alignSelf: 'stretch',
      background: isActive ? '#f0a500' : 'transparent',
      transition: 'background 0.2s',
      flexShrink: 0,
      boxShadow: isActive ? '0 0 8px #f0a50088' : 'none',
    }} />
  );
}

function EntityRow({ entity, index, roundNumber }) {
  const {
    entity_name, entity_type, initiative,
    current_hp, max_hp, ac,
    is_active, conditions = [], concentrating_on,
  } = entity;

  const isPC = entity_type === 'pc';
  const isDowned = current_hp === 0 && max_hp > 0;
  const isMonster = entity_type === 'monster' || entity_type === 'npc';

  const [prevHp, setPrevHp] = useState(current_hp);
  const [hpFlash, setHpFlash] = useState(null);

  useEffect(() => {
    if (current_hp !== prevHp) {
      setHpFlash(current_hp < prevHp ? 'damage' : 'heal');
      const t = setTimeout(() => setHpFlash(null), 600);
      setPrevHp(current_hp);
      return () => clearTimeout(t);
    }
  }, [current_hp]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'stretch',
      gap: 0,
      background: is_active ? '#0f1c2e' : isDowned ? '#130808' : '#0a0f16',
      border: `1px solid ${is_active ? '#f0a50044' : isDowned ? '#7f1d1d33' : '#1e2d3d'}`,
      marginBottom: 4,
      transition: 'background 0.3s, border-color 0.3s',
      opacity: isDowned ? 0.7 : 1,
      outline: is_active ? '1px solid #f0a50022' : 'none',
      outlineOffset: 1,
    }}>
      <TurnIndicator isActive={is_active} />

      {/* Initiative number */}
      <div style={{
        width: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRight: '1px solid #1e2d3d',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 14, fontWeight: 700,
        color: is_active ? '#f0a500' : '#475569',
        flexShrink: 0,
        transition: 'color 0.3s',
      }}>
        {initiative}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: '7px 10px', minWidth: 0 }}>
        {/* Name row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {/* PC / Monster indicator dot */}
            <div style={{
              width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
              background: isPC ? '#60a5fa' : '#f87171',
            }} />
            <span style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700, fontSize: 14, letterSpacing: '0.04em',
              color: isDowned ? '#ef4444' : is_active ? '#e2e8f0' : '#94a3b8',
              textTransform: 'uppercase',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              transition: 'color 0.3s',
            }}>
              {entity_name}
              {isDowned && <span style={{ color: '#7f1d1d', marginLeft: 6, fontSize: 11 }}>● DOWN</span>}
            </span>
          </div>

          {/* AC badge */}
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: '#f0a500',
            padding: '1px 6px',
            border: '1px solid #f0a50033',
            flexShrink: 0,
          }}>
            AC {ac}
          </div>
        </div>

        {/* HP bar */}
        <div style={{ marginTop: 5 }}>
          <HpMiniBar current={current_hp} max={max_hp} />
        </div>

        {/* Concentration */}
        {concentrating_on && (
          <div style={{
            marginTop: 4,
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 10, color: '#f59e0b',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.06em',
          }}>
            <span>◉</span>
            <span style={{ textTransform: 'uppercase' }}>{concentrating_on}</span>
          </div>
        )}

        {/* Conditions */}
        <ConditionChips conditions={conditions} />
      </div>
    </div>
  );
}

export function InitiativeTracker({
  entities = [],
  roundNumber = 1,
  onNextTurn,
  onEndEncounter,
  isGm = false,
}) {
  const activeIndex = entities.findIndex(e => e.is_active);
  const activeEntity = entities[activeIndex];

  return (
    <div style={{
      background: '#080c12',
      border: '1px solid #1e2d3d',
      fontFamily: "'Rajdhani', sans-serif",
      width: '100%',
      maxWidth: 360,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid #1e2d3d',
        background: '#0a1020',
      }}>
        <div>
          <div style={{
            fontSize: 11, color: '#475569', letterSpacing: '0.2em',
            textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace",
          }}>
            INITIATIVE
          </div>
          <div style={{
            fontSize: 16, fontWeight: 700, color: '#f0a500',
            letterSpacing: '0.08em',
          }}>
            ROUND {roundNumber}
          </div>
        </div>

        {/* Active entity callout */}
        {activeEntity && (
          <div style={{
            textAlign: 'right',
            padding: '4px 8px',
            border: '1px solid #f0a50044',
            background: '#f0a50011',
          }}>
            <div style={{ fontSize: 9, color: '#f0a500', letterSpacing: '0.15em' }}>ACTIVE</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase' }}>
              {activeEntity.entity_name}
            </div>
          </div>
        )}
      </div>

      {/* Entity list */}
      <div style={{ padding: '10px 10px 6px' }}>
        {entities.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '24px 0',
            color: '#334155', fontSize: 13, letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>
            No Active Encounter
          </div>
        ) : (
          entities.map((entity, i) => (
            <EntityRow key={entity.id} entity={entity} index={i} roundNumber={roundNumber} />
          ))
        )}
      </div>

      {/* GM controls */}
      {isGm && entities.length > 0 && (
        <div style={{
          display: 'flex', gap: 0,
          borderTop: '1px solid #1e2d3d',
        }}>
          <button
            onClick={onNextTurn}
            style={{
              flex: 1, padding: '10px 0',
              background: 'transparent',
              border: 'none', borderRight: '1px solid #1e2d3d',
              color: '#f0a500', fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700, fontSize: 13, letterSpacing: '0.1em',
              textTransform: 'uppercase', cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f0a50011'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            Next Turn →
          </button>
          <button
            onClick={onEndEncounter}
            style={{
              flex: 1, padding: '10px 0',
              background: 'transparent',
              border: 'none',
              color: '#475569', fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700, fontSize: 13, letterSpacing: '0.1em',
              textTransform: 'uppercase', cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#ef444411'; e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; }}
          >
            End Combat
          </button>
        </div>
      )}
    </div>
  );
}

export default InitiativeTracker;
