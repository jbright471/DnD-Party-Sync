import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket';

export default function ActionLog({ logs, party, approvalMode }) {
    const [filter, setFilter] = useState('all'); // 'all', 'mechanical', 'lore'
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, filter]);

    const handleResolve = (logId, approved) => {
        socket.emit('resolve_pending_action', { logId, approved });
    };

    const filteredLogs = logs.filter(log => {
        if (filter === 'all') return true;
        const isLore = log.actor === 'DM' && (log.action_description.includes('AI Generated') || log.action_description.length > 100);
        if (filter === 'lore') return isLore;
        if (filter === 'mechanical') return !isLore;
        return true;
    });

    return (
        <div className="flex flex-col h-full bg-dnd-surface overflow-hidden">
            {/* Filter Bar */}
            <div className="flex-none p-2 bg-black/20 border-b border-dnd-border flex gap-2 overflow-x-auto scrollbar-none">
                {['all', 'mechanical', 'lore'].map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-3 py-1 rounded text-[8px] font-bold uppercase tracking-widest transition-all ${
                            filter === f 
                            ? 'bg-dnd-gold text-dnd-navy border border-dnd-gold' 
                            : 'bg-dnd-navy text-dnd-muted border border-dnd-border hover:border-dnd-muted'
                        }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
                {filteredLogs.map((log) => {
                    const isPending = log.status === 'pending';
                    const isRejected = log.status === 'rejected';
                    
                    return (
                        <div 
                            key={log.id} 
                            className={`p-3 rounded-lg border leading-relaxed animate-in slide-in-from-left-2 duration-300 ${
                                isPending ? 'bg-dnd-gold/5 border-dnd-gold/30 border-dashed' :
                                isRejected ? 'bg-dnd-red/5 border-dnd-red/20 opacity-50' :
                                'bg-dnd-navy/40 border-dnd-border'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className={`text-[10px] font-bold uppercase tracking-tighter ${isPending ? 'text-dnd-gold' : 'text-dnd-muted'}`}>
                                    {log.actor}
                                </span>
                                <span className="text-[8px] text-dnd-muted/50 font-mono italic">
                                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            
                            <p className={`text-xs ${isRejected ? 'line-through text-dnd-muted' : 'text-dnd-text'}`}>
                                {log.action_description}
                            </p>

                            {isPending && approvalMode && (
                                <div className="mt-3 flex gap-2 border-t border-dnd-gold/20 pt-2">
                                    <button 
                                        onClick={() => handleResolve(log.id, true)}
                                        className="flex-1 bg-dnd-gold/20 text-dnd-gold text-[9px] font-bold py-1.5 rounded uppercase hover:bg-dnd-gold hover:text-dnd-navy transition-all"
                                    >Approve</button>
                                    <button 
                                        onClick={() => handleResolve(log.id, false)}
                                        className="flex-1 bg-dnd-red/10 text-dnd-red text-[9px] font-bold py-1.5 rounded uppercase hover:bg-dnd-red hover:text-white transition-all"
                                    >Deny</button>
                                </div>
                            )}
                        </div>
                    );
                })}
                {filteredLogs.length === 0 && (
                    <div className="text-center py-10 text-dnd-muted italic text-sm opacity-30">
                        No entries found in this chronicle.
                    </div>
                )}
            </div>
        </div>
    );
}
