import React from 'react';

export default function PartySidebar({ party, selectedCharacterId, onCharacterClick, prevHpMap }) {
    return (
        <div className="flex flex-col h-full bg-gray-900 border-r border-dnd-border">
            <div className="p-4 border-b border-dnd-border bg-gray-950">
                <h2 className="fantasy-heading text-lg m-0 text-dnd-gold">🛡️ Party Tracker</h2>
                <div className="text-xs text-dnd-muted mt-1">{party.length} Members</div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                {party.length === 0 ? (
                    <div className="text-center text-dnd-muted text-xs p-4 opacity-50">No adventurers yet.</div>
                ) : (
                    party.map(char => {
                        const isSelected = selectedCharacterId === char.id;
                        const hpPercent = Math.max(0, Math.min(100, (char.currentHp / (char.maxHp || 1)) * 100));
                        const hpColor = hpPercent > 50 ? 'bg-dnd-green' : hpPercent > 20 ? 'bg-dnd-gold' : 'bg-dnd-red';
                        const prevHp = prevHpMap?.[char.id] ?? char.currentHp;
                        const hpDiff = char.currentHp - prevHp;

                        return (
                            <div
                                key={char.id}
                                onClick={() => onCharacterClick(char)}
                                className={`p-2 rounded border cursor-pointer transition-all ${isSelected
                                        ? 'bg-dnd-surface border-dnd-gold shadow-[0_0_8px_rgba(210,160,23,0.3)]'
                                        : 'bg-dnd-surface/50 border-dnd-border hover:border-dnd-muted hover:bg-dnd-surface'
                                    }`}
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <span className={`font-fantasy truncate pr-2 ${isSelected ? 'text-dnd-gold' : 'text-white'}`}>
                                        {char.name}
                                    </span>
                                    <span className="text-xs font-bold text-dnd-blue bg-dnd-navy px-1.5 py-0.5 rounded border border-dnd-border shrink-0">
                                        AC {char.ac}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-dnd-navy rounded-full overflow-hidden border border-dnd-border relative">
                                        <div
                                            className={`h-full ${hpColor} transition-all duration-500`}
                                            style={{ width: `${hpPercent}%` }}
                                        />
                                    </div>
                                    <span className="text-[10px] font-mono text-dnd-muted w-10 text-right whitespace-nowrap">
                                        {char.currentHp}/{char.maxHp}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
