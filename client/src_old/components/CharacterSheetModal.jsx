import React, { useState, useEffect, useMemo } from 'react';
import socket from '../socket';
import CombatActions from './CombatActions';
import TargetSelectionModal from './TargetSelectionModal';

const SKILL_MAP = {
    'Acrobatics': 'DEX', 'Animal Handling': 'WIS', 'Arcana': 'INT', 'Athletics': 'STR',
    'Deception': 'CHA', 'History': 'INT', 'Insight': 'WIS', 'Intimidation': 'CHA',
    'Investigation': 'INT', 'Medicine': 'WIS', 'Nature': 'INT', 'Perception': 'WIS',
    'Performance': 'CHA', 'Persuasion': 'CHA', 'Religion': 'INT', 'Sleight of Hand': 'DEX',
    'Stealth': 'DEX', 'Survival': 'WIS'
};

const STAT_FULL_NAMES = { STR: 'strength', DEX: 'dexterity', CON: 'constitution', INT: 'intelligence', WIS: 'wisdom', CHA: 'charisma' };

const CONDITION_EFFECTS = {
    blinded: 'Attacks against you have advantage. Your attacks have disadvantage. Auto-fail sight-based checks.',
    charmed: 'Cannot attack the charmer. Charmer has advantage on social checks.',
    deafened: 'Cannot hear. Auto-fail hearing checks.',
    frightened: 'Disadvantage on checks/attacks while source is in sight. Cannot move closer.',
    grappled: 'Speed = 0.',
    incapacitated: 'Cannot take actions or reactions.',
    invisible: 'Attacks against you have disadvantage. Your attacks have advantage.',
    paralyzed: 'Incapacitated. Auto-fail STR/DEX saves. Attacks against have advantage. Crits within 5ft.',
    petrified: 'Incapacitated. Resistance to all damage. Immune to poison/disease. Auto-fail STR/DEX saves.',
    poisoned: 'Disadvantage on attack rolls and ability checks.',
    prone: 'Disadvantage on attacks. Attacks against: advantage within 5ft, disadvantage at range.',
    restrained: 'Speed = 0. Disadvantage on attacks. Attacks against have advantage. Disadvantage on DEX saves.',
    stunned: 'Incapacitated. Auto-fail STR/DEX saves. Attacks against have advantage.',
    unconscious: 'Incapacitated. Drop items, fall prone. Auto-fail STR/DEX saves. Attacks against advantage. Crits within 5ft.'
};

const SpellItem = ({ spell, character, onCast }) => {
    const [expanded, setExpanded] = useState(false);
    const max = (character.spellSlotsMax || {})[spell.level] || 0;
    const used = (character.spellSlotsUsed || {})[spell.level] || 0;
    const hasSlots = spell.level === 0 || (max - used > 0);

    return (
        <div className="flex flex-col bg-dnd-surface border border-dnd-border rounded overflow-hidden hover:border-dnd-blue/30 transition-all group">
            <div className="flex justify-between items-center p-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
                <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold border transition-all ${expanded ? 'bg-dnd-blue text-dnd-navy border-dnd-blue' : 'bg-dnd-navy text-dnd-blue border-dnd-blue/30 group-hover:border-dnd-blue/60'
                        }`}>
                        {spell.level === 0 ? 'C' : spell.level}
                    </span>
                    <div>
                        <div className={`text-sm font-semibold transition-colors ${expanded ? 'text-dnd-blue' : 'text-white'}`}>{spell.name}</div>
                        {spell.isConcentration && <span className="text-[9px] text-dnd-red uppercase font-bold tracking-tighter">Concentration</span>}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (hasSlots) onCast(spell);
                            else alert(`No Level ${spell.level} slots remaining!`);
                        }}
                        className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded transition-all ${hasSlots
                            ? 'bg-dnd-blue/10 text-dnd-blue border border-dnd-blue/20 hover:bg-dnd-blue/30'
                            : 'bg-dnd-muted/10 text-dnd-muted border border-dnd-muted/20 cursor-not-allowed'
                            }`}
                    >Cast</button>
                    <span className={`text-xs text-dnd-muted transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}>▼</span>
                </div>
            </div>
            {expanded && (
                <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="text-xs text-dnd-text leading-relaxed border-t border-dnd-border pt-3 mt-1 opacity-80 font-serif" dangerouslySetInnerHTML={{ __html: spell.description }} />
                </div>
            )}
        </div>
    );
};

export default function CharacterSheetModal({ character, onClose }) {
    const [activeTab, setActiveTab] = useState('actions');
    const [isSyncing, setIsSyncing] = useState(false);
    const [isParsing, setIsParsing] = useState(null);
    const [showTargetModal, setShowTargetModal] = useState(false);
    const [pendingSpell, setPendingSpell] = useState(null);

    const handleSpellCast = (spell) => {
        setPendingSpell(spell);
        setShowTargetModal(true);
    };

    const handleTargetSelection = (targets, useAutoResolve) => {
        if (!pendingSpell) return;

        const targetNames = targets.length > 0 ? targets.map(t => t.name).join(', ') : 'no targeted individuals';
        const description = `${character.name} casts ${pendingSpell.name} on ${targetNames}. Effect: ${pendingSpell.description}`;

        // Deduct spell slot/concentration
        socket.emit(pendingSpell.isConcentration ? 'cast_concentration_spell' : 'use_spell_slot', {
            characterId: character.id,
            spellName: pendingSpell.name,
            slotLevel: pendingSpell.level > 0 ? pendingSpell.level : null
        });

        // Resolve via LLM
        socket.emit('log_action', {
            actor: character.name,
            description: description,
            useLlm: useAutoResolve
        });

        setPendingSpell(null);
    };

    useEffect(() => {
        const handleError = (err) => alert(err.message);
        socket.on('rules_error', handleError);
        return () => socket.off('rules_error', handleError);
    }, []);

    const rawJson = useMemo(() => {
        try { return JSON.parse(character.raw_dndbeyond_json || '{}'); } catch { return {}; }
    }, [character.raw_dndbeyond_json]);

    const allMods = useMemo(() => {
        let mods = [];
        if (rawJson.modifiers) {
            Object.values(rawJson.modifiers).forEach(arr => {
                if (Array.isArray(arr)) mods = mods.concat(arr);
            });
        }
        return mods;
    }, [rawJson]);

    const stats = character.abilityScores || {};
    const getMod = (val) => Math.floor((val - 10) / 2);
    const formatMod = (val) => {
        const mod = getMod(val);
        return mod >= 0 ? `+${mod}` : mod;
    };

    const rollCheck = (label, bonus) => {
        const r1 = Math.floor(Math.random() * 20) + 1;
        socket.emit('dice_roll', {
            actor: character.name, sides: 20, count: 1, modifier: bonus, total: r1 + bonus, rolls: [r1]
        });
    };

    const handleSync = async () => {
        let url = "";
        try {
            const raw = JSON.parse(character.raw_dndbeyond_json || '{}');
            if (raw.readonlyUrl) url = raw.readonlyUrl;
        } catch (e) { }
        if (!url) url = prompt("D&D Beyond Character URL:", "https://www.dndbeyond.com/characters/...");
        if (!url) return;
        setIsSyncing(true);
        try {
            const res = await fetch(`/api/characters/${character.id}/sync`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
            });
            if (res.ok) { socket.emit('refresh_party'); alert("Synced!"); }
        } catch (err) { alert("Sync failed."); }
        finally { setIsSyncing(false); }
    };

    const handleTokenUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = async () => {
            const res = await fetch(`/api/characters/${character.id}/token`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token_image: reader.result })
            });
            if (res.ok) socket.emit('refresh_party');
        };
        reader.readAsDataURL(file);
    };

    const handleParseItem = async (item, isHomebrew = false) => {
        setIsParsing(item.id);
        try {
            const res = await fetch('/api/homebrew/parse-item', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterId: character.id, itemId: item.id, name: item.name, description: item.description || item.name, isHomebrew })
            });
            if (res.ok) socket.emit('refresh_party');
        } catch (err) { console.error(err); }
        finally { setIsParsing(null); }
    };

    const toggleEquip = (itemId, isHomebrew, type = 'equipped') => {
        socket.emit('update_character', { characterId: character.id, updates: { toggleItem: { itemId, isHomebrew, type } } });
    };

    const attunedCount = [...(character.inventory || []), ...(character.homebrewInventory || [])].filter(i => i.isAttuned).length;

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={onClose}>
            <div className="bg-dnd-surface border border-dnd-border w-full max-w-[1200px] h-[95vh] overflow-hidden rounded-lg shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                <TargetSelectionModal
                    isOpen={showTargetModal}
                    onClose={() => setShowTargetModal(false)}
                    onSelect={handleTargetSelection}
                    actionName={pendingSpell?.name}
                    characterId={character.id}
                />

                {/* Header (Top) */}
                <div className="p-4 bg-dnd-surface border-b border-dnd-border flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-lg bg-dnd-navy border border-dnd-border flex items-center justify-center text-3xl overflow-hidden relative group">
                            {character.tokenImage ? <img src={character.tokenImage} className="w-full h-full object-cover" /> : <span>🛡️</span>}
                            <input type="file" accept="image/*" onChange={handleTokenUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                        </div>
                        <div>
                            <h2 className="fantasy-heading text-2xl m-0 text-white">{character.name}</h2>
                            <p className="text-dnd-gold text-xs uppercase tracking-widest font-semibold m-0">
                                {(Array.isArray(character.classes) ? character.classes : []).map(c => `Level ${c.level} ${c.name}`).join(' / ')}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button className="btn-secondary px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest" onClick={handleSync} disabled={isSyncing}>Sync DDB</button>
                        <button className="text-dnd-muted hover:text-white text-xl px-2" onClick={onClose}>✕</button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left Column: Persistent Stats, Saves, Skills (DDB Style) */}
                    <div className="w-[320px] bg-dnd-navy border-r border-dnd-border flex flex-col overflow-y-auto custom-scrollbar p-4 gap-6 shrink-0">

                        {/* Ability Scores */}
                        <div className="grid grid-cols-3 gap-2">
                            {['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map(s => {
                                const score = stats[s] || 10;
                                const mod = getMod(score);
                                return (
                                    <div key={s} onClick={() => rollCheck(`${s} Check`, mod)} className="bg-dnd-surface border border-dnd-border rounded p-2 text-center cursor-pointer hover:border-dnd-gold group transition-all">
                                        <div className="text-[8px] text-dnd-muted font-bold uppercase group-hover:text-dnd-gold">{s}</div>
                                        <div className="text-xl font-fantasy text-white py-1">{mod >= 0 ? `+${mod}` : mod}</div>
                                        <div className="text-[10px] font-mono text-dnd-muted">{score}</div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Saving Throws */}
                        <div className="bg-dnd-surface/50 border border-dnd-border rounded p-3">
                            <h4 className="text-[10px] text-dnd-gold uppercase font-bold tracking-widest mb-3 border-b border-dnd-border pb-1">Saving Throws</h4>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                {['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map(s => {
                                    const mod = getMod(stats[s] || 10);
                                    // Simplified save prof check
                                    const isProf = allMods.some(m => m.type === 'proficiency' && m.subType && m.subType.includes('saving') && m.subType.includes(STAT_FULL_NAMES[s]));
                                    const bonus = mod + (isProf ? 3 : 0);
                                    return (
                                        <div key={s} onClick={() => rollCheck(`${s} Save`, bonus)} className="flex justify-between items-center cursor-pointer group">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-1.5 h-1.5 rounded-full border border-dnd-border ${isProf ? 'bg-dnd-gold shadow-[0_0_5px_rgba(210,160,23,0.5)]' : ''}`}></div>
                                                <span className="text-[10px] font-bold group-hover:text-dnd-gold uppercase">{s}</span>
                                            </div>
                                            <span className="text-[10px] font-mono text-white">{bonus >= 0 ? `+${bonus}` : bonus}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Skills */}
                        <div className="bg-dnd-surface/50 border border-dnd-border rounded p-3 flex-1">
                            <h4 className="text-[10px] text-dnd-gold uppercase font-bold tracking-widest mb-3 border-b border-dnd-border pb-1">Skills</h4>
                            <div className="flex flex-col gap-1.5">
                                {Object.entries(SKILL_MAP).map(([skill, stat]) => {
                                    const prof = (Array.isArray(character.skills) ? character.skills : []).includes(skill);
                                    const bonus = getMod(stats[stat] || 10) + (prof ? 3 : 0);
                                    return (
                                        <div key={skill} onClick={() => rollCheck(skill, bonus)} className="flex justify-between items-center cursor-pointer group">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-1.5 h-1.5 rounded-full border border-dnd-border ${prof ? 'bg-dnd-gold shadow-[0_0_5px_rgba(210,160,23,0.5)]' : ''}`}></div>
                                                <span className="text-[10px] group-hover:text-dnd-gold">{skill} <span className="text-[8px] text-dnd-muted uppercase">({stat})</span></span>
                                            </div>
                                            <span className="text-[10px] font-mono text-white">{bonus >= 0 ? `+${bonus}` : bonus}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Tabbed Content (Spells, Inventory, etc.) */}
                    <div className="flex-1 flex flex-col overflow-hidden bg-dnd-surface2/30">
                        {/* Tab Navigation */}
                        <div className="flex bg-dnd-navy border-b border-dnd-border px-4 overflow-x-auto custom-scrollbar">
                            {[
                                { id: 'actions', label: '⚔️ Actions' },
                                { id: 'spells', label: '🪄 Spells' },
                                { id: 'inventory', label: '🎒 Inventory' },
                                { id: 'features', label: '✨ Features & Traits' },
                                { id: 'background', label: '📜 Background' },
                                { id: 'notes', label: '📝 Notes' },
                                { id: 'conditions', label: '🩹 Conditions' }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`px-6 py-3 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === tab.id ? 'text-dnd-gold border-dnd-gold bg-dnd-surface/50' : 'text-dnd-muted border-transparent hover:text-white'
                                        }`}
                                >{tab.label}</button>
                            ))}
                        </div>

                        {/* Tab Content Area */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

                            {/* ACTIONS TAB */}
                            {activeTab === 'actions' && (
                                <CombatActions character={character} />
                            )}

                            {/* INVENTORY TAB */}
                            {activeTab === 'inventory' && (
                                <div className="flex flex-col gap-6">
                                    <div className="bg-dnd-navy p-4 rounded-lg border border-dnd-border flex justify-between items-center shadow-lg">
                                        <h4 className="text-[10px] text-dnd-muted font-bold uppercase tracking-widest m-0">Attunement Slots</h4>
                                        <div className="flex gap-2 items-center">
                                            {[1, 2, 3].map(i => (<div key={i} className={`w-3 h-3 rounded-full border border-dnd-gold ${i <= attunedCount ? 'bg-dnd-gold shadow-[0_0_8px_rgba(210,160,23,0.6)]' : 'bg-transparent'}`}></div>))}
                                            <span className="text-dnd-gold text-xs font-bold ml-2">{attunedCount}/3</span>
                                        </div>
                                    </div>
                                    {character.homebrewInventory?.length > 0 && (
                                        <section>
                                            <h4 className="text-dnd-gold text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2">🔮 Homebrew</h4>
                                            <div className="flex flex-col gap-3">
                                                {character.homebrewInventory.map(item => (
                                                    <div key={item.id} className="p-4 bg-dnd-gold/5 border border-dnd-gold/20 rounded-lg group hover:border-dnd-gold/40 transition-all">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div><strong className="text-dnd-gold block">{item.name}</strong>
                                                                <div className="flex gap-2 mt-1">
                                                                    <span className={`text-[8px] uppercase font-bold px-2 py-0.5 rounded cursor-pointer border ${item.equipped ? 'bg-dnd-green/20 text-dnd-green border-dnd-green/30' : 'bg-dnd-muted/10 text-dnd-muted border border-dnd-muted/20'}`} onClick={() => toggleEquip(item.id, true, 'equipped')}>{item.equipped ? 'Equipped' : 'Unequipped'}</span>
                                                                    <span className={`text-[8px] uppercase font-bold px-2 py-0.5 rounded cursor-pointer border ${item.isAttuned ? 'bg-dnd-gold/20 text-dnd-gold border-dnd-gold/30' : 'bg-dnd-muted/10 text-dnd-muted border border-dnd-muted/20'}`} onClick={() => toggleEquip(item.id, true, 'attuned')}>{item.isAttuned ? 'Attuned' : 'No'}</span>
                                                                </div>
                                                            </div>
                                                            <button className="text-[9px] text-dnd-gold/60 hover:text-dnd-gold uppercase font-bold" onClick={() => handleParseItem(item, true)} disabled={isParsing === item.id}>✨ AI Parse</button>
                                                        </div>
                                                        <p className="text-[11px] text-dnd-text italic leading-relaxed">"{item.description}"</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    )}
                                    <section>
                                        <h4 className="text-dnd-muted text-[10px] font-bold uppercase tracking-widest mb-3">🎒 Equipment</h4>
                                        <div className="grid grid-cols-1 gap-2">
                                            {(character.inventory || []).map((item, idx) => (
                                                <div key={idx} className="p-3 bg-dnd-surface border border-dnd-border rounded flex justify-between items-center hover:border-dnd-muted/30 transition-all">
                                                    <div>
                                                        <div className="text-xs font-bold text-white">{item.name} <span className="text-dnd-muted text-[10px] ml-1">x{item.quantity}</span></div>
                                                        <div className="flex gap-2 mt-1">
                                                            <span className={`text-[8px] uppercase font-bold rounded cursor-pointer border px-2 py-0.5 ${item.equipped ? 'bg-dnd-green/20 text-dnd-green border-dnd-green/30' : 'bg-dnd-muted/10 text-dnd-muted border border-dnd-muted/20'}`} onClick={() => toggleEquip(item.id || item.name, false, 'equipped')}>{item.equipped ? 'Equipped' : 'Unequipped'}</span>
                                                            <span className={`text-[8px] uppercase font-bold rounded cursor-pointer border px-2 py-0.5 ${item.isAttuned ? 'bg-dnd-gold/20 text-dnd-gold border-dnd-gold/30' : 'bg-dnd-muted/10 text-dnd-muted border border-dnd-muted/20'}`} onClick={() => toggleEquip(item.id || item.name, false, 'attuned')}>{item.isAttuned ? 'Attuned' : 'No'}</span>
                                                        </div>
                                                    </div>
                                                    <button className="text-[9px] text-dnd-muted hover:text-dnd-gold font-bold uppercase" onClick={() => handleParseItem({ ...item, id: `inv-${idx}` }, false)} disabled={isParsing === `inv-${idx}`}>🔮 AI Parse</button>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                </div>
                            )}

                            {/* SPELLS TAB */}
                            {activeTab === 'spells' && (
                                <div className="flex flex-col gap-6">
                                    <section className="bg-dnd-navy/50 p-4 rounded-lg border border-dnd-border shadow-inner">
                                        <h4 className="text-dnd-blue text-[10px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2">🪄 Spell Slots</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                            {Object.entries(character.spellSlotsMax || {}).map(([lvl, max]) => {
                                                if (max === 0) return null;
                                                const used = (character.spellSlotsUsed || {})[lvl] || 0;
                                                return (
                                                    <div key={lvl} className="flex flex-col items-center">
                                                        <span className="text-[10px] text-dnd-muted mb-1 font-bold">Lvl {lvl}</span>
                                                        <div className="flex gap-1.5 flex-wrap justify-center">
                                                            {[...Array(max)].map((_, i) => (<div key={i} onClick={() => { if (i >= used) socket.emit('use_spell_slot', { characterId: character.id, slotLevel: lvl }); }} className={`w-3 h-3 rounded-full border-2 transition-all cursor-pointer ${i < used ? 'bg-dnd-blue border-dnd-blue shadow-[0_0_8px_rgba(88,166,255,0.5)]' : 'bg-transparent border-dnd-blue/40 hover:border-dnd-blue'}`}></div>))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </section>
                                    {character.concentratingOn && (
                                        <div className="bg-dnd-red/10 border border-dnd-red/30 p-4 rounded-lg flex justify-between items-center animate-pulse">
                                            <div><span className="text-[10px] text-dnd-red font-bold uppercase mb-1 block tracking-widest">Concentrating On</span><strong className="text-white text-lg font-fantasy tracking-wider">{character.concentratingOn}</strong></div>
                                            <button className="bg-dnd-red/20 text-dnd-red text-xs px-4 py-2 rounded border border-dnd-red/30 font-bold uppercase tracking-widest hover:bg-dnd-red/30 transition-all shadow-lg" onClick={() => socket.emit('drop_concentration', { characterId: character.id })}>Break</button>
                                        </div>
                                    )}
                                    <div className="flex flex-col gap-4">
                                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => {
                                            const levelSpells = (character.spells || []).filter(s => s.level === level);
                                            if (levelSpells.length === 0) return null;
                                            return (
                                                <div key={level} className="flex flex-col gap-2">
                                                    <h5 className="text-[10px] font-bold text-dnd-muted uppercase tracking-[0.2em] border-b border-dnd-border pb-1 mb-1">{level === 0 ? 'Cantrips' : `Level ${level}`}</h5>
                                                    {levelSpells.map((s, idx) => (
                                                        <SpellItem key={idx} spell={s} character={character} onCast={handleSpellCast} />
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* FEATURES TAB */}
                            {activeTab === 'features' && (
                                <div className="flex flex-col gap-4">
                                    <h4 className="text-[10px] text-dnd-muted uppercase font-bold tracking-widest mb-2 border-b border-dnd-border pb-1">Features & Traits</h4>
                                    {(character.features || []).length === 0 ? (
                                        <div className="text-center py-10 text-dnd-muted italic text-sm">No specific class or racial features found.</div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {(character.features || []).map((f, idx) => (
                                                <div key={idx} className="p-4 bg-dnd-surface border border-dnd-border rounded-lg shadow-sm hover:border-dnd-gold/30 transition-all">
                                                    <h4 className="text-dnd-gold font-fantasy text-sm mb-2 uppercase tracking-wide">{f.name}</h4>
                                                    <div className="text-[10px] text-dnd-muted leading-relaxed" dangerouslySetInnerHTML={{ __html: f.description }} />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* BACKGROUND TAB */}
                            {activeTab === 'background' && (
                                <div className="flex flex-col gap-4">
                                    {character.backstory ? (
                                        <div className="p-4 bg-dnd-navy/30 border border-dnd-gold/20 rounded-lg shadow-xl">
                                            <h4 className="text-dnd-gold font-fantasy text-lg mb-4 underline underline-offset-4 decoration-dnd-gold/30">📜 Backstory</h4>
                                            <p className="text-[11px] text-dnd-text italic leading-relaxed whitespace-pre-wrap">{character.backstory}</p>
                                        </div>
                                    ) : (
                                        <div className="text-center py-10 bg-dnd-surface border border-dnd-border rounded-xl">
                                            <span className="text-2xl mb-2 block">📖</span>
                                            <span className="text-dnd-muted italic text-sm">No backstory has been written for this character yet.</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* NOTES TAB */}
                            {activeTab === 'notes' && (
                                <div className="flex flex-col gap-4">
                                    <h4 className="text-[10px] text-dnd-muted uppercase font-bold tracking-widest mb-2 border-b border-dnd-border pb-1">Character Notes</h4>
                                    <div className="p-4 bg-dnd-navy/30 border border-dnd-border rounded-lg min-h-[200px] shadow-inner text-dnd-text text-sm font-serif">
                                        {character.notes || <span className="text-dnd-muted italic">No notes recorded. (Editing coming soon)</span>}
                                    </div>
                                </div>
                            )}

                            {/* CONDITIONS TAB (New tooltips area) */}
                            {activeTab === 'conditions' && (
                                <div className="flex flex-col gap-4">
                                    <h4 className="text-[10px] text-dnd-muted uppercase font-bold tracking-widest mb-2">Active Conditions</h4>
                                    {(character.conditions || []).length === 0 ? (
                                        <div className="text-center py-10 text-dnd-muted italic text-sm">No active conditions. Stay healthy!</div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {(character.conditions || []).map((c, i) => (
                                                <div key={i} className="bg-dnd-red/5 border border-dnd-red/20 p-4 rounded-lg flex flex-col gap-2 relative overflow-hidden group hover:bg-dnd-red/10 transition-all">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-dnd-red font-bold uppercase text-xs tracking-widest">{c}</span>
                                                        <button onClick={() => socket.emit('remove_condition', { characterId: character.id, condition: c })} className="text-[10px] text-dnd-muted hover:text-white">Remove</button>
                                                    </div>
                                                    <p className="text-[10px] text-dnd-text leading-relaxed italic">
                                                        {CONDITION_EFFECTS[c.toLowerCase()] || 'No mechanical data recorded.'}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
