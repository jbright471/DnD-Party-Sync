import React, { useState, useEffect } from 'react';
import socket from '../socket';

export default function TargetSelectionModal({ isOpen, onClose, onSelect, actionName, characterId }) {
    const [party, setParty] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [useAutoResolve, setUseAutoResolve] = useState(true);

    useEffect(() => {
        if (isOpen) {
            // Fetch latest party state to show targets
            const handlePartyState = (data) => {
                // Filter out the actor themselves? Or allow self-targeting?
                // Usually D&D allows self-targeting for many things.
                setParty(data);
            };
            socket.on('party_state', handlePartyState);
            socket.emit('refresh_party');
            return () => socket.off('party_state', handlePartyState);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const toggleTarget = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(sid => sid !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleConfirm = () => {
        const selectedTargets = party.filter(p => selectedIds.includes(p.id));
        onSelect(selectedTargets, useAutoResolve);
        setSelectedIds([]);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-dnd-surface border border-dnd-gold/30 w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="p-4 bg-gradient-to-r from-dnd-navy to-dnd-surface border-b border-dnd-gold/20 flex justify-between items-center">
                    <div>
                        <h3 className="text-dnd-gold font-fantasy text-lg leading-tight m-0 uppercase tracking-wider">Select Targets</h3>
                        <p className="text-[10px] text-dnd-muted uppercase tracking-widest mt-1">For: <span className="text-white">{actionName}</span></p>
                    </div>
                    <button onClick={onClose} className="text-dnd-muted hover:text-white transition-colors">✕</button>
                </div>

                {/* Body */}
                <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar flex flex-col gap-2">
                    {party.length === 0 ? (
                        <div className="text-center py-8 text-dnd-muted italic text-sm">No party members found.</div>
                    ) : (
                        party.map(member => (
                            <div
                                key={member.id}
                                onClick={() => toggleTarget(member.id)}
                                className={`flex items-center gap-4 p-3 rounded-lg border transition-all cursor-pointer group ${selectedIds.includes(member.id)
                                    ? 'bg-dnd-gold/20 border-dnd-gold shadow-[0_0_15px_rgba(210,160,23,0.15)]'
                                    : 'bg-dnd-navy/40 border-dnd-border hover:border-dnd-gold/40'
                                    }`}
                            >
                                <div className={`w-10 h-10 rounded bg-gray-900 border flex items-center justify-center text-xl overflow-hidden ${selectedIds.includes(member.id) ? 'border-dnd-gold' : 'border-dnd-border'
                                    }`}>
                                    {member.tokenImage ? <img src={member.tokenImage} className="w-full h-full object-cover" /> : <span>🛡️</span>}
                                </div>
                                <div className="flex-1">
                                    <div className={`font-bold text-sm ${selectedIds.includes(member.id) ? 'text-dnd-gold' : 'text-white group-hover:text-dnd-gold'}`}>
                                        {member.name}
                                        {member.id === characterId && <span className="ml-2 text-[8px] text-dnd-muted uppercase font-normal">(You)</span>}
                                    </div>
                                    <div className="text-[10px] text-dnd-muted uppercase tracking-wider">
                                        Level {member.classes?.[0]?.level || member.level} {member.classes?.[0]?.name || member.class}
                                    </div>
                                </div>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedIds.includes(member.id) ? 'bg-dnd-gold border-dnd-gold' : 'border-dnd-muted/30 group-hover:border-dnd-gold/50'
                                    }`}>
                                    {selectedIds.includes(member.id) && <span className="text-dnd-navy text-[10px] font-bold">✓</span>}
                                </div>
                            </div>
                        ))
                    )}
                </div>
                {/* Auto Resolve Toggle */}
                <div className="px-4 pb-2">
                    <label className="flex items-center gap-3 cursor-pointer p-3 bg-dnd-navy/30 rounded border border-dnd-border hover:border-dnd-blue/30 transition-colors">
                        <input
                            type="checkbox"
                            checked={useAutoResolve}
                            onChange={e => setUseAutoResolve(e.target.checked)}
                            className="accent-dnd-blue w-4 h-4"
                        />
                        <div>
                            <span className="text-sm font-bold block text-dnd-blue drop-shadow-md">✨ Auto-Resolve with AI</span>
                            <span className="text-[10px] text-dnd-muted leading-tight block">
                                If checked, the AI will parse the ability/spell text and apply stat changes.
                            </span>
                        </div>
                    </label>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-dnd-gold/10 bg-dnd-navy/20 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 rounded border border-dnd-border text-dnd-muted hover:text-white hover:bg-white/5 transition-all uppercase text-[10px] font-bold tracking-widest"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="flex-1 px-4 py-2 rounded font-bold uppercase text-[10px] tracking-widest transition-all bg-dnd-gold text-dnd-navy hover:shadow-[0_0_20px_rgba(210,160,23,0.4)]"
                    >
                        Confirm Action {selectedIds.length > 0 ? `(${selectedIds.length} Targets)` : ''}
                    </button>
                </div>
            </div>
        </div>
    );
}
