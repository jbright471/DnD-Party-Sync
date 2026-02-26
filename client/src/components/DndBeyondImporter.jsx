import React, { useState } from 'react';
import socket from '../socket';

/**
 * D&D Beyond Character Importer
 * Intentionally isolated — all parsing logic lives in server/routes/importer.js
 * This component is purely the UI layer for that endpoint.
 *
 * REQUIREMENT: The character must be set to PUBLIC on D&D Beyond.
 */
export default function DndBeyondImporter({ onSuccess }) {
    const [url, setUrl] = useState('');
    const [status, setStatus] = useState('idle'); // idle | loading | success | error
    const [message, setMessage] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    const handleImport = async (e) => {
        e.preventDefault();
        if (!url.trim()) return;

        setStatus('loading');
        setMessage('');

        try {
            const res = await fetch('/api/characters/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url.trim() }),
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Import failed');

            setStatus('success');
            setMessage(`✓ Imported ${data.name} (${data.class} ${data.level}) — ${data.current_hp}/${data.max_hp} HP, AC ${data.ac}`);
            setUrl('');
            socket.emit('refresh_party');
            onSuccess?.(data);
        } catch (err) {
            setStatus('error');
            setMessage(err.message);
        }
    };

    return (
        <div className="dnd-panel" style={{ marginTop: '0.75rem' }}>
            {/* Toggle Header */}
            <button
                onClick={() => setIsOpen(o => !o)}
                style={{
                    width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 0,
                }}
            >
                <span className="fantasy-heading" style={{ fontSize: '0.9rem' }}>
                    🎲 Import from D&amp;D Beyond
                </span>
                <span style={{ color: 'var(--dnd-muted)', fontSize: '0.8rem', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    ▾
                </span>
            </button>

            {isOpen && (
                <div style={{ marginTop: '0.85rem' }}>
                    <p style={{ margin: '0 0 0.75rem', fontSize: '0.75rem', color: 'var(--dnd-muted)', lineHeight: 1.5 }}>
                        Paste a D&amp;D Beyond character URL (e.g.{' '}
                        <code style={{ fontSize: '0.65rem', color: 'var(--dnd-gold)', opacity: 0.8 }}>dndbeyond.com/characters/12345678</code>).
                        The character must be set to{' '}
                        <strong style={{ color: 'var(--dnd-gold)' }}>Public</strong> on D&amp;D Beyond.
                    </p>

                    <form onSubmit={handleImport} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <input
                            className="dnd-input"
                            placeholder="https://www.dndbeyond.com/characters/12345678"
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                            disabled={status === 'loading'}
                        />

                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={status === 'loading' || !url.trim()}
                            style={{ alignSelf: 'flex-end' }}
                        >
                            {status === 'loading' ? '⏳ Importing...' : 'Import Character'}
                        </button>
                    </form>

                    {/* Status Message */}
                    {message && (
                        <div style={{
                            marginTop: '0.6rem',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            lineHeight: 1.5,
                            background: status === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            border: `1px solid ${status === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                            color: status === 'success' ? 'var(--dnd-green)' : 'var(--dnd-red)',
                        }}>
                            {message}
                        </div>
                    )}

                    <p style={{ margin: '0.6rem 0 0', fontSize: '0.65rem', color: 'var(--dnd-muted)', lineHeight: 1.5 }}>
                        ⚠ Uses an unofficial community API. Keep this module isolated for easy updates if D&amp;D Beyond changes their structure.
                    </p>
                </div>
            )}
        </div>
    );
}
