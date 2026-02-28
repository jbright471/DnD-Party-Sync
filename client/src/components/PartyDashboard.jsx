import React from 'react';
import CharacterCard from './CharacterCard';

export default function PartyDashboard({ party, onAddClick, prevHpMap }) {
    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div>
                    <h1 className="fantasy-heading" style={{ fontSize: '1.6rem', margin: 0 }}>⚔ The Party</h1>
                    <p style={{ color: 'var(--dnd-muted)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
                        {party.length} {party.length === 1 ? 'adventurer' : 'adventurers'} in the field
                    </p>
                </div>
                <button className="btn-primary" onClick={onAddClick}>
                    + Add Character
                </button>
            </div>

            {/* Grid */}
            {party.length === 0 ? (
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--dnd-muted)',
                    gap: '0.75rem',
                }}>
                    <div style={{ fontSize: '3rem', opacity: 0.3 }}>🏕</div>
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>No adventurers yet. Add your first character!</p>
                    <button className="btn-secondary" onClick={onAddClick}>Create Character</button>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                    gap: '1rem',
                    alignContent: 'start',
                    overflowY: 'auto',
                    flex: 1,
                    paddingRight: '0.25rem',
                }}>
                    {party.map(char => (
                        <CharacterCard
                            key={char.id}
                            character={char}
                            prevHp={prevHpMap?.[char.id] ?? char.currentHp}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
