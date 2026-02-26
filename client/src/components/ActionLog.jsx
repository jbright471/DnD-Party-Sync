import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket';

function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts.includes('T') || ts.includes('Z') ? ts : ts + 'Z');
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getEntryStyle(description) {
    const desc = description || '';
    if (desc.includes('damage')) return { color: '#EF4444' };
    if (desc.includes('healed') || desc.includes('heal')) return { color: '#22C55E' };
    if (desc.includes('Unconscious') || desc.includes('KO')) return { color: '#F97316' };
    return { color: 'var(--dnd-text)' };
}

export default function ActionLog({ logs }) {
    const bottomRef = useRef(null);
    const [actionText, setActionText] = useState('');
    const [useLlm, setUseLlm] = useState(true);
    const [isResolving, setIsResolving] = useState(false);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const handleLogAction = (e) => {
        e.preventDefault();
        if (!actionText.trim() || isResolving) return;

        if (useLlm) {
            setIsResolving(true);
            socket.emit('log_action', {
                actor: 'Player',
                description: actionText.trim(),
                useLlm: true
            }, (response) => {
                setIsResolving(false);
                if (response.success) {
                    setActionText('');
                }
            });
        } else {
            socket.emit('log_action', {
                actor: 'Player',
                description: actionText.trim(),
                useLlm: false
            });
            setActionText('');
        }
    };

    return (
        <div className="dnd-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h2 className="fantasy-heading" style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>
                📜 Session Log
            </h2>
            <div className="dnd-divider" style={{ margin: '0 0 0.75rem' }} />

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingRight: '0.25rem' }}>
                {logs.length === 0 && (
                    <p style={{ color: 'var(--dnd-muted)', fontSize: '0.8rem', textAlign: 'center', marginTop: '1.5rem' }}>
                        No actions logged yet...
                    </p>
                )}
                {logs.map((entry, i) => (
                    <div
                        key={entry.id || i}
                        className="log-entry"
                        style={{
                            padding: '0.4rem 0.6rem',
                            background: 'rgba(33,38,45,0.5)',
                            borderRadius: '6px',
                            borderLeft: '2px solid var(--dnd-border)',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.1rem' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--dnd-gold)', fontWeight: 600 }}>
                                {entry.actor}
                            </span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--dnd-muted)' }}>
                                {formatTime(entry.timestamp)}
                            </span>
                        </div>
                        <p
                            style={{
                                margin: 0,
                                fontSize: '0.78rem',
                                lineHeight: 1.4,
                                ...getEntryStyle(entry.action_description),
                                opacity: entry.status === 'pending' ? 0.7 : 1
                            }}
                        >
                            {entry.status === 'pending' && <span style={{ color: '#F59E0B', fontWeight: 'bold', marginRight: '4px' }}>[PENDING]</span>}
                            {entry.action_description}
                        </p>

                        {entry.status === 'pending' && (
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.4rem' }}>
                                <button
                                    onClick={() => socket.emit('resolve_pending_action', { logId: entry.id, approved: true })}
                                    style={{ flex: 1, background: 'rgba(34, 197, 94, 0.2)', border: '1px solid #22c55e', color: '#22c55e', borderRadius: '4px', padding: '2px 0', fontSize: '0.8rem', cursor: 'pointer', transition: 'background 0.2s' }}
                                >
                                    ✅ Approve
                                </button>
                                <button
                                    onClick={() => socket.emit('resolve_pending_action', { logId: entry.id, approved: false })}
                                    style={{ flex: 1, background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '4px', padding: '2px 0', fontSize: '0.8rem', cursor: 'pointer', transition: 'background 0.2s' }}
                                >
                                    ❌ Reject
                                </button>
                            </div>
                        )}

                        {entry.status === 'rejected' && (
                            <div style={{ marginTop: '0.3rem', fontSize: '0.7rem', color: '#ef4444', fontStyle: 'italic' }}>
                                🚫 Action rejected by DM
                            </div>
                        )}
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            {/* Action Input */}
            <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--dnd-border)', paddingTop: '0.75rem' }}>
                <form onSubmit={handleLogAction} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem', color: useLlm ? 'var(--dnd-gold)' : 'var(--dnd-muted)' }}>
                            <input
                                type="checkbox"
                                checked={useLlm}
                                onChange={e => setUseLlm(e.target.checked)}
                            />
                            LLM Auto-Resolve
                        </label>
                        {isResolving && <span style={{ fontSize: '0.75rem', color: '#38BDF8', animation: 'pulse 1.5s infinite' }}>🎲 Rolling the bones...</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                            type="text"
                            placeholder={useLlm ? "e.g., Cast Bless on Thorin" : "Describe action..."}
                            className="input-field"
                            style={{ flex: 1 }}
                            value={actionText}
                            onChange={e => setActionText(e.target.value)}
                            disabled={isResolving}
                        />
                        <button type="submit" className="btn-primary" disabled={!actionText.trim() || isResolving}>
                            Log
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
