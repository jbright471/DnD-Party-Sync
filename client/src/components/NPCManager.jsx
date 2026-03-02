import React, { useState, useEffect } from 'react';
import socket from '../socket';

export default function NPCManager({ onClose }) {
    const [npcs, setNpcs] = useState([]);
    const [filter, setFilter] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [selectedNpc, setSelectedNpc] = useState(null);
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        fetchNpcs();
    }, []);

    const fetchNpcs = async () => {
        const res = await fetch('/api/npcs');
        const data = await res.json();
        setNpcs(data);
    };

    const handleGenerate = async () => {
        if (!aiPrompt.trim()) return;
        setIsGenerating(true);
        try {
            const res = await fetch('/api/npcs/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: aiPrompt })
            });
            const data = await res.json();
            
            // Auto-save the generated NPC
            await fetch('/api/npcs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: data.name,
                    race: data.race,
                    occupation: data.occupation,
                    location: data.location,
                    description: data.description,
                    secrets: data.secrets,
                    notes: data.notes,
                    stats_json: data.stats
                })
            });
            
            setAiPrompt('');
            fetchNpcs();
        } catch (err) {
            alert("AI Generation failed.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("Delete this NPC?")) return;
        await fetch(`/api/npcs/${id}`, { method: 'DELETE' });
        fetchNpcs();
    };

    const filtered = npcs.filter(n => 
        n.name.toLowerCase().includes(filter.toLowerCase()) || 
        n.location?.toLowerCase().includes(filter.toLowerCase()) ||
        n.occupation?.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
            <div className="bg-dnd-surface border border-dnd-border w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-xl shadow-2xl flex flex-col">
                
                {/* Header */}
                <div className="p-6 border-b border-dnd-border bg-dnd-navy/50 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <h2 className="fantasy-heading text-2xl text-dnd-gold m-0">👤 NPC Archive</h2>
                        <input 
                            type="text" 
                            placeholder="Search names, locations, roles..." 
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            className="bg-dnd-navy border border-dnd-border rounded px-4 py-1.5 text-xs text-white focus:border-dnd-gold outline-none w-64"
                        />
                    </div>
                    <button onClick={onClose} className="text-dnd-muted hover:text-white transition-colors text-xl">✕</button>
                </div>

                <div className="flex-1 overflow-hidden grid grid-cols-12">
                    
                    {/* Left: NPC List */}
                    <div className="col-span-12 lg:col-span-8 p-6 overflow-y-auto bg-dnd-surface2/20 border-r border-dnd-border">
                        {filtered.length === 0 ? (
                            <div className="h-64 flex flex-col items-center justify-center text-dnd-muted opacity-30 italic">
                                <div className="text-5xl mb-2">👥</div>
                                <p>No NPCs found.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {filtered.map(npc => (
                                    <div 
                                        key={npc.id} 
                                        onClick={() => setSelectedNpc(npc)}
                                        className={`p-4 bg-dnd-navy border rounded-lg cursor-pointer transition-all hover:border-dnd-gold/50 group ${selectedNpc?.id === npc.id ? 'border-dnd-gold bg-dnd-gold/5 ring-1 ring-dnd-gold/20' : 'border-dnd-border'}`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h4 className="text-base font-bold text-white group-hover:text-dnd-gold transition-colors">{npc.name}</h4>
                                                <span className="text-[10px] text-dnd-gold uppercase font-bold tracking-tighter">{npc.race} • {npc.occupation}</span>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); handleDelete(npc.id); }} className="text-dnd-muted hover:text-dnd-red opacity-0 group-hover:opacity-100 transition-opacity">🗑</button>
                                        </div>
                                        <p className="text-[11px] text-dnd-muted line-clamp-2 italic">"{npc.description}"</p>
                                        <div className="mt-3 flex items-center gap-2 text-[9px] text-dnd-muted">
                                            <span>📍 {npc.location || 'Unknown'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right: NPC Detail / AI Gen */}
                    <div className="col-span-12 lg:col-span-4 flex flex-col bg-black/20">
                        {selectedNpc ? (
                            <div className="flex-1 p-6 overflow-y-auto animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="mb-6">
                                    <h3 className="fantasy-heading text-xl text-dnd-gold mb-1">{selectedNpc.name}</h3>
                                    <div className="text-xs text-dnd-muted italic mb-4">{selectedNpc.race} {selectedNpc.occupation}</div>
                                    
                                    <section className="mb-4">
                                        <h5 className="text-[9px] uppercase font-bold text-dnd-gold mb-1 tracking-widest">Description</h5>
                                        <p className="text-xs text-dnd-text leading-relaxed">{selectedNpc.description}</p>
                                    </section>

                                    <section className="mb-4 bg-dnd-red/5 border border-dnd-red/20 p-3 rounded">
                                        <h5 className="text-[9px] uppercase font-bold text-dnd-red mb-1 tracking-widest flex items-center gap-1">
                                            <span>🔒 DM Secret</span>
                                        </h5>
                                        <p className="text-xs text-dnd-text italic leading-relaxed">{selectedNpc.secrets || 'No secrets recorded.'}</p>
                                    </section>

                                    <section>
                                        <h5 className="text-[9px] uppercase font-bold text-dnd-muted mb-1 tracking-widest">Notes</h5>
                                        <p className="text-xs text-dnd-muted leading-relaxed whitespace-pre-wrap">{selectedNpc.notes}</p>
                                    </section>
                                </div>
                                <button onClick={() => setSelectedNpc(null)} className="w-full py-2 border border-dnd-border text-dnd-muted text-[10px] font-bold uppercase rounded hover:bg-white/5 transition-all">Back to Generator</button>
                            </div>
                        ) : (
                            <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">
                                <div className="text-center py-4">
                                    <div className="text-4xl mb-2">🔮</div>
                                    <h4 className="fantasy-heading text-lg text-white">NPC Weaver</h4>
                                    <p className="text-[10px] text-dnd-muted uppercase tracking-tighter">AI-Powered Character Generation</p>
                                </div>

                                <div className="flex-1 flex flex-col gap-4">
                                    <textarea 
                                        placeholder="e.g. A grumpy dwarven blacksmith who hates magic but loves cats..."
                                        value={aiPrompt}
                                        onChange={e => setAiPrompt(e.target.value)}
                                        className="flex-1 bg-dnd-navy border border-dnd-border rounded p-4 text-xs text-white outline-none focus:border-dnd-gold resize-none scrollbar-none"
                                    ></textarea>
                                    
                                    <button 
                                        onClick={handleGenerate}
                                        disabled={isGenerating || !aiPrompt.trim()}
                                        className={`w-full py-4 rounded-lg font-bold uppercase tracking-[0.2em] shadow-xl transition-all ${
                                            isGenerating ? 'bg-dnd-border text-dnd-muted cursor-wait' : 'bg-dnd-gold/20 text-dnd-gold border border-dnd-gold/40 hover:bg-dnd-gold hover:text-dnd-navy'
                                        }`}
                                    >
                                        {isGenerating ? 'Weaving NPC...' : 'Generate & Archive'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
