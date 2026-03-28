import React, { useState } from 'react';
import socket from '../socket';

const PRESET_BUFFS = [
    { name: 'Bless', isConcentration: true, description: '+1d4 to attacks and saves' },
    { name: 'Haste', isConcentration: true, description: '+2 AC, Adv on DEX saves, extra action' },
    { name: 'Shield of Faith', isConcentration: true, description: '+2 AC' },
    { name: 'Mage Armor', isConcentration: false, description: 'AC becomes 13 + DEX' },
    { name: 'Bardic Inspiration', isConcentration: false, description: '+1d8 to one roll' },
    { name: 'Heroism', isConcentration: true, description: 'Immune to frightened, temporary HP' },
    { name: 'Guidance', isConcentration: true, description: '+1d4 to one ability check' }
];

export default function BuffManagerModal({ party, onClose }) {
    const [selectedTargets, setSelectedTargets] = useState([]);
    const [selectedBuff, setSelectedBuff] = useState(PRESET_BUFFS[0]);
    const [customName, setCustomName] = useState('');
    const [isConcentration, setIsConcentration] = useState(true);

    const toggleTarget = (id) => {
        setSelectedTargets(prev => 
            prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
        );
    };

    const handleApply = () => {
        if (selectedTargets.length === 0) return;
        
        const buffData = {
            name: customName || selectedBuff.name,
            isConcentration: isConcentration,
            sourceName: 'DM'
        };

        socket.emit('apply_buff', {
            characterIds: selectedTargets,
            buffData,
            actor: 'DM'
        });

        onClose();
    };

    return (
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-dnd-surface border border-dnd-border w-full max-w-2xl overflow-hidden rounded-lg shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-dnd-border bg-dnd-navy/50 flex justify-between items-center">
                    <h2 className="fantasy-heading text-xl text-dnd-blue m-0">✨ Enchantment Console</h2>
                    <button onClick={onClose} className="text-dnd-muted hover:text-white text-xl">✕</button>
                </div>

                <div className="p-6 flex flex-col gap-6">
                    {/* 1. Select Buff */}
                    <section>
                        <h4 className="text-[10px] uppercase font-bold text-dnd-muted mb-3 tracking-widest">1. Select Magic Effect</h4>
                        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 scrollbar-thin">
                            {PRESET_BUFFS.map(b => (
                                <button
                                    key={b.name}
                                    onClick={() => {
                                        setSelectedBuff(b);
                                        setCustomName('');
                                        setIsConcentration(b.isConcentration);
                                    }}
                                    className={`p-3 text-left rounded border transition-all ${
                                        selectedBuff?.name === b.name && !customName 
                                        ? 'bg-dnd-blue/20 border-dnd-blue shadow-[0_0_10px_rgba(88,166,255,0.2)]' 
                                        : 'bg-dnd-navy border-dnd-border hover:border-dnd-muted'
                                    }`}
                                >
                                    <div className="text-xs font-bold text-white">{b.name}</div>
                                    <div className="text-[9px] text-dnd-muted truncate">{b.description}</div>
                                </button>
                            ))}
                        </div>
                        <input 
                            type="text" 
                            placeholder="Or enter custom effect name..." 
                            value={customName}
                            onChange={e => {
                                setCustomName(e.target.value);
                                if (e.target.value) setSelectedBuff(null);
                            }}
                            className="w-full mt-3 bg-dnd-navy border border-dnd-border rounded px-3 py-2 text-sm text-white outline-none focus:border-dnd-blue"
                        />
                    </section>

                    {/* 2. Select Targets */}
                    <section>
                        <h4 className="text-[10px] uppercase font-bold text-dnd-muted mb-3 tracking-widest">2. Select Target Adventurers</h4>
                        <div className="flex flex-wrap gap-2">
                            {party.map(char => (
                                <button
                                    key={char.id}
                                    onClick={() => toggleTarget(char.id)}
                                    className={`px-4 py-2 rounded-full border text-xs font-bold transition-all ${
                                        selectedTargets.includes(char.id)
                                        ? 'bg-dnd-gold text-dnd-navy border-dnd-gold'
                                        : 'bg-dnd-navy text-dnd-muted border-dnd-border hover:border-dnd-muted'
                                    }`}
                                >
                                    {char.name}
                                </button>
                            ))}
                            <button 
                                onClick={() => setSelectedTargets(party.map(p => p.id))}
                                className="px-4 py-2 rounded-full border border-dashed border-dnd-border text-dnd-muted text-[10px] uppercase font-bold hover:border-dnd-gold hover:text-dnd-gold transition-all"
                            >Select All</button>
                        </div>
                    </section>

                    {/* 3. Settings */}
                    <div className="flex items-center gap-4 py-2 border-t border-dnd-border pt-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={isConcentration} 
                                onChange={e => setIsConcentration(e.target.checked)}
                                className="accent-dnd-blue"
                            />
                            <span className="text-xs text-dnd-text font-bold uppercase tracking-tighter">Requires Concentration</span>
                        </label>
                    </div>

                    <button 
                        onClick={handleApply}
                        disabled={selectedTargets.length === 0 || (!selectedBuff && !customName)}
                        className={`w-full py-4 rounded-lg font-bold uppercase tracking-[0.2em] shadow-xl transition-all ${
                            selectedTargets.length === 0 
                            ? 'bg-dnd-border text-dnd-muted cursor-not-allowed' 
                            : 'bg-dnd-blue/20 text-dnd-blue border border-dnd-blue/40 hover:bg-dnd-blue/30 shadow-dnd-blue/10'
                        }`}
                    >
                        Cast Spell / Apply Buff
                    </button>
                </div>
            </div>
        </div>
    );
}
