// components/CharacterCard.jsx
// Props shape matches getResolvedCharacterState() from rulesIntegration.js:
// {
//   id, name, classes[], currentHp, maxHp, tempHp, ac,
//   conditions[], buffs[], concentratingOn,
//   spellSlotsUsed{}, spellSlotsMax{}, deathSaves{ successes, failures }
// }

import { useState, useEffect, useRef } from 'react';

// ─── Condition metadata ──────────────────────────────────────────────────────
const CONDITION_META = {
  blinded: { icon: '◎', color: '#94a3b8', label: 'Blinded' },
  charmed: { icon: '♥', color: '#f472b6', label: 'Charmed' },
  deafened: { icon: '◌', color: '#94a3b8', label: 'Deafened' },
  exhaustion: { icon: '↓', color: '#fb923c', label: 'Exhausted' },
  frightened: { icon: '!', color: '#fbbf24', label: 'Frightened' },
  grappled: { icon: '⊕', color: '#a78bfa', label: 'Grappled' },
  incapacitated: { icon: '×', color: '#f87171', label: 'Incapacitated' },
  invisible: { icon: '◇', color: '#c084fc', label: 'Invisible' },
  paralyzed: { icon: '‖', color: '#60a5fa', label: 'Paralyzed' },
  petrified: { icon: '◆', color: '#9ca3af', label: 'Petrified' },
  poisoned: { icon: '✦', color: '#4ade80', label: 'Poisoned' },
  prone: { icon: '↘', color: '#fb923c', label: 'Prone' },
  restrained: { icon: '⊗', color: '#f97316', label: 'Restrained' },
  stunned: { icon: '~', color: '#38bdf8', label: 'Stunned' },
  unconscious: { icon: '●', color: '#f87171', label: 'Unconscious' },
};

function getConditionMeta(condition) {
  return CONDITION_META[condition.toLowerCase()] || {
    icon: '?', color: '#94a3b8', label: condition
  };
}

// ─── HP bar color: green → amber → crimson ───────────────────────────────────
function getHpColor(pct) {
  if (pct > 0.6) return '#22c55e';   // green
  if (pct > 0.3) return '#f59e0b';   // amber
  if (pct > 0) return '#ef4444';   // red
  return '#7f1d1d';                   // near-black red (at 0)
}

// ─── Class abbreviations ─────────────────────────────────────────────────────
function formatClasses(classes = []) {
  return classes
    .map(c => `${(c.name || 'Unknown').slice(0, 3).toUpperCase()} ${c.level || 1}`)
    .join(' / ');
}

// ─── Animated HP number ──────────────────────────────────────────────────────
function AnimatedNumber({ value, prevValue }) {
  const [display, setDisplay] = useState(value);
  const [flash, setFlash] = useState(null); // 'damage' | 'heal' | null

  useEffect(() => {
    if (value === prevValue) return;
    const delta = value - prevValue;
    setFlash(delta < 0 ? 'damage' : 'heal');
    setDisplay(value);
    const t = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(t);
  }, [value]);

  const flashColor = flash === 'damage' ? '#ef4444' : flash === 'heal' ? '#22c55e' : 'inherit';
  return (
    <span style={{
      transition: 'color 0.15s',
      color: flash ? flashColor : 'inherit',
    }}>
      {display}
    </span>
  );
}

// ─── Death Save pips ─────────────────────────────────────────────────────────
function DeathSavePips({ successes = 0, failures = 0 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 8, height: 8,
            borderRadius: '50%',
            border: '1px solid #22c55e',
            background: i < successes ? '#22c55e' : 'transparent',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 8, height: 8,
            borderRadius: '50%',
            border: '1px solid #ef4444',
            background: i < failures ? '#ef4444' : 'transparent',
          }} />
        ))}
      </div>
    </div>
  );
}

// ─── Main CharacterCard ───────────────────────────────────────────────────────
export function CharacterCard({ character, isPlayer = false, prevHp = null }) {
  const {
    id, name, classes = [], currentHp, maxHp, tempHp = 0,
    ac, conditions = [], concentratingOn = null, deathSaves,
    spellSlotsMax = {}, spellSlotsUsed = {},
  } = character;

  const hpPct = maxHp > 0 ? currentHp / maxHp : 0;
  const hpColor = getHpColor(hpPct);
  const isDowned = currentHp === 0;
  const hasTempHp = tempHp > 0;
  const totalDisplayHp = currentHp + tempHp;

  const [tooltipCondition, setTooltipCondition] = useState(null);

  // Spell slot summary — only show if character has slots
  const slotLevels = Object.keys(spellSlotsMax).sort();

  return (
    <div
      className={`char-card border-fantasy !p-4 !min-w-[280px] transition-all duration-300 ${isDowned ? 'grayscale-[0.5] brightness-[0.7]' : ''}`}
      style={{
        background: isDowned ? '#1a0505' : 'var(--dnd-navy)',
        border: `1px solid ${isDowned ? '#7f1d1d' : concentratingOn ? 'var(--dnd-gold)' : 'var(--dnd-border)'}`,
        opacity: isDowned ? 0.85 : 1,
      }}
    >
      {/* Corner accent — top right */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: 16, height: 16,
        background: isDowned ? '#7f1d1d' : concentratingOn ? '#f59e0b' : '#1e2d3d',
        clipPath: 'polygon(100% 0, 100% 100%, 0 0)',
        transition: 'background 0.3s',
      }} />

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{
            fontSize: 18, fontWeight: 700, letterSpacing: '0.05em',
            color: isDowned ? '#ef4444' : '#e2e8f0',
            textTransform: 'uppercase',
          }}>
            {name}
          </div>
          <div style={{
            fontSize: 11, color: '#475569', letterSpacing: '0.1em',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {formatClasses(classes)}
          </div>
        </div>

        {/* AC badge */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          background: '#0a1628', border: '1px solid #1e2d3d',
          padding: '4px 10px', minWidth: 44,
        }}>
          <div style={{
            fontSize: 20, fontWeight: 700, lineHeight: 1,
            color: '#f0a500',
            fontFamily: "'JetBrains Mono', monospace",
          }}>{ac}</div>
          <div style={{ fontSize: 9, color: '#475569', letterSpacing: '0.12em' }}>AC</div>
        </div>
      </div>

      {/* HP bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 22, fontWeight: 700,
            color: hpColor,
            transition: 'color 0.4s',
            lineHeight: 1,
          }}>
            <AnimatedNumber value={currentHp} prevValue={prevHp ?? currentHp} />
            <span style={{ color: '#334155', fontSize: 14 }}>/{maxHp}</span>
            {hasTempHp && (
              <span style={{ fontSize: 13, color: '#38bdf8', marginLeft: 6 }}>
                +{tempHp}
              </span>
            )}
          </div>
          {isDowned && deathSaves && (
            <DeathSavePips successes={deathSaves.successes} failures={deathSaves.failures} />
          )}
        </div>

        {/* HP bar track */}
        <div style={{
          height: 4, background: '#0f172a',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Real HP fill */}
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${hpPct * 100}%`,
            background: hpColor,
            transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1), background 0.4s',
            boxShadow: `0 0 6px ${hpColor}88`,
          }} />
          {/* Temp HP overlay */}
          {hasTempHp && (
            <div style={{
              position: 'absolute', right: 0, top: 0, bottom: 0,
              width: `${Math.min((tempHp / maxHp) * 100, 100 - hpPct * 100)}%`,
              background: '#38bdf8',
              opacity: 0.7,
            }} />
          )}
        </div>
      </div>

      {/* Conditions row */}
      {conditions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {conditions.map(cond => {
            const meta = getConditionMeta(cond);
            return (
              <div
                key={cond}
                onMouseEnter={() => setTooltipCondition(cond)}
                onMouseLeave={() => setTooltipCondition(null)}
                title={meta.label}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  padding: '2px 7px',
                  background: `${meta.color}18`,
                  border: `1px solid ${meta.color}55`,
                  fontSize: 10, letterSpacing: '0.08em',
                  color: meta.color,
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  cursor: 'default',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: 11 }}>{meta.icon}</span>
                {meta.label}
              </div>
            );
          })}
        </div>
      )}

      {/* Concentration bar */}
      {concentratingOn && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 8px',
          background: '#1c150500',
          border: '1px solid #f59e0b44',
          borderLeft: '2px solid #f59e0b',
          marginBottom: conditions.length > 0 ? 0 : 4,
        }}>
          <span style={{ color: '#f59e0b', fontSize: 10 }}>◉</span>
          <span style={{
            fontSize: 11, color: '#f59e0b', letterSpacing: '0.08em',
            fontFamily: "'JetBrains Mono', monospace",
            textTransform: 'uppercase',
          }}>
            CONC: {concentratingOn}
          </span>
        </div>
      )}

      {/* Spell slots — compact row, only if has slots */}
      {slotLevels.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid #1e2d3d',
        }}>
          {slotLevels.map(lvl => {
            const max = spellSlotsMax[lvl] || 0;
            const used = spellSlotsUsed[lvl] || 0;
            const remaining = max - used;
            return (
              <div key={lvl} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={{ display: 'flex', gap: 2 }}>
                  {Array.from({ length: max }).map((_, i) => (
                    <div key={i} style={{
                      width: 6, height: 6,
                      background: i < remaining ? '#a78bfa' : '#1e2d3d',
                      border: '1px solid #2d1b69',
                      transition: 'background 0.2s',
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: 8, color: '#334155', fontFamily: "'JetBrains Mono', monospace" }}>
                  L{lvl}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default CharacterCard;
