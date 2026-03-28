import React from 'react';
import PartyMemberCard from './PartyMemberCard';

export default function PartySidebar({ party, selectedCharacterId, onCharacterClick, prevHpMap }) {
    return (
        <div className="flex flex-col lg:h-full bg-dnd-surface lg:bg-gray-900 w-full relative">
            <div className="hidden lg:block p-4 border-b border-dnd-border bg-gray-950">
                <h2 className="fantasy-heading text-lg m-0 text-dnd-gold">🛡️ Party Tracker</h2>
                <div className="text-xs text-dnd-muted mt-1">{party.length} Members</div>
            </div>

            {/* Mobile horizontal scroll / Desktop vertical list */}
            <div className="w-full overflow-x-auto lg:overflow-y-auto lg:flex-1 p-2 flex flex-row lg:flex-col gap-2 custom-scrollbar items-center lg:items-stretch scroll-smooth">
                {party.length === 0 ? (
                    <div className="text-center text-dnd-muted text-xs p-4 opacity-50 w-full">No adventurers yet.</div>
                ) : (
                    party.map(char => (
                        <PartyMemberCard
                            key={char.id}
                            char={char}
                            isSelected={selectedCharacterId === char.id}
                            onClick={() => onCharacterClick(char)}
                            prevHp={prevHpMap?.[char.id] ?? char.currentHp}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
