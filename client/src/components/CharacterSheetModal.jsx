import React, { useState } from 'react';
import socket from '../socket';

// Common D&D Skill to Ability score mapping
const SKILL_MAP = {
    'Acrobatics': 'DEX', 'Animal Handling': 'WIS', 'Arcana': 'INT', 'Athletics': 'STR',
    'Deception': 'CHA', 'History': 'INT', 'Insight': 'WIS', 'Intimidation': 'CHA',
    'Investigation': 'INT', 'Medicine': 'WIS', 'Nature': 'INT', 'Perception': 'WIS',
    'Performance': 'CHA', 'Persuasion': 'CHA', 'Religion': 'INT', 'Sleight of Hand': 'DEX',
    'Stealth': 'DEX', 'Survival': 'WIS'
};

export default function CharacterSheetModal({ character, onClose }) {
    const [activeTab, setActiveTab] = useState('Combat & Stats');

    if (!character) return null;

    // Parse JSON fields defensively
    let stats = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
    try {
        const parsedStats = typeof character.stats === 'string' ? JSON.parse(character.stats) : character.stats;
        if (parsedStats && typeof parsedStats === 'object') stats = { ...stats, ...parsedStats };
    } catch { }

    let skills = [];
    try {
        const parsedSkills = typeof character.skills === 'string' ? JSON.parse(character.skills) : character.skills;
        if (Array.isArray(parsedSkills)) skills = parsedSkills;
    } catch { }

    let features = [];
    try {
        const parsedFeatures = typeof character.features_traits === 'string' ? JSON.parse(character.features_traits) : character.features_traits;
        if (Array.isArray(parsedFeatures)) features = parsedFeatures;
    } catch { }

    let inventory = [];
    try {
        const parsedInventory = typeof character.inventory === 'string' ? JSON.parse(character.inventory) : character.inventory;
        if (Array.isArray(parsedInventory)) inventory = parsedInventory;
    } catch { }

    // Calculate modifier
    const getMod = (score) => {
        const mod = Math.floor((score - 10) / 2);
        return mod >= 0 ? `+${mod}` : `${mod}`;
    };

    const getSkillTotal = (skillName, attachedAttr) => {
        const baseMod = parseInt(getMod(stats[attachedAttr] || 10));
        const profBonus = Math.ceil(character.level / 4) + 1; // Simplified proficiency calc
        const isProficient = skills.includes(skillName.toLowerCase().replace(' ', '-'));
        const total = baseMod + (isProficient ? profBonus : 0);
        return total >= 0 ? `+${total}` : `${total}`;
    };

    const decodeHTML = (html) => {
        if (!html) return '';
        const txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" style={{ width: '900px', maxWidth: '95vw', height: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--dnd-border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                    <div>
                        <h2 className="fantasy-heading" style={{ margin: 0, fontSize: '2rem', color: 'var(--dnd-gold)' }}>
                            {decodeHTML(character.name)}
                        </h2>
                        <div style={{ color: 'var(--dnd-muted)', display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                            <span>Level {character.level} {character.class}</span>
                            <span>AC: <strong style={{ color: 'var(--dnd-text)' }}>{character.ac}</strong></span>
                            <span>HP: <strong style={{ color: 'var(--dnd-text)' }}>{character.current_hp} / {character.max_hp}</strong></span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button
                            className="btn-primary"
                            style={{ backgroundColor: 'var(--dnd-red)', borderColor: 'var(--dnd-red)', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                            onClick={async () => {
                                if (window.confirm('Are you sure you want to remove this character?')) {
                                    try {
                                        await fetch(`/api/characters/${character.id}`, { method: 'DELETE' });
                                        socket.emit('refresh_party');
                                        onClose();
                                    } catch (err) {
                                        console.error('Failed to delete character:', err);
                                    }
                                }
                            }}
                        >
                            🗑️ Remove
                        </button>
                        <button className="btn-ghost" onClick={onClose} style={{ fontSize: '1.5rem', padding: '0.2rem 0.5rem' }}>×</button>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', borderBottom: '1px solid var(--dnd-border)', marginBottom: '1rem' }}>
                    {['Combat & Stats', 'Inventory & Equipment', 'Features & Traits', 'Lore & Notes'].map(tab => (
                        <button
                            key={tab}
                            className={`btn-ghost ${activeTab === tab ? 'active-tab' : ''}`}
                            style={{
                                padding: '0.5rem 1rem',
                                borderBottom: activeTab === tab ? '2px solid var(--dnd-gold)' : '2px solid transparent',
                                textTransform: 'capitalize',
                                whiteSpace: 'nowrap',
                                flexGrow: 1
                            }}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Tab Content Area */}
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>

                    {/* COMBAT / STATS TAB */}
                    {activeTab === 'Combat & Stats' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '1.5rem' }}>
                            {/* Left: Attributes */}
                            <div>
                                <h3 className="fantasy-heading" style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--dnd-gold)' }}>Attributes</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                    {Object.entries(stats).map(([attr, score]) => (
                                        <div key={attr} style={{ background: 'var(--dnd-surface)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--dnd-border)', textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--dnd-muted)', fontWeight: 600 }}>{attr}</div>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{getMod(score)}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--dnd-muted)' }}>Score: {score}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Right: Skills */}
                            <div>
                                <h3 className="fantasy-heading" style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--dnd-gold)' }}>Skills</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                    {Object.entries(SKILL_MAP).map(([skill, attr]) => {
                                        const isProficient = skills.includes(skill.toLowerCase().replace(' ', '-'));
                                        return (
                                            <div key={skill} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.75rem', background: isProficient ? 'rgba(212,160,23,0.1)' : 'transparent', border: '1px solid var(--dnd-border)', borderRadius: '4px' }}>
                                                <span style={{ color: isProficient ? 'var(--dnd-gold)' : 'var(--dnd-text)' }}>
                                                    {isProficient ? '● ' : '○ '} {skill} <span style={{ fontSize: '0.7rem', color: 'var(--dnd-muted)' }}>({attr})</span>
                                                </span>
                                                <strong style={{ opacity: isProficient ? 1 : 0.6 }}>{getSkillTotal(skill, attr)}</strong>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* INVENTORY TAB */}
                    {activeTab === 'Inventory & Equipment' && (
                        <div>
                            {inventory.length === 0 ? <p style={{ color: 'var(--dnd-muted)' }}>No inventory data parsed.</p> : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                                    {inventory.map((item, i) => (
                                        <div key={i} style={{ padding: '0.75rem', background: 'var(--dnd-surface)', border: `1px solid ${item.equipped ? 'var(--dnd-green)' : 'var(--dnd-border)'}`, borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontWeight: 500, color: item.equipped ? 'var(--dnd-text)' : 'var(--dnd-muted)' }}>{item.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--dnd-muted)' }}>Type: {item.type}</div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                <span style={{ fontSize: '0.85rem' }}>x{item.quantity}</span>
                                                {item.equipped && <span style={{ fontSize: '0.7rem', color: 'var(--dnd-green)', background: 'rgba(34,197,94,0.1)', padding: '2px 6px', borderRadius: '4px', marginTop: '4px' }}>Equipped</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* FEATURES TAB */}
                    {activeTab === 'Features & Traits' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {features.length === 0 ? <p style={{ color: 'var(--dnd-muted)' }}>No class features parsed.</p> : (
                                features.map((feat, i) => (
                                    <div key={i} style={{ padding: '1rem', background: 'var(--dnd-surface)', border: '1px solid var(--dnd-border)', borderRadius: '6px' }}>
                                        <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--dnd-gold)' }}>{feat.name}</h4>
                                        <div style={{ fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--dnd-muted)' }} dangerouslySetInnerHTML={{ __html: feat.description }} />
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* LORE TAB */}
                    {activeTab === 'Lore & Notes' && (
                        <div style={{ padding: '1rem', background: 'var(--dnd-surface)', border: '1px solid var(--dnd-border)', borderRadius: '8px' }}>
                            <h3 className="fantasy-heading" style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--dnd-gold)' }}>Backstory & Notes</h3>
                            {character.backstory ? (
                                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--dnd-muted)', fontSize: '0.9rem' }} dangerouslySetInnerHTML={{ __html: character.backstory }} />
                            ) : (
                                <p style={{ color: 'var(--dnd-muted)' }}>No backstory provided.</p>
                            )}
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
