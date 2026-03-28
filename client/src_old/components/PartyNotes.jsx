import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket';

const CATEGORIES = [
    { id: 'quest', label: '🗡️ Quests', color: 'var(--dnd-gold)' },
    { id: 'npc', label: '👤 NPCs', color: 'var(--dnd-blue)' },
    { id: 'loot', label: '💰 Loot', color: 'var(--dnd-green)' },
    { id: 'general', label: '📝 General', color: 'var(--dnd-muted)' },
];

export default function PartyNotes({ notes }) {
    const [activeCategory, setActiveCategory] = useState('quest');
    const [newTitle, setNewTitle] = useState('');
    const [showNewNote, setShowNewNote] = useState(false);
    const debounceRef = useRef({});

    const filteredNotes = notes.filter(n => n.category === activeCategory);

    const handleCreateNote = (e) => {
        e.preventDefault();
        if (!newTitle.trim()) return;
        socket.emit('create_note', {
            category: activeCategory,
            title: newTitle.trim(),
            content: '',
            updated_by: 'Player',
        });
        setNewTitle('');
        setShowNewNote(false);
    };

    const handleUpdateContent = (noteId, content) => {
        // Debounce: only emit after 500ms of no typing
        if (debounceRef.current[noteId]) clearTimeout(debounceRef.current[noteId]);
        debounceRef.current[noteId] = setTimeout(() => {
            socket.emit('update_note', { noteId, content, updated_by: 'Player' });
        }, 500);
    };

    const handleDeleteNote = (noteId) => {
        socket.emit('delete_note', { noteId });
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div>
                    <h1 className="fantasy-heading" style={{ fontSize: '1.6rem', margin: 0 }}>📋 Party Notes</h1>
                    <p style={{ color: 'var(--dnd-muted)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
                        Collaborative notes — synced across all devices
                    </p>
                </div>
                <button className="btn-primary" onClick={() => setShowNewNote(!showNewNote)}>
                    + New Note
                </button>
            </div>

            {/* Category Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                {CATEGORIES.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        style={{
                            padding: '0.4rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem',
                            border: `1px solid ${activeCategory === cat.id ? cat.color : 'var(--dnd-border)'}`,
                            background: activeCategory === cat.id ? `${cat.color}15` : 'transparent',
                            color: activeCategory === cat.id ? cat.color : 'var(--dnd-muted)',
                            cursor: 'pointer', fontWeight: activeCategory === cat.id ? 600 : 400,
                            transition: 'all 0.2s',
                        }}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* New Note Form */}
            {showNewNote && (
                <form onSubmit={handleCreateNote} style={{
                    display: 'flex', gap: '0.5rem', marginBottom: '1rem',
                }}>
                    <input
                        className="dnd-input"
                        placeholder={`New ${activeCategory} note title...`}
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        autoFocus
                        style={{ flex: 1 }}
                    />
                    <button type="submit" className="btn-primary" disabled={!newTitle.trim()}>Add</button>
                    <button type="button" className="btn-ghost" onClick={() => setShowNewNote(false)}>✕</button>
                </form>
            )}

            {/* Notes List */}
            {filteredNotes.length === 0 ? (
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    color: 'var(--dnd-muted)', gap: '0.5rem',
                }}>
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>No {activeCategory} notes yet.</p>
                    <button className="btn-secondary" onClick={() => setShowNewNote(true)}>Create One</button>
                </div>
            ) : (
                <div style={{
                    display: 'flex', flexDirection: 'column', gap: '0.75rem',
                    overflowY: 'auto', flex: 1, paddingRight: '0.25rem',
                }}>
                    {filteredNotes.map((note) => (
                        <NoteCard key={note.id} note={note} onUpdate={handleUpdateContent} onDelete={handleDeleteNote} />
                    ))}
                </div>
            )}
        </div>
    );
}

function NoteCard({ note, onUpdate, onDelete }) {
    const [content, setContent] = useState(note.content || '');
    const [isEditing, setIsEditing] = useState(false);

    // Sync when server pushes update
    useEffect(() => {
        if (!isEditing) {
            setContent(note.content || '');
        }
    }, [note.content, isEditing]);

    const handleChange = (e) => {
        setContent(e.target.value);
        onUpdate(note.id, e.target.value);
    };

    return (
        <div className="dnd-panel" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--dnd-text)' }}>
                    {note.title}
                </h3>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    {note.updated_by && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--dnd-muted)' }}>
                            by {note.updated_by}
                        </span>
                    )}
                    <button
                        className="btn-ghost"
                        onClick={() => onDelete(note.id)}
                        style={{ color: 'var(--dnd-red)', width: '22px', height: '22px', fontSize: '0.75rem' }}
                        title="Delete note"
                    >
                        ✕
                    </button>
                </div>
            </div>

            <textarea
                className="dnd-input"
                value={content}
                onChange={handleChange}
                onFocus={() => setIsEditing(true)}
                onBlur={() => setIsEditing(false)}
                placeholder="Write your notes here... All changes sync in real-time."
                style={{
                    width: '100%', minHeight: '80px', resize: 'vertical',
                    fontSize: '0.85rem', lineHeight: 1.6,
                }}
            />
        </div>
    );
}
