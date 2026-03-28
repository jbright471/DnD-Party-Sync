import React, { useState, useEffect } from 'react';
import socket from '../socket';

export default function DmWhisperPanel({ party }) {
    const [isOpen, setIsOpen] = useState(false);
    const [targetId, setTargetId] = useState('');
    const [message, setMessage] = useState('');
    const [whisperType, setWhisperType] = useState('message'); // 'message' | 'blind_roll'
    const [rollType, setRollType] = useState('Perception');
    const [dc, setDc] = useState(15);
    const [sentLog, setSentLog] = useState([]);

    // Incoming whispers (for when you ARE the player)
    const [incomingWhispers, setIncomingWhispers] = useState([]);
    // Incoming blind roll requests
    const [blindRollRequest, setBlindRollRequest] = useState(null);

    useEffect(() => {
        socket.on('whisper_received', (data) => {
            setIncomingWhispers(prev => [...prev, data]);
            // Auto-dismiss after 12 seconds
            setTimeout(() => {
                setIncomingWhispers(prev => prev.slice(1));
            }, 12000);
        });

        socket.on('whisper_sent', (data) => {
            const target = party.find(c => c.id === data.targetCharacterId);
            setSentLog(prev => [...prev, { to: target?.name || 'Unknown', message: data.message, time: new Date().toLocaleTimeString() }]);
        });

        socket.on('blind_roll_requested', (data) => {
            setBlindRollRequest(data);
        });

        socket.on('blind_roll_result_dm', (data) => {
            const char = party.find(c => c.id === data.characterId);
            setSentLog(prev => [...prev, {
                to: 'DM',
                message: `🎲 ${char?.name || 'Player'} rolled ${data.result} on ${data.rollType}`,
                time: new Date().toLocaleTimeString()
            }]);
        });

        return () => {
            socket.off('whisper_received');
            socket.off('whisper_sent');
            socket.off('blind_roll_requested');
            socket.off('blind_roll_result_dm');
        };
    }, [party]);

    const handleSendWhisper = (e) => {
        e.preventDefault();
        if (!targetId) return;

        if (whisperType === 'message' && message.trim()) {
            socket.emit('dm_whisper', { targetCharacterId: parseInt(targetId), message: message.trim() });
            setMessage('');
        } else if (whisperType === 'blind_roll') {
            socket.emit('blind_roll_request', { targetCharacterId: parseInt(targetId), rollType, dc });
        }
    };

    const handleBlindRollResponse = (result) => {
        // Find our registered character
        const registeredInfo = party[0]; // Simplified
        socket.emit('blind_roll_response', {
            rollType: blindRollRequest.rollType,
            result,
            characterId: registeredInfo?.id
        });
        setBlindRollRequest(null);
    };

    return (
        <>
            {/* Incoming Whisper Toasts */}
            {incomingWhispers.map((w, idx) => (
                <div key={idx} className="whisper-toast p-3 bg-dnd-surface border-l-4 border-dnd-purple rounded shadow-lg z-[200]" style={{ top: `${80 + idx * 100}px` }}>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">🤫</span>
                        <span className="fantasy-heading text-sm text-dnd-purple font-bold tracking-wider uppercase">Whisper from {w.from}</span>
                    </div>
                    <p className="m-0 text-sm leading-relaxed text-dnd-text">{w.message}</p>
                </div>
            ))}

            {/* Blind Roll Request Modal */}
            {blindRollRequest && (
                <div className="modal-overlay" onClick={() => { }}>
                    <div className="modal-content text-center max-w-[350px]" onClick={e => e.stopPropagation()}>
                        <span className="text-4xl">🎲</span>
                        <h2 className="fantasy-heading mt-2">Blind Roll Request</h2>
                        <p className="text-dnd-muted mb-4 text-sm mt-2">
                            The DM is requesting a <strong className="text-dnd-gold">{blindRollRequest.rollType}</strong> check.
                        </p>
                        <p className="text-xs text-dnd-muted mb-6">
                            Roll a d20 and enter your result below (including modifiers).
                        </p>
                        <input
                            type="number"
                            className="dnd-input text-center text-lg mb-4 w-full font-bold"
                            placeholder="Your total roll"
                            id="blind-roll-input"
                        />
                        <button className="btn-primary w-full bg-dnd-purple hover:bg-purple-500 border-none shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                            onClick={() => {
                                const val = parseInt(document.getElementById('blind-roll-input').value);
                                if (!isNaN(val)) handleBlindRollResponse(val);
                            }}
                        >
                            Submit to DM (DM Only)
                        </button>
                    </div>
                </div>
            )}

            {/* DM Whisper Panel Toggle */}
            {!isOpen ? (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-[220px] lg:bottom-4 right-4 lg:right-[320px] w-14 h-14 rounded-full bg-dnd-surface border-2 border-dnd-purple text-dnd-purple text-2xl cursor-pointer shadow-[0_4px_12px_rgba(168,85,247,0.3)] flex items-center justify-center z-[100] transition-all hover:scale-110"
                    title="DM Whispers & Blind Rolls"
                >
                    🤫
                </button>
            ) : (
                <div className="fixed bottom-[280px] lg:bottom-20 right-4 lg:right-[320px] w-[350px] h-[480px] bg-dnd-navy border border-dnd-purple rounded-xl shadow-[0_8px_24px_rgba(168,85,247,0.3)] flex flex-col z-[100] overflow-hidden">
                    {/* Header */}
                    <div className="bg-dnd-surface p-3 border-b border-dnd-border flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🤫</span>
                            <h3 className="fantasy-heading m-0 text-base text-white">DM Whispers</h3>
                        </div>
                        <button className="btn-ghost px-2 py-1 text-xl text-dnd-muted hover:text-white" onClick={() => setIsOpen(false)}>✕</button>
                    </div>

                    {/* Sent Log */}
                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 custom-scrollbar">
                        {sentLog.length === 0 ? (
                            <p className="text-dnd-muted text-xs text-center mt-8">
                                No whispers sent yet...
                            </p>
                        ) : (
                            sentLog.map((entry, idx) => (
                                <div key={idx} className="p-2 bg-dnd-purple/10 rounded-md border-l-2 border-dnd-purple">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[11px] text-dnd-purple font-semibold bg-purple-900/40 px-1 rounded">→ {entry.to}</span>
                                        <span className="text-[10px] text-dnd-muted/70">{entry.time}</span>
                                    </div>
                                    <p className="m-0 text-xs text-dnd-text">{entry.message}</p>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Send Form */}
                    <form onSubmit={handleSendWhisper} className="p-3 border-t border-dnd-border bg-dnd-surface flex flex-col gap-3">
                        {/* Type Toggle */}
                        <div className="flex gap-2">
                            <button type="button"
                                onClick={() => setWhisperType('message')}
                                className={`flex-1 py-1.5 px-2 rounded-md text-xs cursor-pointer border transition-all font-semibold ${whisperType === 'message' ? 'bg-dnd-purple/20 border-dnd-purple text-dnd-purple' : 'bg-black/30 border-dnd-border text-dnd-muted hover:bg-black/50'}`}
                            >💬 Message</button>
                            <button type="button"
                                onClick={() => setWhisperType('blind_roll')}
                                className={`flex-1 py-1.5 px-2 rounded-md text-xs cursor-pointer border transition-all font-semibold ${whisperType === 'blind_roll' ? 'bg-dnd-purple/20 border-dnd-purple text-dnd-purple' : 'bg-black/30 border-dnd-border text-dnd-muted hover:bg-black/50'}`}
                            >🎲 Blind Roll</button>
                        </div>

                        {/* Target Select */}
                        <select
                            className="dnd-input text-xs py-2 cursor-pointer bg-black/40"
                            value={targetId}
                            onChange={e => setTargetId(e.target.value)}
                        >
                            <option value="">Select target player...</option>
                            {party.map(c => (
                                <option key={c.id} value={c.id} className="bg-dnd-navy text-white">{c.name} ({c.class || 'Unknown'})</option>
                            ))}
                        </select>

                        {whisperType === 'message' ? (
                            <input
                                type="text" className="input-field py-2 text-sm bg-black/40"
                                placeholder="Type a secret message..."
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                            />
                        ) : (
                            <div className="flex gap-2">
                                <input className="input-field py-2 text-sm bg-black/40 flex-1" value={rollType} onChange={e => setRollType(e.target.value)} placeholder="Roll type (e.g. Perception)" />
                                <input className="input-field py-2 text-sm bg-black/40 w-16 text-center" type="number" value={dc} onChange={e => setDc(parseInt(e.target.value) || 0)} title="DC" />
                            </div>
                        )}

                        <button type="submit" className="btn-primary py-2 mt-1 border-none shadow-[0_0_8px_rgba(168,85,247,0.3)] transition-all hover:shadow-[0_0_12px_rgba(168,85,247,0.6)]" disabled={!targetId}
                            style={{ background: 'var(--dnd-purple)' }}
                        >
                            {whisperType === 'message' ? '🤫 Send Whisper' : '🎲 Request Roll'}
                        </button>
                    </form>
                </div>
            )}
        </>
    );
}
