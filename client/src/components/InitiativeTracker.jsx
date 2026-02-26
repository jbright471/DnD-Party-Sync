import React, { useState } from 'react';
import socket from '../socket';

export default function InitiativeTracker({ tracker, party }) {
    const [showEncounterBuilder, setShowEncounterBuilder] = useState(false);
    const [editingInit, setEditingInit] = useState(null);
    const [initValue, setInitValue] = useState('');

    const hasEntities = tracker.length > 0;
    const activeEntity = tracker.find(e => e.is_active);

    const handleSetInitiative = (trackerId) => {
        const val = parseInt(initValue);
        if (!isNaN(val)) {
            socket.emit('set_initiative', { trackerId, initiative: val });
            setEditingInit(null);
            setInitValue('');
        }
    };

    const handleHpChange = (trackerId, delta) => {
        socket.emit('update_initiative_hp', { trackerId, delta });
    };

    const getTypeColor = (type) => {
        if (type === 'pc') return 'var(--dnd-blue)';
        if (type === 'monster') return 'var(--dnd-red)';
        return 'var(--dnd-amber)';
    };

    const getTypeIcon = (type) => {
        if (type === 'pc') return '🛡️';
        if (type === 'monster') return '👹';
        return '👤';
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div>
                    <h1 className="fantasy-heading" style={{ fontSize: '1.6rem', margin: 0 }}>⚔ Initiative</h1>
                    <p style={{ color: 'var(--dnd-muted)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
                        {hasEntities
                            ? `${tracker.length} combatants${activeEntity ? ` — ${activeEntity.entity_name}'s turn` : ''}`
                            : 'No active encounter'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {hasEntities && (
                        <>
                            <button className="btn-primary" onClick={() => socket.emit('next_turn')}>
                                Next Turn ▶
                            </button>
                            <button className="btn-danger" onClick={() => socket.emit('end_encounter')}>
                                End Combat
                            </button>
                        </>
                    )}
                    {!hasEntities && (
                        <button className="btn-primary" onClick={() => setShowEncounterBuilder(true)}>
                            + Start Encounter
                        </button>
                    )}
                </div>
            </div>

            {/* Tracker List */}
            {!hasEntities ? (
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    color: 'var(--dnd-muted)', gap: '0.75rem',
                }}>
                    <div style={{ fontSize: '3rem', opacity: 0.3 }}>⚔️</div>
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>No active encounter. Build one to start combat!</p>
                    <button className="btn-secondary" onClick={() => setShowEncounterBuilder(true)}>
                        Build Encounter
                    </button>
                </div>
            ) : (
                <div style={{
                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                    overflowY: 'auto', flex: 1, paddingRight: '0.25rem',
                }}>
                    {tracker.map((entity) => {
                        const hpPct = entity.max_hp > 0 ? entity.current_hp / entity.max_hp : 0;
                        const isDead = entity.current_hp === 0 && entity.entity_type === 'monster';

                        return (
                            <div
                                key={entity.id}
                                className={`init-row ${entity.is_active ? 'active-turn' : ''} ${isDead ? 'dead' : ''}`}
                            >
                                {/* Initiative Number */}
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '8px',
                                    background: entity.is_active ? 'rgba(212,160,23,0.2)' : 'rgba(255,255,255,0.05)',
                                    border: `1px solid ${entity.is_active ? 'var(--dnd-gold)' : 'var(--dnd-border)'}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', flexShrink: 0,
                                }}
                                    onClick={() => { setEditingInit(entity.id); setInitValue(String(entity.initiative)); }}
                                    title="Click to set initiative"
                                >
                                    {editingInit === entity.id ? (
                                        <input
                                            className="input-field"
                                            type="number"
                                            value={initValue}
                                            onChange={e => setInitValue(e.target.value)}
                                            onBlur={() => handleSetInitiative(entity.id)}
                                            onKeyDown={e => e.key === 'Enter' && handleSetInitiative(entity.id)}
                                            autoFocus
                                            style={{ width: '36px', height: '36px', textAlign: 'center', padding: '0', fontSize: '0.85rem', border: 'none' }}
                                        />
                                    ) : (
                                        <span className="fantasy-heading" style={{ fontSize: '1.1rem' }}>
                                            {entity.initiative}
                                        </span>
                                    )}
                                </div>

                                {/* Entity Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span>{getTypeIcon(entity.entity_type)}</span>
                                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: entity.is_active ? 'var(--dnd-gold)' : 'var(--dnd-text)' }}>
                                            {entity.entity_name}
                                        </span>
                                        <span style={{ fontSize: '0.65rem', color: getTypeColor(entity.entity_type), textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {entity.entity_type}
                                        </span>
                                    </div>

                                    {/* HP Bar */}
                                    <div style={{ marginTop: '4px' }}>
                                        <div className="hp-bar-track" style={{ height: '5px' }}>
                                            <div className="hp-bar-fill" style={{
                                                width: `${Math.max(0, hpPct * 100)}%`,
                                                backgroundColor: hpPct > 0.6 ? '#22C55E' : hpPct > 0.3 ? '#F59E0B' : '#EF4444',
                                            }} />
                                        </div>
                                    </div>
                                </div>

                                {/* Stats */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.6rem', color: 'var(--dnd-muted)', textTransform: 'uppercase' }}>HP</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: hpPct > 0.3 ? 'var(--dnd-text)' : 'var(--dnd-red)' }}>
                                            {entity.current_hp}/{entity.max_hp}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.6rem', color: 'var(--dnd-muted)', textTransform: 'uppercase' }}>AC</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{entity.ac}</div>
                                    </div>

                                    {/* HP Controls */}
                                    <div style={{ display: 'flex', gap: '3px' }}>
                                        <button className="btn-ghost" onClick={() => handleHpChange(entity.id, -1)} title="Damage 1" style={{ fontSize: '0.8rem' }}>−</button>
                                        <button className="btn-ghost" onClick={() => handleHpChange(entity.id, -5)} title="Damage 5" style={{ fontSize: '0.7rem' }}>−5</button>
                                        <button className="btn-ghost heal" onClick={() => handleHpChange(entity.id, 5)} title="Heal 5" style={{ fontSize: '0.7rem' }}>+5</button>
                                        <button className="btn-ghost heal" onClick={() => handleHpChange(entity.id, 1)} title="Heal 1" style={{ fontSize: '0.8rem' }}>+</button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Encounter Builder Modal */}
            {showEncounterBuilder && (
                <EncounterBuilderModal
                    onClose={() => setShowEncounterBuilder(false)}
                    onStart={(encounterId) => {
                        socket.emit('start_encounter', { encounterId });
                        setShowEncounterBuilder(false);
                    }}
                />
            )}
        </div>
    );
}

// ---- Inline Encounter Builder Modal ----
function EncounterBuilderModal({ onClose, onStart }) {
    const [encounters, setEncounters] = React.useState([]);
    const [newName, setNewName] = React.useState('');
    const [monsters, setMonsters] = React.useState([{ name: '', hp: 10, ac: 10, initiative_mod: 0, count: 1 }]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        fetch('/api/encounters')
            .then(r => r.json())
            .then(data => { setEncounters(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    const addMonsterRow = () => {
        setMonsters(prev => [...prev, { name: '', hp: 10, ac: 10, initiative_mod: 0, count: 1 }]);
    };

    const updateMonster = (idx, field, value) => {
        setMonsters(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
    };

    const removeMonster = (idx) => {
        setMonsters(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSave = async () => {
        if (!newName.trim() || monsters.length === 0) return;
        const validMonsters = monsters.filter(m => m.name.trim());
        if (validMonsters.length === 0) return;

        try {
            const res = await fetch('/api/encounters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim(), monsters: validMonsters }),
            });
            const enc = await res.json();
            setEncounters(prev => [enc, ...prev]);
            setNewName('');
            setMonsters([{ name: '', hp: 10, ac: 10, initiative_mod: 0, count: 1 }]);
        } catch (err) {
            console.error('Failed to save encounter:', err);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 className="fantasy-heading" style={{ margin: 0 }}>🗡️ Encounter Builder</h2>
                    <button className="btn-ghost" onClick={onClose}>✕</button>
                </div>

                {/* Saved Encounters */}
                {encounters.length > 0 && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '0.85rem', color: 'var(--dnd-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                            Saved Encounters
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {encounters.map(enc => (
                                <div key={enc.id} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '0.5rem 0.75rem', background: 'var(--dnd-surface)',
                                    border: '1px solid var(--dnd-border)', borderRadius: '8px',
                                }}>
                                    <div>
                                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{enc.name}</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--dnd-muted)', marginLeft: '8px' }}>
                                            ({enc.monsters.length} monster type{enc.monsters.length !== 1 ? 's' : ''})
                                        </span>
                                    </div>
                                    <button className="btn-primary" onClick={() => onStart(enc.id)} style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>
                                        ⚔ Start
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="dnd-divider" />

                {/* New Encounter Form */}
                <h3 style={{ fontSize: '0.85rem', color: 'var(--dnd-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                    Create New Encounter
                </h3>
                <input
                    className="dnd-input"
                    placeholder="Encounter name (e.g., Goblin Ambush)"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    style={{ marginBottom: '0.75rem' }}
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
                    {monsters.map((m, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <input className="input-field" placeholder="Monster name" value={m.name} onChange={e => updateMonster(idx, 'name', e.target.value)} style={{ flex: 2 }} />
                            <input className="input-field" type="number" placeholder="HP" value={m.hp} onChange={e => updateMonster(idx, 'hp', parseInt(e.target.value) || 0)} style={{ width: '55px' }} title="HP" />
                            <input className="input-field" type="number" placeholder="AC" value={m.ac} onChange={e => updateMonster(idx, 'ac', parseInt(e.target.value) || 0)} style={{ width: '50px' }} title="AC" />
                            <input className="input-field" type="number" placeholder="Init" value={m.initiative_mod} onChange={e => updateMonster(idx, 'initiative_mod', parseInt(e.target.value) || 0)} style={{ width: '50px' }} title="Init Mod" />
                            <input className="input-field" type="number" placeholder="Qty" value={m.count} onChange={e => updateMonster(idx, 'count', Math.max(1, parseInt(e.target.value) || 1))} style={{ width: '50px' }} title="Count" />
                            <button className="btn-ghost" onClick={() => removeMonster(idx)} style={{ color: 'var(--dnd-red)', flexShrink: 0 }}>✕</button>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
                    <button className="btn-secondary" onClick={addMonsterRow} style={{ fontSize: '0.8rem' }}>+ Add Monster</button>
                    <button className="btn-primary" onClick={handleSave} disabled={!newName.trim()}>Save Encounter</button>
                </div>
            </div>
        </div>
    );
}
