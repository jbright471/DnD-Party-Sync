import React, { useState } from 'react';
import socket from '../socket';

const DND_CLASSES = [
    'Artificer', 'Barbarian', 'Bard', 'Cleric', 'Druid',
    'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue',
    'Sorcerer', 'Warlock', 'Wizard',
];

const INITIAL = { name: '', class: 'Fighter', level: 1, max_hp: 10, ac: 10 };

export default function AddCharacterForm({ onClose, onSuccess }) {
    const [form, setForm] = useState(INITIAL);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!form.name.trim()) return setError('Character name is required.');
        if (form.max_hp < 1) return setError('Max HP must be at least 1.');
        if (form.ac < 0) return setError('AC cannot be negative.');

        setLoading(true);
        try {
            const res = await fetch('/api/characters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, max_hp: Number(form.max_hp), level: Number(form.level), ac: Number(form.ac) }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to create character');

            // Trigger server broadcast
            socket.emit('refresh_party');
            onSuccess?.(data);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <h2 className="fantasy-heading" style={{ margin: '0 0 1.25rem', fontSize: '1.3rem' }}>
                    Create Character
                </h2>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {/* Name */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--dnd-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Name *
                        </label>
                        <input
                            className="dnd-input"
                            placeholder="Thorin Stonefist"
                            value={form.name}
                            onChange={e => set('name', e.target.value)}
                            autoFocus
                        />
                    </div>

                    {/* Class + Level row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--dnd-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Class *
                            </label>
                            <select
                                className="dnd-input"
                                value={form.class}
                                onChange={e => set('class', e.target.value)}
                                style={{ cursor: 'pointer' }}
                            >
                                {DND_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--dnd-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Level
                            </label>
                            <input
                                className="dnd-input"
                                type="number" min="1" max="20"
                                value={form.level}
                                onChange={e => set('level', e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Max HP + AC row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--dnd-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Max HP *
                            </label>
                            <input
                                className="dnd-input"
                                type="number" min="1" max="999"
                                value={form.max_hp}
                                onChange={e => set('max_hp', e.target.value)}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--dnd-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                AC *
                            </label>
                            <input
                                className="dnd-input"
                                type="number" min="1" max="30"
                                value={form.ac}
                                onChange={e => set('ac', e.target.value)}
                            />
                        </div>
                    </div>

                    {error && (
                        <p style={{ margin: 0, color: 'var(--dnd-red)', fontSize: '0.8rem', background: 'rgba(239,68,68,0.1)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                            {error}
                        </p>
                    )}

                    <div className="dnd-divider" />

                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-primary" disabled={loading}>
                            {loading ? 'Adding...' : '+ Add to Party'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
