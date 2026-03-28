import React, { useState, useEffect } from 'react';

export default function RecapArchive({ onClose }) {
    const [recaps, setRecaps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRecap, setSelectedRecap] = useState(null);

    useEffect(() => {
        fetch('/api/recaps')
            .then(res => res.json())
            .then(data => {
                setRecaps(data);
                setLoading(false);
            });
    }, []);

    return (
        <div className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
            <div className="bg-dnd-surface border border-dnd-border w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-xl shadow-2xl flex flex-col animate-in zoom-in-95">
                
                {/* Header */}
                <div className="p-6 border-b border-dnd-border bg-dnd-navy/50 flex justify-between items-center text-white">
                    <h2 className="fantasy-heading text-2xl text-dnd-gold m-0">📜 The Grand Archive</h2>
                    <button onClick={onClose} className="text-dnd-muted hover:text-white transition-colors text-xl">✕</button>
                </div>

                <div className="flex-1 overflow-hidden grid grid-cols-12">
                    
                    {/* Left: Recap List */}
                    <div className="col-span-12 lg:col-span-4 p-6 overflow-y-auto bg-dnd-surface2/20 border-r border-dnd-border">
                        <h3 className="text-[10px] font-bold text-dnd-muted uppercase tracking-[0.2em] mb-6 text-white">Session Chronicles</h3>
                        {loading ? (
                            <div className="text-center py-10 text-dnd-muted animate-pulse italic">Consulting the scribes...</div>
                        ) : recaps.length === 0 ? (
                            <div className="text-center py-10 text-dnd-muted italic opacity-30">The scrolls are empty.</div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {recaps.map(recap => (
                                    <button 
                                        key={recap.id} 
                                        onClick={() => setSelectedRecap(recap)}
                                        className={`p-4 text-left rounded border transition-all hover:border-dnd-gold/50 group ${selectedRecap?.id === recap.id ? 'bg-dnd-gold/5 border-dnd-gold shadow-lg shadow-dnd-gold/5' : 'bg-dnd-navy border-dnd-border'}`}
                                    >
                                        <div className="text-xs font-bold text-white mb-1 group-hover:text-dnd-gold transition-colors">
                                            {new Date(recap.session_date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                        </div>
                                        <div className="text-[9px] text-dnd-muted uppercase tracking-widest">Adventure #{recap.id}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right: Detailed Recap */}
                    <div className="col-span-12 lg:col-span-8 p-10 overflow-y-auto bg-black/20 flex flex-col items-center">
                        {selectedRecap ? (
                            <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="text-center mb-10">
                                    <div className="text-dnd-gold text-[10px] font-bold uppercase tracking-[0.5em] mb-2">Chronicle Entry</div>
                                    <h3 className="fantasy-heading text-3xl text-white underline decoration-dnd-gold/30 underline-offset-8">Adventure Conclusion</h3>
                                </div>

                                <div className="text-lg text-dnd-text leading-relaxed font-serif italic whitespace-pre-wrap px-6">
                                    {selectedRecap.recap_text}
                                </div>

                                <div className="mt-12 flex justify-center opacity-30">
                                    <div className="w-32 h-px bg-gradient-to-r from-transparent via-dnd-gold to-transparent"></div>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-dnd-muted opacity-20 italic">
                                <div className="text-7xl mb-4">📖</div>
                                <p className="text-xl font-fantasy text-center">Select a chronicle to read</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
