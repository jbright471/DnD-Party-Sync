import React from 'react';
import socket from '../socket';

export default function InitiativeTracker({ entities, roundNumber, onNextTurn, onEndEncounter, isGm }) {
    
    // Filter entities for players: hide those where is_hidden is true
    const visibleEntities = isGm ? entities : entities.filter(e => !e.is_hidden);

    const handleHpChange = (trackerId, delta) => {
        socket.emit('update_initiative_hp', { trackerId, delta });
    };

    const toggleVisibility = (entityId) => {
        socket.emit('toggle_entity_visibility', { entityId });
    };

    return (
        <div className="bg-dnd-surface border border-dnd-border rounded-lg shadow-2xl overflow-hidden flex flex-col h-full max-h-[600px]">
            {/* Header */}
            <div className="p-4 bg-dnd-navy border-b border-dnd-border flex justify-between items-center">
                <div>
                    <h3 className="fantasy-heading text-lg m-0 text-dnd-gold">⚔ Initiative</h3>
                    <p className="text-[10px] text-dnd-muted uppercase font-bold m-0 tracking-widest">Round {roundNumber}</p>
                </div>
                {isGm && (
                    <div className="flex gap-2">
                        <button onClick={onNextTurn} className="btn-primary text-[10px] py-1 px-3">Next Turn</button>
                        <button onClick={onEndEncounter} className="btn-secondary text-[10px] py-1 px-3 border-dnd-red/30 text-dnd-red">End</button>
                    </div>
                )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                {visibleEntities.length === 0 ? (
                    <div className="text-center py-10 text-dnd-muted italic text-sm">No active combatants.</div>
                ) : (
                    visibleEntities.map((entity) => (
                        <div 
                            key={entity.id} 
                            className={`relative flex items-center p-3 rounded border transition-all ${
                                entity.is_active 
                                ? 'bg-dnd-gold/10 border-dnd-gold shadow-[0_0_15px_rgba(210,160,23,0.1)] z-10 scale-[1.02]' 
                                : 'bg-dnd-navy/40 border-dnd-border opacity-80'
                            } ${entity.is_hidden ? 'border-dashed opacity-60' : ''}`}
                        >
                            {/* Init Score */}
                            <div className="w-8 h-8 rounded bg-black/40 border border-dnd-border flex items-center justify-center font-mono text-sm text-dnd-gold mr-3">
                                {entity.initiative}
                            </div>

                            {/* Name & Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`font-bold text-sm truncate ${entity.entity_type === 'pc' ? 'text-white' : 'text-dnd-muted'}`}>
                                        {entity.entity_name}
                                    </span>
                                    {entity.is_hidden && <span className="text-[8px] bg-black text-dnd-muted px-1 rounded uppercase">Hidden</span>}
                                </div>
                                <div className="flex gap-2 mt-1">
                                    {entity.conditions?.map((c, i) => (
                                        <span key={i} className="text-[8px] text-dnd-red uppercase font-bold">{c}</span>
                                    ))}
                                    {entity.concentrating_on && (
                                        <span className="text-[8px] text-dnd-blue uppercase font-bold animate-pulse">Concentrating</span>
                                    )}
                                </div>
                            </div>

                            {/* HP Display: Asymmetrical */}
                            <div className="flex items-center gap-3">
                                <div className="text-right mr-2">
                                    {isGm || entity.entity_type === 'pc' ? (
                                        <div className="flex flex-col items-end">
                                            <span className="text-xs font-mono text-white leading-none">{entity.current_hp} / {entity.max_hp}</span>
                                            <div className="w-20 h-1 bg-black rounded-full mt-1 overflow-hidden">
                                                <div 
                                                    className={`h-full transition-all ${entity.current_hp / entity.max_hp < 0.3 ? 'bg-dnd-red' : 'bg-dnd-green'}`}
                                                    style={{ width: `${(entity.current_hp / entity.max_hp) * 100}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ) : (
                                        <span className={`text-[10px] font-bold uppercase tracking-tighter ${
                                            entity.hp_status === 'Dead' ? 'text-dnd-muted' :
                                            entity.hp_status === 'Critical' ? 'text-dnd-red' :
                                            entity.hp_status === 'Bloodied' ? 'text-orange-500' : 'text-dnd-green'
                                        }`}>
                                            {entity.hp_status}
                                        </span>
                                    )}
                                </div>

                                {/* GM Controls */}
                                {isGm && (
                                    <div className="flex items-center gap-1 border-l border-dnd-border pl-3">
                                        <button 
                                            onClick={() => handleHpChange(entity.id, -5)}
                                            className="w-5 h-5 flex items-center justify-center bg-dnd-red/10 text-dnd-red rounded hover:bg-dnd-red/20 text-[10px]"
                                        >-</button>
                                        <button 
                                            onClick={() => handleHpChange(entity.id, 5)}
                                            className="w-5 h-5 flex items-center justify-center bg-dnd-green/10 text-dnd-green rounded hover:bg-dnd-green/20 text-[10px]"
                                        >+</button>
                                        <button 
                                            onClick={() => toggleVisibility(entity.id)}
                                            className={`ml-1 w-5 h-5 flex items-center justify-center rounded text-[10px] ${entity.is_hidden ? 'bg-dnd-gold/20 text-dnd-gold' : 'bg-dnd-muted/10 text-dnd-muted'}`}
                                            title={entity.is_hidden ? "Reveal to Players" : "Hide from Players"}
                                        >
                                            {entity.is_hidden ? '👁' : '🕶'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
