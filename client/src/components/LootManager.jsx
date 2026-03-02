import React, { useState } from 'react';
import socket from '../socket';

export default function LootManager({ party, onClose }) {
    const [lootContext, setLootContext] = useState('');
    const [generatedItems, setGeneratedItems] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedCharId, setSelectedCharId] = useState('');

    const handleGenerate = async () => {
        if (!lootContext.trim()) return;
        setIsGenerating(true);
        try {
            const res = await fetch('/api/loot/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ context: lootContext })
            });
            const items = await res.json();
            setGeneratedItems(items);
        } catch (err) {
            alert("Loot generation failed.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGive = async (item) => {
        if (!selectedCharId) {
            alert("Select a character first!");
            return;
        }
        try {
            const res = await fetch('/api/loot/give', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterId: selectedCharId, item })
            });
            if (res.ok) {
                socket.emit('refresh_party');
                alert(`Gave ${item.name} to ${party.find(p => p.id == selectedCharId)?.name}`);
            }
        } catch (err) {
            alert("Failed to give item.");
        }
    };

    const handleArchive = async (item) => {
        try {
            const res = await fetch('/api/loot/archive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item })
            });
            if (res.ok) {
                alert(`${item.name} saved to Homebrew Library!`);
            }
        } catch (err) {
            alert("Failed to archive item.");
        }
    };

    return (
        <div className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
            <div className="bg-dnd-surface border border-dnd-border w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-xl shadow-2xl flex flex-col animate-in zoom-in-95">
                
                {/* Header */}
                <div className="p-6 border-b border-dnd-border bg-dnd-navy/50 flex justify-between items-center text-white">
                    <h2 className="fantasy-heading text-2xl text-dnd-gold m-0">💰 Loot Generator</h2>
                    <button onClick={onClose} className="text-dnd-muted hover:text-white transition-colors text-xl">✕</button>
                </div>

                <div className="flex-1 overflow-hidden grid grid-cols-12">
                    
                    {/* Left: Input & Config */}
                    <div className="col-span-12 lg:col-span-4 p-6 border-r border-dnd-border bg-black/20 text-white">
                        <h3 className="text-[10px] font-bold text-dnd-muted uppercase tracking-[0.2em] mb-6">Generation Context</h3>
                        <div className="flex flex-col gap-4">
                            <textarea 
                                placeholder="e.g. Inside a dusty chest in a vampire's crypt..."
                                value={lootContext}
                                onChange={e => setLootContext(e.target.value)}
                                className="bg-dnd-navy border border-dnd-border rounded p-4 text-xs text-white outline-none focus:border-dnd-gold h-48 resize-none"
                            ></textarea>
                            
                            <button 
                                onClick={handleGenerate}
                                disabled={isGenerating || !lootContext.trim()}
                                className={`w-full py-4 rounded-lg font-bold uppercase tracking-[0.2em] shadow-xl transition-all ${
                                    isGenerating ? 'bg-dnd-border text-dnd-muted cursor-wait' : 'bg-dnd-gold/20 text-dnd-gold border border-dnd-gold/40 hover:bg-dnd-gold hover:text-dnd-navy'
                                }`}
                            >
                                {isGenerating ? 'Forging Loot...' : 'Generate Items'}
                            </button>

                            <div className="mt-6 pt-6 border-t border-dnd-border/50">
                                <label className="text-[10px] uppercase font-bold text-dnd-muted block mb-2 tracking-widest">Select Target Player</label>
                                <select 
                                    value={selectedCharId}
                                    onChange={e => setSelectedCharId(e.target.value)}
                                    className="w-full bg-dnd-navy border border-dnd-border rounded px-3 py-2 text-sm text-white focus:border-dnd-gold outline-none"
                                >
                                    <option value="">Choose Adventurer...</option>
                                    {party.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Right: Results */}
                    <div className="col-span-12 lg:col-span-8 p-6 overflow-y-auto bg-dnd-surface2/30">
                        <h3 className="text-[10px] font-bold text-dnd-muted uppercase tracking-[0.2em] mb-6 text-white">Generated Hoard</h3>
                        {generatedItems.length === 0 ? (
                            <div className="h-64 flex flex-col items-center justify-center text-dnd-muted italic opacity-30">
                                <div className="text-5xl mb-2">💎</div>
                                <p>No items forged yet.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {generatedItems.map((item, idx) => (
                                    <div key={idx} className="bg-dnd-navy border border-dnd-border rounded-lg p-5 group hover:border-dnd-gold/50 transition-all animate-in slide-in-from-right-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h4 className="text-lg font-bold text-dnd-gold">{item.name}</h4>
                                                <span className="text-[10px] bg-dnd-surface px-2 py-0.5 rounded text-dnd-muted uppercase font-bold tracking-tighter border border-white/5">{item.rarity} {item.type}</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => handleGive(item)}
                                                    className="bg-dnd-green/10 text-dnd-green border border-dnd-green/30 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest hover:bg-dnd-green hover:text-white transition-all"
                                                >Give</button>
                                                <button 
                                                    onClick={() => handleArchive(item)}
                                                    className="bg-dnd-gold/10 text-dnd-gold border border-dnd-gold/30 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest hover:bg-dnd-gold hover:text-dnd-navy transition-all"
                                                >Archive</button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-dnd-text leading-relaxed italic">"{item.description}"</p>
                                        
                                        {item.stats && (item.stats.acBonus > 0 || item.stats.damage || Object.keys(item.stats.statBonuses || {}).length > 0) && (
                                            <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap gap-2">
                                                {item.stats.acBonus > 0 && <span className="text-[9px] bg-black text-dnd-gold border border-dnd-gold/30 px-2 py-0.5 rounded uppercase font-bold">+{item.stats.acBonus} AC</span>}
                                                {item.stats.damage && <span className="text-[9px] bg-black text-dnd-red border border-dnd-red/30 px-2 py-0.5 rounded uppercase font-bold">{item.stats.damage} Damage</span>}
                                                {Object.entries(item.stats.statBonuses || {}).map(([s, b]) => (
                                                    <span key={s} className="text-[9px] bg-black text-dnd-blue border border-dnd-blue/30 px-2 py-0.5 rounded uppercase font-bold">+{b} {s}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
