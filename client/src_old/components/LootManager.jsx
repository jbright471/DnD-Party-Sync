import React, { useState } from 'react';

/**
 * LootManager Component
 * AI-powered loot generator using local Ollama.
 * Allows DM to generate, archive, and distribute unique items.
 */
export default function LootManager({ isDm, party, onClose }) {
    const [context, setContext] = useState('');
    const [generatedItems, setGeneratedItems] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [givingTo, setGivingTo] = useState(null); // { itemId, charId }

    const handleGenerate = async () => {
        if (!context) return alert("Please provide a location or context (e.g. 'Dragon's Hoard').");
        setIsGenerating(true);
        try {
            const res = await fetch('/api/loot/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ context })
            });
            const data = await res.json();
            setGeneratedItems(data);
        } catch (err) { console.error(err); }
        finally { setIsGenerating(false); }
    };

    const handleGive = async (item, characterId) => {
        try {
            const res = await fetch('/api/loot/give', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterId, item })
            });
            if (res.ok) {
                alert(`Gave ${item.name} to ${party.find(p => p.id == characterId)?.name}`);
                setGivingTo(null);
            }
        } catch (err) { console.error(err); }
    };

    const handleArchive = async (item) => {
        try {
            const res = await fetch('/api/loot/archive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item })
            });
            if (res.ok) alert(`${item.name} added to Homebrew Library.`);
        } catch (err) { console.error(err); }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={onClose}>
            <div className="bg-dnd-surface border border-dnd-border w-full max-w-4xl h-[80vh] rounded-lg shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="p-6 border-b border-dnd-border flex justify-between items-center bg-dnd-navy/50">
                    <h2 className="fantasy-heading text-2xl text-dnd-gold m-0">💰 Loot Forger</h2>
                    <button onClick={onClose} className="text-dnd-muted hover:text-white transition-colors text-xl">✕</button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left: Input */}
                    <div className="w-80 border-r border-dnd-border p-6 bg-black/20 flex flex-col gap-6">
                        <div>
                            <label className="text-[10px] text-dnd-muted uppercase font-bold tracking-widest block mb-2">Location / Source</label>
                            <textarea 
                                className="w-full bg-dnd-navy border border-dnd-border rounded p-3 text-sm text-white focus:border-dnd-gold outline-none h-32"
                                placeholder="e.g. 'Inside a dusty sarcophagus in a desert tomb' or 'Goblins in a damp forest'..."
                                value={context}
                                onChange={e => setContext(e.target.value)}
                            />
                        </div>
                        <button 
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className={`w-full py-3 rounded font-bold uppercase tracking-widest transition-all ${
                                isGenerating ? 'bg-dnd-border text-dnd-muted' : 'bg-dnd-gold/20 text-dnd-gold border border-dnd-gold/40 hover:bg-dnd-gold hover:text-dnd-navy'
                            }`}
                        >
                            {isGenerating ? 'Forging...' : 'Forge Loot'}
                        </button>
                        <p className="text-[10px] text-dnd-muted italic leading-relaxed">
                            Ollama will craft 1-3 unique items based on your description, including mechanical bonuses and flavor text.
                        </p>
                    </div>

                    {/* Right: Results */}
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-dnd-surface2/30">
                        {generatedItems.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-dnd-muted italic opacity-30">
                                <span className="text-6xl mb-4">💎</span>
                                <p>Provide context and forge some treasure.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-6">
                                {generatedItems.map((item, idx) => (
                                    <div key={idx} className="bg-dnd-navy/60 border border-dnd-border rounded-lg overflow-hidden group hover:border-dnd-gold/30 transition-all">
                                        <div className="p-4 flex justify-between items-start border-b border-white/5">
                                            <div>
                                                <h3 className="text-dnd-gold font-fantasy text-lg m-0">{item.name}</h3>
                                                <span className="text-[9px] text-dnd-muted uppercase tracking-widest">{item.rarity} {item.type}</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleArchive(item)} className="text-[9px] font-bold text-dnd-blue uppercase border border-dnd-blue/20 px-2 py-1 rounded hover:bg-dnd-blue/10">Archive</button>
                                                <div className="relative">
                                                    <button 
                                                        onClick={() => setGivingTo(givingTo === idx ? null : idx)}
                                                        className="text-[9px] font-bold text-dnd-green uppercase border border-dnd-green/20 px-2 py-1 rounded hover:bg-dnd-green/10"
                                                    >Give To...</button>
                                                    {givingTo === idx && (
                                                        <div className="absolute right-0 top-full mt-1 bg-dnd-surface border border-dnd-border rounded shadow-xl z-20 w-48 overflow-hidden animate-in slide-in-from-top-2">
                                                            {party.map(char => (
                                                                <button 
                                                                    key={char.id} 
                                                                    onClick={() => handleGive(item, char.id)}
                                                                    className="w-full text-left p-3 text-xs text-white hover:bg-dnd-gold hover:text-dnd-navy border-b border-white/5 last:border-0 transition-colors"
                                                                >
                                                                    {char.name}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-4">
                                            <p className="text-xs text-dnd-text italic leading-relaxed mb-4">"{item.description}"</p>
                                            {item.stats && Object.keys(item.stats).length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {item.stats.acBonus > 0 && <span className="text-[9px] bg-black/40 border border-dnd-gold/30 text-dnd-gold px-2 py-0.5 rounded font-bold">+{item.stats.acBonus} AC</span>}
                                                    {item.stats.damage && <span className="text-[9px] bg-black/40 border border-dnd-red/30 text-dnd-red px-2 py-0.5 rounded font-bold">⚔️ {item.stats.damage}</span>}
                                                    {Object.entries(item.stats.statBonuses || {}).map(([s, b]) => (
                                                        <span key={s} className="text-[9px] bg-black/40 border border-dnd-blue/30 text-dnd-blue px-2 py-0.5 rounded font-bold">+{b} {s}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
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
