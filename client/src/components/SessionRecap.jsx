import React, { useState, useEffect } from 'react';
import socket from '../socket';

export default function SessionRecap() {
    const [recaps, setRecaps] = useState([]);
    const [isScribing, setIsScribing] = useState(false);
    const [error, setError] = useState(null);
    const [expandedRecap, setExpandedRecap] = useState(null);

    useEffect(() => {
        // Fetch existing recaps
        fetch('/api/recaps')
            .then(r => r.json())
            .then(data => setRecaps(data))
            .catch(() => { });

        // Listen for new recaps
        socket.on('recaps_updated', (data) => {
            setRecaps(data);
            setIsScribing(false);
        });

        return () => socket.off('recaps_updated');
    }, []);

    const handleEndSession = () => {
        setIsScribing(true);
        setError(null);

        socket.emit('end_session', (response) => {
            if (!response.success) {
                setIsScribing(false);
                setError(response.error || 'Failed to generate recap.');
            }
            // Success handled by recaps_updated event
        });
    };

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Scribing Overlay */}
            {isScribing && (
                <div className="scribing-overlay">
                    <div className="scribing-quill">🪶</div>
                    <h2 className="fantasy-heading" style={{ fontSize: '1.4rem', marginTop: '1rem' }}>
                        Scribing the chronicles...
                    </h2>
                    <p style={{ color: 'var(--dnd-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                        The ancient scribe is recounting the deeds of your party.
                    </p>
                </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div>
                    <h1 className="fantasy-heading" style={{ fontSize: '1.6rem', margin: 0 }}>📜 Campaign History</h1>
                    <p style={{ color: 'var(--dnd-muted)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
                        {recaps.length} session{recaps.length !== 1 ? 's' : ''} recorded
                    </p>
                </div>
                <button
                    className="btn-danger"
                    onClick={handleEndSession}
                    disabled={isScribing}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                    🏁 End Session & Generate Recap
                </button>
            </div>

            {error && (
                <div style={{
                    padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '8px',
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    color: 'var(--dnd-red)', fontSize: '0.85rem',
                }}>
                    ⚠ {error}
                </div>
            )}

            {/* Recaps List */}
            {recaps.length === 0 ? (
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    color: 'var(--dnd-muted)', gap: '0.75rem',
                }}>
                    <div style={{ fontSize: '3rem', opacity: 0.3 }}>📜</div>
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>No sessions recorded yet. End your first session to generate a recap!</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
                    {recaps.map((recap) => (
                        <div key={recap.id} className="dnd-panel" style={{ cursor: 'pointer' }}
                            onClick={() => setExpandedRecap(expandedRecap === recap.id ? null : recap.id)}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 className="fantasy-heading" style={{ fontSize: '1rem', margin: 0 }}>
                                    Session {recap.id}
                                </h3>
                                <span style={{ fontSize: '0.75rem', color: 'var(--dnd-muted)' }}>
                                    {formatDate(recap.session_date)}
                                </span>
                            </div>

                            {expandedRecap === recap.id ? (
                                <div style={{
                                    marginTop: '0.75rem', paddingTop: '0.75rem',
                                    borderTop: '1px solid rgba(255,255,255,0.05)',
                                    fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--dnd-text)',
                                    whiteSpace: 'pre-wrap',
                                }}>
                                    {recap.recap_text}
                                </div>
                            ) : (
                                <p style={{
                                    margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--dnd-muted)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {recap.recap_text.substring(0, 150)}...
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
