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
                <div key={idx} className="whisper-toast" style={{ top: `${80 + idx * 100}px` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '1.1rem' }}>🤫</span>
                        <span className="fantasy-heading" style={{ fontSize: '0.85rem' }}>Whisper from {w.from}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.5 }}>{w.message}</p>
                </div>
            ))}

            {/* Blind Roll Request Modal */}
            {blindRollRequest && (
                <div className="modal-overlay" onClick={() => { }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '350px', textAlign: 'center' }}>
                        <span style={{ fontSize: '2.5rem' }}>🎲</span>
                        <h2 className="fantasy-heading" style={{ marginTop: '0.5rem' }}>Blind Roll Request</h2>
                        <p style={{ color: 'var(--dnd-muted)', marginBottom: '1rem' }}>
                            The DM is requesting a <strong style={{ color: 'var(--dnd-gold)' }}>{blindRollRequest.rollType}</strong> check.
                        </p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--dnd-muted)', marginBottom: '1.5rem' }}>
                            Roll a d20 and enter your result below (including modifiers).
                        </p>
                        <input
                            type="number"
                            className="dnd-input"
                            placeholder="Your total roll"
                            id="blind-roll-input"
                            style={{ textAlign: 'center', fontSize: '1.2rem', marginBottom: '1rem' }}
                        />
                        <button className="btn-primary" style={{ width: '100%' }}
                            onClick={() => {
                                const val = parseInt(document.getElementById('blind-roll-input').value);
                                if (!isNaN(val)) handleBlindRollResponse(val);
                            }}
                        >
                            Submit to DM (Only the DM sees this)
                        </button>
                    </div>
                </div>
            )}

            {/* DM Whisper Panel Toggle */}
            {!isOpen ? (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-4 right-4 lg:right-[320px] w-14 h-14 rounded-full bg-dnd-surface border-2 border-dnd-purple text-dnd-purple text-2xl cursor-pointer shadow-[0_4px_12px_rgba(168,85,247,0.3)] flex items-center justify-center z-[100] transition-all hover:scale-110"
                    title="DM Whispers & Blind Rolls"
                >
                    🤫
                </button>
            ) : (
                <div className="fixed bottom-20 right-4 lg:right-[320px] w-[350px] h-[480px] bg-dnd-navy border border-dnd-purple rounded-xl shadow-[0_8px_24px_rgba(168,85,247,0.3)] flex flex-col z-[100] overflow-hidden">
                    {/* Header */}
                    <div style={{
                        background: 'var(--dnd-surface)', padding: '0.75rem',
                        borderBottom: '1px solid var(--dnd-border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1.2rem' }}>🤫</span>
                            <h3 className="fantasy-heading" style={{ margin: 0, fontSize: '1rem' }}>DM Whispers</h3>
                        </div>
                        <button className="btn-ghost" onClick={() => setIsOpen(false)} style={{ padding: '2px 6px', fontSize: '1.2rem' }}>✕</button>
                    </div>

                    {/* Sent Log */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {sentLog.length === 0 ? (
                            <p style={{ color: 'var(--dnd-muted)', fontSize: '0.8rem', textAlign: 'center', marginTop: '2rem' }}>
                                No whispers sent yet...
                            </p>
                        ) : (
                            sentLog.map((entry, idx) => (
                                <div key={idx} style={{
                                    padding: '0.4rem 0.6rem', background: 'rgba(168,85,247,0.1)',
                                    borderRadius: '6px', borderLeft: '2px solid var(--dnd-purple)',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--dnd-purple)', fontWeight: 600 }}>→ {entry.to}</span>
                                        <span style={{ fontSize: '0.65rem', color: 'var(--dnd-muted)' }}>{entry.time}</span>
                                    </div>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--dnd-text)' }}>{entry.message}</p>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Send Form */}
                    <form onSubmit={handleSendWhisper} style={{
                        padding: '0.75rem', borderTop: '1px solid var(--dnd-border)',
                        background: 'var(--dnd-surface)', display: 'flex', flexDirection: 'column', gap: '0.5rem',
                    }}>
                        {/* Type Toggle */}
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button type="button"
                                onClick={() => setWhisperType('message')}
                                style={{
                                    flex: 1, padding: '0.3rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer',
                                    background: whisperType === 'message' ? 'rgba(168,85,247,0.2)' : 'transparent',
                                    border: `1px solid ${whisperType === 'message' ? 'var(--dnd-purple)' : 'var(--dnd-border)'}`,
                                    color: whisperType === 'message' ? 'var(--dnd-purple)' : 'var(--dnd-muted)',
                                }}
                            >💬 Message</button>
                            <button type="button"
                                onClick={() => setWhisperType('blind_roll')}
                                style={{
                                    flex: 1, padding: '0.3rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer',
                                    background: whisperType === 'blind_roll' ? 'rgba(168,85,247,0.2)' : 'transparent',
                                    border: `1px solid ${whisperType === 'blind_roll' ? 'var(--dnd-purple)' : 'var(--dnd-border)'}`,
                                    color: whisperType === 'blind_roll' ? 'var(--dnd-purple)' : 'var(--dnd-muted)',
                                }}
                            >🎲 Blind Roll</button>
                        </div>

                        {/* Target Select */}
                        <select
                            className="dnd-input"
                            value={targetId}
                            onChange={e => setTargetId(e.target.value)}
                            style={{ cursor: 'pointer' }}
                        >
                            <option value="">Select target player...</option>
                            {party.map(c => (
                                <option key={c.id} value={c.id}>{c.name} ({c.class})</option>
                            ))}
                        </select>

                        {whisperType === 'message' ? (
                            <input
                                type="text" className="input-field"
                                placeholder="Type a secret message..."
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                            />
                        ) : (
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <input className="input-field" value={rollType} onChange={e => setRollType(e.target.value)} placeholder="Roll type" style={{ flex: 1 }} />
                                <input className="input-field" type="number" value={dc} onChange={e => setDc(parseInt(e.target.value) || 0)} style={{ width: '55px' }} title="DC" />
                            </div>
                        )}

                        <button type="submit" className="btn-primary" disabled={!targetId}
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
