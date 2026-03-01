import React from 'react';
import CharacterCard from './CharacterCard';

export default function PartyDashboard({ party, onAddClick, onCharacterClick, prevHpMap }) {
    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-5">
                <div>
                    <h1 className="fantasy-heading text-2xl m-0">⚔ The Party</h1>
                    <p className="text-dnd-muted text-xs mt-1 mb-0">
                        {party.length} {party.length === 1 ? 'adventurer' : 'adventurers'} in the field
                    </p>
                </div>
                <button className="btn-primary" onClick={onAddClick}>
                    + Add Character
                </button>
            </div>

            {/* Grid */}
            {party.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-dnd-muted gap-3">
                    <div className="text-5xl opacity-30">🏕</div>
                    <p className="m-0 text-sm">No adventurers yet. Add your first character!</p>
                    <button className="btn-secondary" onClick={onAddClick}>Create Character</button>
                </div>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 content-start overflow-y-auto flex-1 pr-1">
                    {party.map(char => (
                        <div 
                            key={char.id} 
                            onClick={() => onCharacterClick?.(char)} 
                            className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <CharacterCard
                                character={char}
                                prevHp={prevHpMap?.[char.id] ?? char.currentHp}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
