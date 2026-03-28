import React, { useState, useEffect } from 'react';
import socket from '../socket';

export default function QuestTracker({ isDm }) {
    const [quests, setQuests] = useState([]);
    const [isCreating, setIsCreating] = useState(false);
    const [newQuest, setNewQuest] = useState({ title: '', description: '', dm_secrets: '', rewards: '', is_public: 1 });

    useEffect(() => {
        fetchQuests();
        socket.on('refresh_quests', fetchQuests);
        return () => socket.off('refresh_quests', fetchQuests);
    }, [isDm]);

    const fetchQuests = async () => {
        const res = await fetch(`/api/quests?isDm=${isDm}`);
        const data = await res.json();
        setQuests(data);
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        const res = await fetch('/api/quests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newQuest)
        });
        if (res.ok) {
            setIsCreating(false);
            setNewQuest({ title: '', description: '', dm_secrets: '', rewards: '', is_public: 1 });
            fetchQuests();
            socket.emit('refresh_quests_global');
        }
    };

    const updateStatus = async (id, status) => {
        await fetch(`/api/quests/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        fetchQuests();
        socket.emit('refresh_quests_global');
    };

    return (
        <div className="flex flex-col h-full bg-dnd-surface rounded-lg border border-dnd-border overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-dnd-border bg-dnd-navy/50 flex justify-between items-center text-white">
                <h3 className="fantasy-heading text-xl text-dnd-gold m-0">📜 Quest Log</h3>
                {isDm && (
                    <button 
                        onClick={() => setIsCreating(true)}
                        className="bg-dnd-gold/10 text-dnd-gold border border-dnd-gold/30 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest hover:bg-dnd-gold hover:text-dnd-navy transition-all"
                    >+ New Quest</button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                {isCreating && (
                    <form onSubmit={handleCreate} className="bg-dnd-navy p-4 rounded-lg border border-dnd-gold/20 animate-in slide-in-from-top-4">
                        <div className="flex flex-col gap-3">
                            <input required placeholder="Quest Title" value={newQuest.title} onChange={e => setNewQuest({...newQuest, title: e.target.value})} className="bg-dnd-surface border border-dnd-border rounded p-2 text-sm text-white outline-none focus:border-dnd-gold" />
                            <textarea placeholder="Public Description" value={newQuest.description} onChange={e => setNewQuest({...newQuest, description: e.target.value})} className="bg-dnd-surface border border-dnd-border rounded p-2 text-xs text-white outline-none focus:border-dnd-gold h-20" />
                            <textarea placeholder="DM Secrets (Hidden from Players)" value={newQuest.dm_secrets} onChange={e => setNewQuest({...newQuest, dm_secrets: e.target.value})} className="bg-black/20 border border-dnd-red/20 rounded p-2 text-xs text-dnd-text outline-none focus:border-dnd-red h-20" />
                            <input placeholder="Rewards" value={newQuest.rewards} onChange={e => setNewQuest({...newQuest, rewards: e.target.value})} className="bg-dnd-surface border border-dnd-border rounded p-2 text-xs text-white outline-none" />
                            <div className="flex items-center gap-2">
                                <input type="checkbox" checked={newQuest.is_public} onChange={e => setNewQuest({...newQuest, is_public: e.target.checked ? 1 : 0})} className="accent-dnd-gold" />
                                <span className="text-[10px] text-dnd-muted uppercase font-bold">Publicly Visible</span>
                            </div>
                            <div className="flex gap-2 mt-2">
                                <button type="button" onClick={() => setIsCreating(false)} className="flex-1 py-2 border border-dnd-border text-dnd-muted text-[10px] font-bold uppercase rounded">Cancel</button>
                                <button type="submit" className="flex-1 py-2 bg-dnd-gold text-dnd-navy text-[10px] font-bold uppercase rounded">Archive Quest</button>
                            </div>
                        </div>
                    </form>
                )}

                {quests.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-dnd-muted italic opacity-30">
                        <div className="text-5xl mb-2">📜</div>
                        <p>The log is empty.</p>
                    </div>
                ) : (
                    quests.map(quest => (
                        <div key={quest.id} className={`bg-dnd-navy border rounded-lg p-4 transition-all ${quest.status === 'completed' ? 'opacity-60 border-dnd-green/30' : quest.status === 'failed' ? 'opacity-60 border-dnd-red/30' : 'border-dnd-border'}`}>
                            <div className="flex justify-between items-start mb-2 text-white">
                                <div>
                                    <h4 className={`text-base font-bold font-fantasy ${quest.status === 'completed' ? 'line-through text-dnd-green' : quest.status === 'failed' ? 'line-through text-dnd-red' : 'text-dnd-gold'}`}>{quest.title}</h4>
                                    <span className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded border ${quest.status === 'active' ? 'bg-dnd-gold/10 text-dnd-gold border-dnd-gold/20' : quest.status === 'completed' ? 'bg-dnd-green/10 text-dnd-green border-dnd-green/20' : 'bg-dnd-red/10 text-dnd-red border-dnd-red/20'}`}>{quest.status}</span>
                                </div>
                                {isDm && (
                                    <div className="flex gap-1">
                                        {quest.status === 'active' && (
                                            <>
                                                <button onClick={() => updateStatus(quest.id, 'completed')} className="bg-dnd-green/10 text-dnd-green border border-dnd-green/20 px-2 py-1 rounded text-[8px] font-bold uppercase">Success</button>
                                                <button onClick={() => updateStatus(quest.id, 'failed')} className="bg-dnd-red/10 text-dnd-red border border-dnd-red/20 px-2 py-1 rounded text-[8px] font-bold uppercase">Fail</button>
                                            </>
                                        )}
                                        {quest.status !== 'active' && (
                                            <button onClick={() => updateStatus(quest.id, 'active')} className="bg-white/5 text-dnd-muted border border-white/5 px-2 py-1 rounded text-[8px] font-bold uppercase">Reset</button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-dnd-text leading-relaxed mb-3">{quest.description}</p>
                            {quest.rewards && (
                                <div className="text-[10px] text-dnd-muted italic mb-2">💎 Reward: {quest.rewards}</div>
                            )}
                            {isDm && quest.dm_secrets && (
                                <div className="mt-3 p-2 bg-black/20 border-l-2 border-dnd-red rounded text-[10px] text-dnd-text italic leading-relaxed">
                                    <span className="text-dnd-red font-bold uppercase block mb-1">Secrets</span>
                                    {quest.dm_secrets}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
