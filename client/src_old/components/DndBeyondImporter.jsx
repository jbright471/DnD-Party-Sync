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
    const [pdfFile, setPdfFile] = useState(null);
    const [importMode, setImportMode] = useState('url'); // 'url' | 'pdf'
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

    const handleImportPdf = async (e) => {
        e.preventDefault();
        if (!pdfFile) return;

        setStatus('loading');
        setMessage('');

        const formData = new FormData();
        formData.append('pdf', pdfFile);

        try {
            const res = await fetch('/api/characters/import/pdf', {
                method: 'POST',
                body: formData, // the browser will automatically add the multipart boundary content type
            });

            if (!res.ok) {
                const text = await res.text();
                let errMsg = text;
                try {
                    const json = JSON.parse(text);
                    errMsg = json.error || text;
                } catch (e) {
                    // It was HTML or unparseable text
                }
                throw new Error(errMsg);
            }

            const data = await res.json();

            setStatus('success');
            setMessage(`✓ Imported ${data.name} (${data.class} ${data.level}) — ${data.current_hp}/${data.max_hp} HP, AC ${data.ac}`);
            setPdfFile(null);
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
                    {/* Mode Toggle Tabs */}
                    <div className="tab-nav" style={{ padding: 0, background: 'transparent', marginBottom: '1rem' }}>
                        <button
                            className={`tab-btn ${importMode === 'url' ? 'tab-active' : ''}`}
                            onClick={() => { setImportMode('url'); setStatus('idle'); setMessage(''); }}
                        >
                            Import by URL
                        </button>
                        <button
                            className={`tab-btn ${importMode === 'pdf' ? 'tab-active' : ''}`}
                            onClick={() => { setImportMode('pdf'); setStatus('idle'); setMessage(''); }}
                        >
                            Upload PDF
                        </button>
                    </div>

                    {importMode === 'url' ? (
                        <>
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
                        </>
                    ) : (
                        <>
                            <p style={{ margin: '0 0 0.75rem', fontSize: '0.75rem', color: 'var(--dnd-muted)', lineHeight: 1.5 }}>
                                Export your character sheet to PDF from D&amp;D Beyond and upload it here.
                            </p>

                            <form onSubmit={handleImportPdf} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                <div style={{
                                    border: '2px dashed var(--dnd-border)',
                                    borderRadius: '8px',
                                    padding: '1.5rem',
                                    textAlign: 'center',
                                    backgroundColor: 'var(--dnd-surface)',
                                    color: 'var(--dnd-muted)',
                                    cursor: 'pointer',
                                    position: 'relative'
                                }}>
                                    <input
                                        type="file"
                                        accept="application/pdf"
                                        onChange={e => setPdfFile(e.target.files[0])}
                                        disabled={status === 'loading'}
                                        style={{
                                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                            opacity: 0, cursor: 'pointer'
                                        }}
                                    />
                                    {pdfFile ? (
                                        <span style={{ color: 'var(--dnd-gold)' }}>📄 {pdfFile.name}</span>
                                    ) : (
                                        <span>Click or drag your PDF here</span>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    className="btn-primary"
                                    disabled={status === 'loading' || !pdfFile}
                                    style={{ alignSelf: 'flex-end' }}
                                >
                                    {status === 'loading' ? '⏳ The scribes are deciphering your character sheet...' : 'Upload & Parse PDF'}
                                </button>
                            </form>
                        </>
                    )}

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
