import React, { useState, useEffect } from 'react';

const ENTITY_TYPES = [
    { id: 'monster', label: '👹 Monster', placeholder: 'A large shadowy beast that lurks in cave systems, immune to poison and resistant to cold...' },
    { id: 'spell', label: '✨ Spell', placeholder: 'A 3rd-level evocation spell that creates a swirling vortex of flame...' },
    { id: 'item', label: '🗡️ Item', placeholder: 'A cursed longsword that grants +2 to hit but drains 1 HP per round if attuned...' },
];

export default function HomebrewCreator({ onClose }) {
    const [entityType, setEntityType] = useState('monster');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [generatedStats, setGeneratedStats] = useState(null);
    const [editableStats, setEditableStats] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const currentType = ENTITY_TYPES.find(t => t.id === entityType);

    const handleGenerate = async () => {
        if (!name.trim() || !description.trim()) return;
        setIsGenerating(true);
        setError(null);
        setGeneratedStats(null);

        try {
            const res = await fetch('/api/homebrew/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entity_type: entityType, name: name.trim(), description: description.trim() }),
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Generation failed');

            setGeneratedStats(data.stats);
            setEditableStats(JSON.stringify(data.stats, null, 2));
        } catch (err) {
            setError(err.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSave = async () => {
        let statsObj;
        try {
            statsObj = JSON.parse(editableStats);
        } catch {
            setError('Invalid JSON in stats editor.');
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const res = await fetch('/api/homebrew', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    entity_type: entityType,
                    name: name.trim(),
                    description: description.trim(),
                    stats_json: statsObj,
                }),
            });

            if (!res.ok) throw new Error('Save failed');
            setSaveSuccess(true);
            setTimeout(() => onClose?.(), 1500);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 className="fantasy-heading" style={{ margin: 0 }}>🔮 Homebrew Creator</h2>
                    <button className="btn-ghost" onClick={onClose}>✕</button>
                </div>

                {saveSuccess ? (
                    <div style={{
                        textAlign: 'center', padding: '3rem 1rem',
                        color: 'var(--dnd-green)', fontSize: '1.2rem',
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
                        <p className="fantasy-heading">Entity saved to the compendium!</p>
                    </div>
                ) : (
                    <>
                        {/* Entity Type Selector */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            {ENTITY_TYPES.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => { setEntityType(t.id); setGeneratedStats(null); }}
                                    style={{
                                        flex: 1, padding: '0.5rem', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer',
                                        background: entityType === t.id ? 'rgba(212,160,23,0.15)' : 'transparent',
                                        border: `1px solid ${entityType === t.id ? 'var(--dnd-gold)' : 'var(--dnd-border)'}`,
                                        color: entityType === t.id ? 'var(--dnd-gold)' : 'var(--dnd-muted)',
                                        fontWeight: entityType === t.id ? 600 : 400,
                                    }}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* Name */}
                        <input
                            className="dnd-input"
                            placeholder={`${currentType.label.split(' ')[1]} name`}
                            value={name}
                            onChange={e => setName(e.target.value)}
                            style={{ marginBottom: '0.75rem' }}
                        />

                        {/* Description */}
                        <textarea
                            className="dnd-input"
                            placeholder={currentType.placeholder}
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            style={{ marginBottom: '0.75rem', minHeight: '100px', resize: 'vertical' }}
                        />

                        {/* Generate Button */}
                        <button
                            className="btn-primary"
                            onClick={handleGenerate}
                            disabled={!name.trim() || !description.trim() || isGenerating}
                            style={{ width: '100%', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        >
                            {isGenerating ? (
                                <>🔮 Channeling the arcane...</>
                            ) : (
                                <>🔮 Generate Stats with AI</>
                            )}
                        </button>

                        {error && (
                            <div style={{
                                padding: '0.6rem 0.75rem', marginBottom: '0.75rem', borderRadius: '6px',
                                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                                color: 'var(--dnd-red)', fontSize: '0.8rem',
                            }}>
                                ⚠ {error}
                            </div>
                        )}

                        {/* Generated Stats Editor */}
                        {generatedStats && (
                            <div>
                                <h3 style={{ fontSize: '0.85rem', color: 'var(--dnd-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                    Generated Stats (editable)
                                </h3>
                                <textarea
                                    className="dnd-input"
                                    value={editableStats}
                                    onChange={e => setEditableStats(e.target.value)}
                                    style={{
                                        fontFamily: 'monospace', fontSize: '0.8rem', minHeight: '200px',
                                        resize: 'vertical', marginBottom: '0.75rem',
                                    }}
                                />
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    <button className="btn-secondary" onClick={handleGenerate} disabled={isGenerating}>
                                        🔄 Regenerate
                                    </button>
                                    <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
                                        {isSaving ? 'Saving...' : '💾 Save to Compendium'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
