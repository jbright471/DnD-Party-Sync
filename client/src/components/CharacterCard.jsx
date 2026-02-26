import React, { useState } from 'react';
import socket from '../socket';
import EquipmentModal from './EquipmentModal';
import CharacterSheetModal from './CharacterSheetModal';

// Condition → CSS class + icon mapping
const CONDITION_MAP = {
    'blessed': { cssClass: 'blessed', icon: '✨', label: 'Blessed' },
    'poisoned': { cssClass: 'poisoned', icon: '🧪', label: 'Poisoned' },
    'charmed': { cssClass: 'charmed', icon: '💜', label: 'Charmed' },
    'frightened': { cssClass: 'frightened', icon: '😨', label: 'Frightened' },
    'stunned': { cssClass: 'stunned', icon: '💫', label: 'Stunned' },
    'blinded': { cssClass: 'blinded', icon: '🌑', label: 'Blinded' },
    'paralyzed': { cssClass: 'paralyzed', icon: '⚡', label: 'Paralyzed' },
    'unconscious': { cssClass: 'unconscious', icon: '💀', label: 'Unconscious' },
    'prone': { cssClass: 'prone', icon: '🔻', label: 'Prone' },
    'restrained': { cssClass: 'restrained', icon: '🔗', label: 'Restrained' },
    'invisible': { cssClass: '', icon: '👁️', label: 'Invisible' },
    'deafened': { cssClass: '', icon: '🔇', label: 'Deafened' },
    'petrified': { cssClass: 'stunned', icon: '🗿', label: 'Petrified' },
    'incapacitated': { cssClass: 'stunned', icon: '🚫', label: 'Incapacitated' },
    'exhaustion': { cssClass: '', icon: '😩', label: 'Exhaustion' },
    'concentrating': { cssClass: '', icon: '🔵', label: 'Concentrating' },
};

export default function CharacterCard({ character }) {
    const { id, name, class: charClass, level, max_hp, current_hp, ac, spell_slots, conditions, inspiration, concentration_spell, equipment } = character;
    const [showEquipment, setShowEquipment] = useState(false);
    const [showFullSheet, setShowFullSheet] = useState(false);

    // Parse JSON fields
    let condList = [];
    try { condList = typeof conditions === 'string' ? JSON.parse(conditions) : (conditions || []); } catch { condList = []; }

    let eqList = [];
    try { eqList = typeof equipment === 'string' ? JSON.parse(equipment) : (equipment || []); } catch { eqList = []; }

    let slots = {};
    try { slots = typeof spell_slots === 'string' ? JSON.parse(spell_slots) : (spell_slots || {}); } catch { slots = {}; }

    const hpPct = max_hp > 0 ? current_hp / max_hp : 0;
    const isUnconscious = current_hp === 0;

    // Calculate effective AC from equipment
    const equippedBonus = eqList.filter(i => i.equipped).reduce((sum, i) => sum + (Number(i.acBonus) || 0), 0);
    const effectiveAC = ac + equippedBonus;

    // Determine HP status class
    const hpClass = hpPct <= 0 ? 'hp-critical' : hpPct < 0.25 ? 'hp-critical' : hpPct < 0.5 ? 'hp-low' : hpPct < 1 ? 'hp-ok' : 'hp-full';

    // Build condition CSS classes for card border/glow effects
    const conditionClasses = condList
        .map(c => {
            const key = c.toLowerCase().trim();
            const info = CONDITION_MAP[key];
            return info?.cssClass ? `condition-${info.cssClass}` : '';
        })
        .filter(Boolean)
        .join(' ');

    const handleHpChange = (delta) => {
        socket.emit('update_hp', { characterId: id, delta, actor: 'Dashboard' });
    };

    const toggleInspiration = () => {
        socket.emit('update_character', { characterId: id, updates: { inspiration: inspiration ? 0 : 1 }, actor: 'Dashboard' });
    };

    return (
        <>
            <div className={`char-card card-in ${conditionClasses}`}>
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                        <h3 style={{
                            margin: 0, fontSize: '1rem', fontWeight: 600,
                            color: isUnconscious ? 'var(--dnd-red)' : 'var(--dnd-text)',
                        }}>
                            {name}
                        </h3>
                        <span style={{ fontSize: '0.75rem', color: 'var(--dnd-muted)' }}>
                            Lv.{level} {charClass}
                        </span>
                    </div>
                    <button
                        onClick={toggleInspiration}
                        title={inspiration ? 'Has Inspiration' : 'No Inspiration'}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: '1.3rem', opacity: inspiration ? 1 : 0.3,
                            filter: inspiration ? 'drop-shadow(0 0 4px rgba(212,160,23,0.6))' : 'none',
                            transition: 'all 0.2s',
                        }}
                    >
                        ⭐
                    </button>
                </div>

                {/* HP Bar */}
                <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span className={hpClass} style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                            {current_hp} / {max_hp} HP
                        </span>
                        <div style={{ display: 'flex', gap: '3px' }}>
                            <button className="btn-ghost" onClick={() => handleHpChange(-1)} title="-1 HP" style={{ fontSize: '0.8rem' }}>−</button>
                            <button className="btn-ghost" onClick={() => handleHpChange(-5)} title="-5 HP" style={{ fontSize: '0.7rem' }}>−5</button>
                            <button className="btn-ghost heal" onClick={() => handleHpChange(5)} title="+5 HP" style={{ fontSize: '0.7rem' }}>+5</button>
                            <button className="btn-ghost heal" onClick={() => handleHpChange(1)} title="+1 HP" style={{ fontSize: '0.8rem' }}>+</button>
                        </div>
                    </div>
                    <div className="hp-bar-track">
                        <div className="hp-bar-fill" style={{
                            width: `${Math.max(0, hpPct * 100)}%`,
                            backgroundColor: hpPct > 0.6 ? '#22C55E' : hpPct > 0.3 ? '#F59E0B' : '#EF4444',
                        }} />
                    </div>
                </div>

                {/* AC + Spell Slots Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.6rem', color: 'var(--dnd-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AC</div>
                            <div className="fantasy-heading" style={{ fontSize: '1.15rem' }}>
                                {effectiveAC}
                                {equippedBonus > 0 && <span style={{ fontSize: '0.6rem', color: 'var(--dnd-muted)' }}> (+{equippedBonus})</span>}
                            </div>
                        </div>

                        {/* Spell Slot Dots */}
                        {Object.keys(slots).length > 0 && (
                            <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                                {Object.entries(slots).map(([level, data]) => {
                                    const used = data.used || 0;
                                    const total = data.total || 0;
                                    return Array.from({ length: total }, (_, i) => (
                                        <div key={`${level}-${i}`} title={`Level ${level} slot`} style={{
                                            width: '8px', height: '8px', borderRadius: '50%',
                                            background: i < (total - used) ? 'var(--dnd-blue)' : 'var(--dnd-border)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                        }} />
                                    ));
                                })}
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                            className="btn-ghost"
                            onClick={() => setShowEquipment(true)}
                            style={{ fontSize: '0.9rem', width: 'auto', padding: '0.25rem 0.5rem' }}
                            title="Equipment Shortcut"
                        >
                            🎒 {eqList.length}
                        </button>
                        <button
                            className="btn-ghost"
                            onClick={() => setShowFullSheet(true)}
                            style={{ fontSize: '0.75rem', width: 'auto', padding: '0.25rem 0.5rem', border: '1px solid var(--dnd-border)', borderRadius: '4px' }}
                            title="View Full Sheet"
                        >
                            📜
                        </button>
                    </div>
                </div>

                {/* Conditions — Visual Badges */}
                {condList.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '0.5rem' }}>
                        {condList.map((cond, idx) => {
                            const key = cond.toLowerCase().trim();
                            const info = CONDITION_MAP[key] || { icon: '⚠️', label: cond, cssClass: '' };
                            return (
                                <span key={idx} className={`condition-icon ${info.cssClass}`}>
                                    {info.icon} {info.label}
                                </span>
                            );
                        })}
                    </div>
                )}

                {/* Concentration Indicator */}
                {concentration_spell && (
                    <div style={{
                        marginTop: '0.5rem', padding: '0.3rem 0.6rem',
                        background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)',
                        borderRadius: '6px', fontSize: '0.7rem', color: 'var(--dnd-blue)',
                        display: 'flex', alignItems: 'center', gap: '4px',
                    }}>
                        🔵 Concentrating: {concentration_spell}
                    </div>
                )}
            </div>

            {/* Equipment Modal Shortuct */}
            {showEquipment && (
                <EquipmentModal character={character} onClose={() => setShowEquipment(false)} />
            )}

            {/* Full Character Sheet Modal */}
            {showFullSheet && (
                <CharacterSheetModal character={character} onClose={() => setShowFullSheet(false)} />
            )}
        </>
    );
}
