import React, { useState, useEffect } from 'react';

export default function EncounterBuilderModal({ onClose, onStartEncounter }) {
    const [encounters, setEncounters] = useState([]);
    const [isCreating, setIsCreating] = useState(false);
    const [newEncounter, setNewEncounter] = useState({ name: '', monsters: [] });
    const [monsterInput, setMonsterForm] = useState({ name: '', hp: 20, ac: 12, initiative_mod: 0, count: 1 });

    useEffect(() => {
        fetchEncounters();
    }, []);

    const fetchEncounters = async () => {
        const res = await fetch('/api/encounters');
        const data = await res.json();
        setEncounters(data);
    };

    const addMonsterToEncounter = () => {
        if (!monsterInput.name) return;
        setNewEncounter({
            ...newEncounter,
            monsters: [...newEncounter.monsters, { ...monsterInput }]
        });
        setMonsterForm({ name: '', hp: 20, ac: 12, initiative_mod: 0, count: 1 });
    };

    const handleSaveEncounter = async () => {
        if (!newEncounter.name || newEncounter.monsters.length === 0) return;
        const res = await fetch('/api/encounters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newEncounter)
        });
        if (res.ok) {
            setIsCreating(false);
            setNewEncounter({ name: '', monsters: [] });
            fetchEncounters();
        }
    };

    const handleDeleteEncounter = async (id) => {
        await fetch(`/api/encounters/${id}`, { method: 'DELETE' });
        fetchEncounters();
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-dnd-surface border border-dnd-border w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-lg shadow-2xl flex flex-col">
                <div className="p-6 border-b border-dnd-border flex justify-between items-center bg-dnd-navy/30">
                    <h2 className="fantasy-heading text-2xl text-dnd-gold m-0 text-shadow-gold">⚔️ Encounter Library</h2>
                    <button onClick={onClose} className="text-dnd-muted hover:text-white text-xl">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {isCreating ? (
                        <div className="flex flex-col gap-6 animate-in fade-in duration-300">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-dnd-gold tracking-widest block mb-2">Encounter Name</label>
                                <input 
                                    type="text" 
                                    value={newEncounter.name} 
                                    onChange={e => setNewEncounter({...newEncounter, name: e.target.value})}
                                    className="w-full bg-dnd-navy border border-dnd-border rounded p-3 text-white outline-none focus:border-dnd-gold" 
                                    placeholder="e.g. Ambush at the Old Oak"
                                />
                            </div>

                            <div className="bg-dnd-navy/50 border border-dnd-border p-4 rounded-lg">
                                <h4 className="text-xs font-bold text-dnd-muted uppercase mb-4 tracking-tighter">Add Monster to Group</h4>
                                <div className="grid grid-cols-12 gap-3 items-end">
                                    <div className="col-span-5">
                                        <input type="text" placeholder="Monster Name" value={monsterInput.name} onChange={e => setMonsterForm({...monsterInput, name: e.target.value})} className="w-full bg-dnd-surface border border-dnd-border rounded px-3 py-2 text-sm text-white" />
                                    </div>
                                    <div className="col-span-2">
                                        <input type="number" placeholder="HP" value={monsterInput.hp} onChange={e => setMonsterForm({...monsterInput, hp: parseInt(e.target.value)})} className="w-full bg-dnd-surface border border-dnd-border rounded px-3 py-2 text-sm text-white" />
                                    </div>
                                    <div className="col-span-2">
                                        <input type="number" placeholder="Init" value={monsterInput.initiative_mod} onChange={e => setMonsterForm({...monsterInput, initiative_mod: parseInt(e.target.value)})} className="w-full bg-dnd-surface border border-dnd-border rounded px-3 py-2 text-sm text-white" />
                                    </div>
                                    <div className="col-span-2">
                                        <input type="number" placeholder="Qty" value={monsterInput.count} onChange={e => setMonsterForm({...monsterInput, count: parseInt(e.target.value)})} className="w-full bg-dnd-surface border border-dnd-border rounded px-3 py-2 text-sm text-white" />
                                    </div>
                                    <div className="col-span-1">
                                        <button type="button" onClick={addMonsterToEncounter} className="w-full h-[38px] bg-dnd-gold text-dnd-navy rounded font-bold hover:bg-white transition-colors">+</button>
                                    </div>
                                </div>

                                <div className="mt-4 flex flex-col gap-2">
                                    {newEncounter.monsters.map((m, i) => (
                                        <div key={i} className="flex justify-between items-center bg-dnd-surface p-2 rounded border border-white/5 text-xs">
                                            <span className="text-dnd-text font-bold">{m.count}x {m.name}</span>
                                            <span className="text-dnd-muted italic">HP: {m.hp} | Init: +{m.initiative_mod}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => setIsCreating(false)} className="flex-1 btn-secondary py-3 uppercase tracking-widest text-xs font-bold">Back to List</button>
                                <button onClick={handleSaveEncounter} className="flex-1 btn-primary py-3 uppercase tracking-widest text-xs font-bold shadow-lg shadow-dnd-gold/10">Save Encounter</button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <button onClick={() => setIsCreating(true)} className="w-full border-2 border-dashed border-dnd-border p-4 rounded-lg text-dnd-muted hover:text-dnd-gold hover:border-dnd-gold transition-all font-bold uppercase tracking-widest text-xs mb-4">
                                + Create New Encounter Group
                            </button>

                            {encounters.length === 0 ? (
                                <div className="text-center py-10 text-dnd-muted italic">No encounters saved yet.</div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3">
                                    {encounters.map(enc => (
                                        <div key={enc.id} className="bg-dnd-navy border border-dnd-border p-4 rounded-lg flex justify-between items-center group hover:border-dnd-gold/50 transition-all shadow-xl">
                                            <div>
                                                <h4 className="text-lg font-bold text-white mb-1 group-hover:text-dnd-gold transition-colors font-fantasy">{enc.name}</h4>
                                                <p className="text-xs text-dnd-muted">
                                                    {enc.monsters.map(m => `${m.count}x ${m.name}`).join(', ')}
                                                </p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => onStartEncounter(enc.id)}
                                                    className="bg-dnd-gold/10 text-dnd-gold border border-dnd-gold/30 px-4 py-2 rounded text-[10px] font-bold uppercase tracking-widest hover:bg-dnd-gold hover:text-dnd-navy transition-all"
                                                >
                                                    Start Combat
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteEncounter(enc.id)}
                                                    className="text-dnd-muted hover:text-dnd-red p-2"
                                                >
                                                    🗑
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
