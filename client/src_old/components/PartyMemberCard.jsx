import React from 'react';

export default function PartyMemberCard({ char, isSelected, onClick, prevHp }) {
    const hpPercent = Math.max(0, Math.min(100, (char.currentHp / (char.maxHp || 1)) * 100));
    const hpColor = hpPercent > 50 ? 'bg-dnd-green' : hpPercent > 20 ? 'bg-dnd-gold' : 'bg-dnd-red';

    return (
        <div
            onClick={onClick}
            className={`min-w-[140px] lg:min-w-0 flex-shrink-0 p-2 rounded border cursor-pointer transition-all ${isSelected
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
}
