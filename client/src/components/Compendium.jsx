import React, { useState, useEffect } from 'react';
import socket from '../socket';

export default function Compendium({ party, onClose }) {
    const [entities, setEntities] = useState([]);
    const [filter, setFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [assigningTo, setAssigningTo] = useState(null); // { entityId, entityName }
    const [selectedCharId, setSelectedCharId] = useState('');

    useEffect(() => {
        fetchEntities();
    }, []);

    const fetchEntities = async () => {
        try {
            const res = await fetch('/api/homebrew');
            const data = await res.json();
            setEntities(data);
        } catch (err) {
            console.error('Failed to fetch entities:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAssign = async () => {
        if (!selectedCharId || !assigningTo) return;

        try {
            const res = await fetch('/api/homebrew/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    characterId: selectedCharId,
                    entityId: assigningTo.entityId
                })
            });

            if (res.ok) {
                setAssigningTo(null);
                setSelectedCharId('');
                socket.emit('refresh_party');
                alert('Assigned successfully!');
            } else {
                const data = await res.json();
                alert('Error: ' + data.error);
            }
        } catch (err) {
            alert('Failed to assign item.');
        }
    };

    const filtered = entities.filter(e => filter === 'all' || e.entity_type === filter);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '90vw' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 className="fantasy-heading" style={{ margin: 0 }}>📜 Homebrew Compendium</h2>
                    <button className="btn-ghost" onClick={onClose}>✕</button>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    {['all', 'monster', 'spell', 'item'].map(t => (
                        <button
                            key={t}
                            className={`btn-secondary ${filter === t ? 'active-tab' : ''}`}
                            style={{ 
                                flex: 1, 
                                textTransform: 'capitalize',
                                background: filter === t ? 'rgba(212,160,23,0.1)' : 'transparent',
                                borderColor: filter === t ? 'var(--dnd-gold)' : 'var(--dnd-border)',
                                color: filter === t ? 'var(--dnd-gold)' : 'var(--dnd-muted)'
                            }}
                            onClick={() => setFilter(t)}
                        >
                            {t}s
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--dnd-muted)' }}>Loading compendium...</div>
                ) : filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--dnd-muted)' }}>No entities found. Create some in the Homebrew Creator!</div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', maxHeight: '50vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
                        {filtered.map(entity => (
                            <div key={entity.id} style={{ padding: '1rem', background: 'var(--dnd-surface)', border: '1px solid var(--dnd-border)', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                                    <h4 style={{ margin: 0, color: 'var(--dnd-gold)' }}>{entity.name}</h4>
                                    <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--dnd-muted)', background: 'var(--dnd-navy)', padding: '2px 6px', borderRadius: '4px' }}>
                                        {entity.entity_type}
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.85rem', color: 'var(--dnd-muted)', margin: '0 0 1rem 0', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {entity.description}
                                </p>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {entity.entity_type === 'item' && (
                                        <button 
                                            className="btn-primary" 
                                            style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem' }}
                                            onClick={() => setAssigningTo({ entityId: entity.id, entityName: entity.name })}
                                        >
                                            🎁 Assign
                                        </button>
                                    )}
                                    <button className="btn-secondary" style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem' }}>
                                        👁 View
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Assignment Modal Overlay */}
                {assigningTo && (
                    <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.8)', zIndex: 100 }}>
                        <div className="modal-content" style={{ maxWidth: '400px' }}>
                            <h3 className="fantasy-heading" style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Assign {assigningTo.entityName}</h3>
                            <p style={{ fontSize: '0.9rem', color: 'var(--dnd-muted)', marginBottom: '1rem' }}>Which adventurer shall receive this gift?</p>
                            
                            <select 
                                className="dnd-input" 
                                value={selectedCharId} 
                                onChange={e => setSelectedCharId(e.target.value)}
                                style={{ marginBottom: '1.5rem' }}
                            >
                                <option value="">Select a character...</option>
                                {party.map(char => (
                                    <option key={char.id} value={char.id}>{char.name}</option>
                                ))}
                            </select>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setAssigningTo(null)}>Cancel</button>
                                <button className="btn-primary" style={{ flex: 1 }} disabled={!selectedCharId} onClick={handleAssign}>Confirm</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
