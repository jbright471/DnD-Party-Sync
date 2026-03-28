import React, { useState, useEffect } from 'react';

/**
 * NPCManager Component
 * Searchable directory for non-combat characters (shopkeepers, quest-givers, etc.)
 * Features: Search, Public vs Secret descriptions, and stats.
 */
export default function NPCManager({ isDm, onClose }) {
    const [npcs, setNpcs] = useState([]);
    const [search, setSearch] = useState('');
    const [selectedNpc, setSelectedNpc] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        name: '', race: '', description: '', occupation: '', location: '', secrets: '', notes: ''
    });

    useEffect(() => {
        fetchNpcs();
    }, []);

    const fetchNpcs = async () => {
        try {
            const res = await fetch('/api/npcs');
            const data = await res.json();
            setNpcs(data);
        } catch (err) { console.error(err); }
    };

    const handleSave = async () => {
        if (!formData.name) return alert("Name is required.");
        const method = selectedNpc?.id ? 'PATCH' : 'POST';
        const url = selectedNpc?.id ? `/api/npcs/${selectedNpc.id}` : '/api/npcs';

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                fetchNpcs();
                setIsEditing(false);
                if (!selectedNpc?.id) setFormData({ name: '', race: '', description: '', occupation: '', location: '', secrets: '', notes: '' });
            }
        } catch (err) { console.error(err); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Delete this NPC permanently?")) return;
        try {
            const res = await fetch(`/api/npcs/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setNpcs(npcs.filter(n => n.id !== id));
                setSelectedNpc(null);
            }
        } catch (err) { console.error(err); }
    };

    const filteredNpcs = npcs.filter(n => 
        n.name.toLowerCase().includes(search.toLowerCase()) || 
        n.occupation.toLowerCase().includes(search.toLowerCase()) ||
        n.location.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={onClose}>
            <div className="bg-dnd-surface border border-dnd-border w-full max-w-5xl h-[85vh] rounded-lg shadow-2xl flex overflow-hidden" onClick={e => e.stopPropagation()}>
                
                {/* Sidebar: NPC List */}
                <div className="w-64 md:w-80 bg-dnd-navy border-r border-dnd-border flex flex-col shrink-0">
                    <div className="p-4 border-b border-dnd-border">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-dnd-gold font-fantasy text-lg m-0 uppercase tracking-widest">NPC Archive</h3>
                            {isDm && (
                                <button 
                                    onClick={() => { setSelectedNpc(null); setFormData({ name: '', race: '', description: '', occupation: '', location: '', secrets: '', notes: '' }); setIsEditing(true); }}
                                    className="w-8 h-8 rounded-full bg-dnd-gold/20 text-dnd-gold hover:bg-dnd-gold hover:text-dnd-navy transition-all flex items-center justify-center text-xl font-bold"
                                >+</button>
                            )}
                        </div>
                        <input 
                            type="text" 
                            placeholder="Search names, jobs, locations..." 
                            className="w-full bg-black/40 border border-dnd-border rounded px-3 py-2 text-xs text-white focus:border-dnd-gold outline-none"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {filteredNpcs.map(n => (
                            <button 
                                key={n.id} 
                                onClick={() => { setSelectedNpc(n); setFormData(n); setIsEditing(false); }}
                                className={`w-full p-4 text-left border-b border-white/5 transition-all hover:bg-white/5 group ${selectedNpc?.id === n.id ? 'bg-dnd-gold/10 border-l-4 border-l-dnd-gold' : ''}`}
                            >
                                <div className="text-sm font-bold text-white group-hover:text-dnd-gold">{n.name}</div>
                                <div className="text-[10px] text-dnd-muted uppercase tracking-wider mt-1">{n.occupation || 'Wanderer'} • {n.location || 'Unknown'}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main View: NPC Details */}
                <div className="flex-1 bg-dnd-surface flex flex-col overflow-hidden relative">
                    <button className="absolute top-4 right-4 text-dnd-muted hover:text-white text-xl z-10" onClick={onClose}>✕</button>

                    {!selectedNpc && !isEditing ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-dnd-muted opacity-40 italic">
                            <span className="text-6xl mb-4">📜</span>
                            <p>Select an NPC from the archive or create a new one.</p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            {isEditing ? (
                                <div className="max-w-2xl flex flex-col gap-4">
                                    <h2 className="fantasy-heading text-3xl text-dnd-gold mb-4">{selectedNpc ? 'Edit NPC' : 'Register New NPC'}</h2>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-dnd-muted uppercase font-bold">Full Name</label>
                                            <input type="text" className="bg-black/40 border border-dnd-border rounded px-3 py-2 text-white" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-dnd-muted uppercase font-bold">Race / Ancestry</label>
                                            <input type="text" className="bg-black/40 border border-dnd-border rounded px-3 py-2 text-white" value={formData.race} onChange={e => setFormData({...formData, race: e.target.value})} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-dnd-muted uppercase font-bold">Occupation / Role</label>
                                            <input type="text" className="bg-black/40 border border-dnd-border rounded px-3 py-2 text-white" value={formData.occupation} onChange={e => setFormData({...formData, occupation: e.target.value})} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-dnd-muted uppercase font-bold">Current Location</label>
                                            <input type="text" className="bg-black/40 border border-dnd-border rounded px-3 py-2 text-white" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-dnd-muted uppercase font-bold">Public Description (Players see this)</label>
                                        <textarea rows="3" className="bg-black/40 border border-dnd-border rounded px-3 py-2 text-white" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                                    </div>
                                    {isDm && (
                                        <>
                                            <div className="flex flex-col gap-1 p-3 bg-red-900/10 border border-red-900/30 rounded-lg">
                                                <label className="text-[10px] text-dnd-red uppercase font-bold">DM Secret (Hidden from Players)</label>
                                                <textarea rows="3" className="bg-black/20 border border-red-900/20 rounded px-3 py-2 text-white italic" value={formData.secrets} onChange={e => setFormData({...formData, secrets: e.target.value})} placeholder="Dark secrets, true motives, or hidden connections..." />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[10px] text-dnd-muted uppercase font-bold">Campaign Notes</label>
                                                <textarea rows="3" className="bg-black/40 border border-dnd-border rounded px-3 py-2 text-white" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Past interactions with the party, current mood, etc." />
                                            </div>
                                        </>
                                    )}
                                    <div className="flex gap-3 mt-6">
                                        <button onClick={handleSave} className="bg-dnd-gold text-dnd-navy px-6 py-2 rounded font-bold uppercase tracking-widest hover:scale-105 transition-transform">Save Scroll</button>
                                        <button onClick={() => setIsEditing(false)} className="px-6 py-2 text-dnd-muted hover:text-white transition-colors uppercase font-bold text-xs">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="max-w-3xl animate-in fade-in slide-in-from-left-4 duration-500">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <h1 className="fantasy-heading text-5xl text-white m-0 leading-none">{selectedNpc.name}</h1>
                                            <div className="flex gap-3 mt-3">
                                                <span className="text-dnd-gold text-xs font-bold uppercase tracking-[0.2em]">{selectedNpc.race}</span>
                                                <span className="text-dnd-muted text-xs uppercase tracking-[0.2em]">|</span>
                                                <span className="text-dnd-blue text-xs font-bold uppercase tracking-[0.2em]">{selectedNpc.occupation}</span>
                                            </div>
                                        </div>
                                        {isDm && (
                                            <div className="flex gap-2">
                                                <button onClick={() => setIsEditing(true)} className="w-10 h-10 rounded border border-dnd-border bg-dnd-navy text-dnd-muted hover:text-white hover:border-dnd-gold transition-all flex items-center justify-center">✎</button>
                                                <button onClick={() => handleDelete(selectedNpc.id)} className="w-10 h-10 rounded border border-dnd-border bg-dnd-navy text-dnd-muted hover:text-dnd-red hover:border-dnd-red transition-all flex items-center justify-center">🗑️</button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-10">
                                        <div className="md:col-span-2 space-y-8">
                                            <section>
                                                <h4 className="text-[10px] text-dnd-gold uppercase font-bold tracking-widest mb-4 border-b border-dnd-gold/20 pb-1">Physical Description</h4>
                                                <p className="text-sm text-dnd-text leading-relaxed font-serif whitespace-pre-wrap">{selectedNpc.description || 'No description provided.'}</p>
                                            </section>

                                            {isDm && selectedNpc.secrets && (
                                                <section className="bg-red-950/20 border-l-4 border-l-dnd-red p-6 rounded shadow-inner">
                                                    <h4 className="text-[10px] text-dnd-red uppercase font-bold tracking-widest mb-4">⚠️ DM Secrets</h4>
                                                    <p className="text-sm text-white/90 italic leading-relaxed font-serif whitespace-pre-wrap">{selectedNpc.secrets}</p>
                                                </section>
                                            )}

                                            {isDm && selectedNpc.notes && (
                                                <section>
                                                    <h4 className="text-[10px] text-dnd-muted uppercase font-bold tracking-widest mb-4 border-b border-dnd-border pb-1">Master's Notes</h4>
                                                    <p className="text-xs text-dnd-muted leading-relaxed whitespace-pre-wrap">{selectedNpc.notes}</p>
                                                </section>
                                            )}
                                        </div>

                                        <aside className="space-y-6">
                                            <div className="bg-dnd-navy/40 border border-dnd-border p-5 rounded-lg shadow-xl">
                                                <h4 className="text-[10px] text-dnd-muted uppercase font-bold tracking-widest mb-4 text-center">Location Data</h4>
                                                <div className="flex flex-col items-center gap-2">
                                                    <span className="text-3xl">📍</span>
                                                    <span className="text-white font-fantasy text-center">{selectedNpc.location || 'Unknown'}</span>
                                                </div>
                                            </div>

                                            <div className="bg-dnd-navy/40 border border-dnd-border p-5 rounded-lg shadow-xl">
                                                <h4 className="text-[10px] text-dnd-muted uppercase font-bold tracking-widest mb-4 text-center">Social Role</h4>
                                                <div className="flex flex-col items-center gap-2">
                                                    <span className="text-3xl">🛡️</span>
                                                    <span className="text-white font-fantasy text-center">{selectedNpc.occupation || 'Civilian'}</span>
                                                </div>
                                            </div>
                                        </aside>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                .font-fantasy { font-family: 'Cinzel', serif; }
                .fantasy-heading { font-family: 'Cinzel', serif; }
            `}} />
        </div>
    );
}
