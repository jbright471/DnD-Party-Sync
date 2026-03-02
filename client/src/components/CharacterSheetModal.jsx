import React, { useState, useEffect } from 'react';
import socket from '../socket';

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
                            if (hasSlots) onCast(spell.level);
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
                    <div className="text-xs text-dnd-text leading-relaxed border-t border-dnd-border pt-3 mt-1 opacity-80" dangerouslySetInnerHTML={{ __html: spell.description }} />
                </div>
            )}
        </div>
    );
};

export default function CharacterSheetModal({ character, onClose }) {
    const [activeTab, setActiveTab] = useState('stats');
    const [isSyncing, setIsSyncing] = useState(false);
    const [isParsing, setIsParsing] = useState(null);

    useEffect(() => {
        const handleError = (err) => alert(err.message);
        socket.on('rules_error', handleError);
        return () => socket.off('rules_error', handleError);
    }, []);

    const rawJson = React.useMemo(() => {
        try { return JSON.parse(character.raw_dndbeyond_json || '{}'); } catch { return {}; }
    }, [character.raw_dndbeyond_json]);

    const dataJson = React.useMemo(() => {
        try { return JSON.parse(character.data_json || '{}'); } catch { return {}; }
    }, [character.data_json]);

    const allMods = React.useMemo(() => {
        let mods = [];
        if (rawJson.modifiers) {
            Object.values(rawJson.modifiers).forEach(arr => {
                if (Array.isArray(arr)) mods = mods.concat(arr);
            });
        }
        return mods;
    }, [rawJson]);

    const rollCheck = (label, bonus, hasAdvantage) => {
        const r1 = Math.floor(Math.random() * 20) + 1;
        const r2 = Math.floor(Math.random() * 20) + 1;
        const finalRoll = hasAdvantage ? Math.max(r1, r2) : r1;
        const total = finalRoll + bonus;
        const modStr = bonus >= 0 ? `+${bonus}` : `${bonus}`;
        let desc = `rolled **${total}** for ${label} (1d20${modStr})`;
        if (hasAdvantage) desc = `rolled **${total}** for ${label} with Advantage ([${r1}, ${r2}]${modStr})`;

        socket.emit('log_action', {
            actor: character.name,
            description: desc,
            useLlm: false
        });
    };

    const stats = character.abilityScores || {};
    const getMod = (val) => Math.floor((val - 10) / 2);
    const formatMod = (val) => {
        const mod = getMod(val);
        return mod >= 0 ? `+${mod}` : mod;
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
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            if (res.ok) { socket.emit('refresh_party'); alert("Synced!"); }
        } catch (err) { alert("Sync failed."); }
        finally { setIsSyncing(false); }
    };

    const handleParseItem = async (item, isHomebrew = false) => {
        setIsParsing(item.id);
        try {
            const res = await fetch('/api/homebrew/parse-item', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={onClose}>
            <div className="bg-dnd-surface border border-dnd-border w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-lg shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-6 bg-dnd-surface border-b border-dnd-border flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-lg bg-dnd-navy border border-dnd-border flex items-center justify-center text-3xl">🛡️</div>
                        <div>
                            <h2 className="fantasy-heading text-3xl m-0 leading-tight">{character.name}</h2>
                            <p className="text-dnd-gold m-0 text-sm uppercase tracking-widest font-semibold">
                                {(Array.isArray(character.classes) ? character.classes : []).map(c => `Level ${c.level} ${c.name}`).join(' / ')}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button className="btn-secondary px-4 py-2 text-xs" onClick={handleSync} disabled={isSyncing}>{isSyncing ? '⌛ Syncing...' : '🔄 Sync DDB'}</button>
                        <button className="text-dnd-muted hover:text-white transition-colors text-2xl" onClick={onClose}>✕</button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden h-[65vh] flex-col md:flex-row">
                    <div className="w-full md:w-48 bg-dnd-navy border-b md:border-b-0 md:border-r border-dnd-border flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible no-scrollbar shrink-0">
                        {[
                            { id: 'stats', label: '📊 Attributes' },
                            { id: 'skills', label: '🎯 Skills' },
                            { id: 'inventory', label: '🎒 Inventory' },
                            { id: 'features', label: '✨ Features' },
                            { id: 'spells', label: '🪄 Spellbook' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-sm transition-all border-b-2 md:border-b-0 md:border-l-4 whitespace-nowrap flex-1 md:flex-none ${activeTab === tab.id
                                    ? 'bg-dnd-surface text-dnd-gold border-dnd-gold'
                                    : 'text-dnd-muted border-transparent hover:text-dnd-text'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 p-6 overflow-y-auto bg-dnd-surface2/50">
                        {activeTab === 'stats' && (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map(s => {
                                    const fullName = STAT_FULL_NAMES[s];
                                    const score = stats[s] || 10;
                                    const mod = getMod(score);
                                    const profBonus = character.proficiencyBonus || Math.ceil((character.classes?.[0]?.level || 1) / 4) + 1;

                                    let hasSaveProf = false;
                                    let hasSaveAdv = false;
                                    let saveBonus = mod;

                                    if (allMods.length > 0) {
                                        hasSaveProf = allMods.some(m => m.type === 'proficiency' && m.subType && m.subType.includes('saving') && m.subType.includes(fullName));
                                        hasSaveAdv = allMods.some(m => m.type === 'advantage' && m.subType && m.subType.includes('saving') && m.subType.includes(fullName));
                                        saveBonus = mod + (hasSaveProf ? profBonus : 0);
                                    } else if (dataJson.savingThrows && dataJson.savingThrows[s] !== undefined) {
                                        // PDF fallback
                                        saveBonus = dataJson.savingThrows[s];
                                        hasSaveProf = saveBonus > mod;
                                    }

                                    return (
                                        <div key={s}
                                            onClick={() => rollCheck(`${s} Save`, saveBonus, hasSaveAdv)}
                                            className="bg-dnd-surface p-4 rounded-lg border border-dnd-border text-center relative mb-2 cursor-pointer hover:border-dnd-gold/40 transition-colors group">
                                            {hasSaveAdv && <div className="absolute -top-2 -left-2 bg-dnd-green text-dnd-navy text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-dnd-green/50 z-10">A</div>}
                                            <div className="flex justify-between items-center absolute top-2 right-3 left-3">
                                                <div className="text-[10px] text-dnd-muted font-bold uppercase tracking-tighter">{s}</div>
                                                <div className={`w-2.5 h-2.5 rounded-full border border-dnd-gold/50 ${hasSaveProf ? 'bg-dnd-gold shadow-[0_0_5px_rgba(210,160,23,0.5)]' : 'bg-transparent'}`} title="Saving Throw Proficiency"></div>
                                            </div>
                                            <div className="text-3xl md:text-4xl mt-3 mb-2 text-white font-fantasy group-hover:text-dnd-blue transition-colors duration-200">
                                                {formatMod(score)}
                                            </div>
                                            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-dnd-navy px-3 py-0.5 rounded-full border border-dnd-border text-[10px] md:text-xs font-mono">
                                                {score}
                                            </div>
                                        </div>
                                    );
                                })}
                                <div className="col-span-2 md:col-span-3 mt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <div className="stat-box"><div className="label">Armor Class</div><div className="value">{character.ac}</div></div>
                                    <div className="stat-box"><div className="label">Hit Points</div><div className="value">{character.currentHp} / {character.maxHp}</div></div>
                                    <div className="stat-box col-span-2 md:col-span-1"><div className="label">Prof. Bonus</div><div className="value">+{(character.proficiencyBonus) || Math.ceil((character.classes?.[0]?.level || 1) / 4) + 1}</div></div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'skills' && (
                            <div className="flex flex-col gap-2">
                                {Object.entries(SKILL_MAP).map(([skill, stat]) => {
                                    const prof = (Array.isArray(character.skills) ? character.skills : []).includes(skill);
                                    const profBonus = character.proficiencyBonus || Math.ceil((character.level || 1) / 4) + 1;
                                    const bonus = getMod(stats[stat] || 10) + (prof ? profBonus : 0);

                                    const skillId = skill.toLowerCase().replace(/ /g, '-');
                                    const hasAdv = allMods.some(m => m.type === 'advantage' && (m.subType === skillId || m.subType === 'ability-checks' || m.subType === `${STAT_FULL_NAMES[stat]}-ability-checks`));

                                    return (
                                        <div key={skill}
                                            onClick={() => rollCheck(skill, bonus, hasAdv)}
                                            className="flex justify-between items-center px-4 py-2 bg-dnd-surface rounded border border-dnd-border hover:border-dnd-gold/40 cursor-pointer transition-colors group">
                                            <div className="flex gap-3 items-center">
                                                <div className={`w-2.5 h-2.5 rounded-full border border-dnd-gold/50 shrink-0 ${prof ? 'bg-dnd-gold shadow-[0_0_5px_rgba(210,160,23,0.5)]' : 'bg-transparent'}`}></div>
                                                <span className="text-sm group-hover:text-dnd-gold transition-colors duration-200">{skill} <span className="text-dnd-muted text-[10px]">({stat})</span></span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {hasAdv && <span className="bg-dnd-green text-dnd-navy text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-dnd-green/50" title="Advantage">A</span>}
                                                <span className={`text-sm font-bold ${bonus >= 0 ? 'text-dnd-green' : 'text-dnd-red'}`}>{bonus >= 0 ? `+${bonus}` : bonus}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {activeTab === 'inventory' && (
                            <div className="flex flex-col gap-6">
                                <div className="bg-dnd-navy p-4 rounded-lg border border-dnd-border flex justify-between items-center sticky top-0 z-10">
                                    <h4 className="text-dnd-muted text-[10px] font-bold uppercase tracking-widest m-0 flex items-center gap-2">Attunement Slots</h4>
                                    <div className="flex gap-2 items-center">
                                        {[1, 2, 3].map(i => (<div key={i} className={`w-3 h-3 rounded-full border border-dnd-gold ${i <= attunedCount ? 'bg-dnd-gold shadow-[0_0_8px_rgba(210,160,23,0.6)]' : 'bg-transparent'}`}></div>))}
                                        <span className="text-dnd-gold text-xs font-bold ml-2">{attunedCount}/3</span>
                                    </div>
                                </div>
                                {character.homebrewInventory?.length > 0 && (
                                    <section>
                                        <h4 className="text-dnd-gold text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2">🔮 Homebrew Gear</h4>
                                        <div className="flex flex-col gap-3">
                                            {character.homebrewInventory.map(item => (
                                                <div key={item.id} className="p-4 bg-dnd-gold/5 border border-dnd-gold/20 rounded-lg group hover:border-dnd-gold/40 transition-colors">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div><strong className="text-dnd-gold block text-base">{item.name}</strong>
                                                            <div className="flex gap-2 mt-1">
                                                                <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded cursor-pointer border ${item.equipped ? 'bg-dnd-green/20 text-dnd-green border-dnd-green/30' : 'bg-dnd-muted/10 text-dnd-muted border border-dnd-muted/20'}`} onClick={() => toggleEquip(item.id, true, 'equipped')}>{item.equipped ? 'Equipped' : 'Unequipped'}</span>
                                                                <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded cursor-pointer border ${item.isAttuned ? 'bg-dnd-gold/20 text-dnd-gold border-dnd-gold/30' : 'bg-dnd-muted/10 text-dnd-muted border border-dnd-muted/20'}`} onClick={() => toggleEquip(item.id, true, 'attuned')}>{item.isAttuned ? 'Attuned' : 'Not Attuned'}</span>
                                                            </div>
                                                        </div>
                                                        <button className="text-[10px] text-dnd-gold/60 hover:text-dnd-gold uppercase font-bold" onClick={() => handleParseItem(item, true)} disabled={isParsing === item.id}>{isParsing === item.id ? '⌛ Parsing...' : '✨ Re-parse AI'}</button>
                                                    </div>
                                                    <p className="text-xs text-dnd-muted mb-3">{item.description}</p>
                                                    {item.stats && (item.stats.acBonus > 0 || Object.keys(item.stats.statBonuses || {}).length > 0) && (
                                                        <div className="flex flex-wrap gap-2">
                                                            {item.stats.acBonus > 0 && <span className="text-[9px] bg-dnd-navy border border-dnd-gold text-dnd-gold px-2 py-0.5 rounded uppercase font-bold">+{item.stats.acBonus} AC</span>}
                                                            {Object.entries(item.stats.statBonuses || {}).map(([s, b]) => (<span key={s} className="text-[9px] bg-dnd-navy border border-dnd-gold text-dnd-gold px-2 py-0.5 rounded uppercase font-bold">+{b} {s}</span>))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}
                                <section>
                                    <h4 className="text-dnd-muted text-[10px] font-bold uppercase tracking-widest mb-3">🎒 Equipment</h4>
                                    <div className="flex flex-col gap-2">
                                        {(character.inventory || []).map((item, idx) => (
                                            <div key={idx} className="p-3 bg-dnd-surface border border-dnd-border rounded flex justify-between items-center hover:border-dnd-muted/30 transition-all">
                                                <div>
                                                    <div className="text-sm font-semibold text-white">{item.name} <span className="text-dnd-muted text-xs ml-1">x{item.quantity}</span></div>
                                                    <div className="flex gap-2 mt-1">
                                                        <span className={`text-[9px] uppercase font-bold rounded cursor-pointer border px-2 py-0.5 ${item.equipped ? 'bg-dnd-green/20 text-dnd-green border-dnd-green/30' : 'bg-dnd-muted/10 text-dnd-muted border border-dnd-muted/20'}`} onClick={() => toggleEquip(item.id || item.name, false, 'equipped')}>{item.equipped ? 'Equipped' : 'Unequipped'}</span>
                                                        <span className={`text-[9px] uppercase font-bold rounded cursor-pointer border px-2 py-0.5 ${item.isAttuned ? 'bg-dnd-gold/20 text-dnd-gold border-dnd-gold/30' : 'bg-dnd-muted/10 text-dnd-muted border border-dnd-muted/20'}`} onClick={() => toggleEquip(item.id || item.name, false, 'attuned')}>{item.isAttuned ? 'Attuned' : 'Not Attuned'}</span>
                                                    </div>
                                                </div>
                                                <button className="text-[10px] text-dnd-muted hover:text-dnd-gold font-bold uppercase transition-colors" onClick={() => handleParseItem({ ...item, id: `inv-${idx}` }, false)} disabled={isParsing === `inv-${idx}`}>{isParsing === `inv-${idx}` ? '⌛' : '🔮 Parse'}</button>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === 'features' && (
                            <div className="flex flex-col gap-4">
                                {character.backstory && (
                                    <div className="p-4 bg-dnd-navy/30 border border-dnd-gold/20 rounded-lg mb-2 shadow-inner">
                                        <h4 className="fantasy-heading text-base mb-2">📜 Backstory</h4>
                                        <p className="text-xs md:text-sm text-dnd-muted italic leading-relaxed">{character.backstory}</p>
                                    </div>
                                )}
                                {(character.features || []).map((f, idx) => (
                                    <div key={idx} className="p-4 bg-dnd-surface border border-dnd-border rounded-lg hover:border-dnd-gold/20 transition-colors">
                                        <h4 className="fantasy-heading text-base mb-2">{f.name}</h4>
                                        <div className="text-xs md:text-sm text-dnd-muted leading-relaxed opacity-90" dangerouslySetInnerHTML={{ __html: f.description }} />
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeTab === 'spells' && (
                            <div className="flex flex-col gap-6">
                                <section className="bg-dnd-navy/50 p-3 md:p-4 rounded-lg border border-dnd-border">
                                    <h4 className="text-dnd-blue text-[10px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2">🪄 Spell Slots</h4>
                                    <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-5 gap-3 md:gap-4">
                                        {Object.entries(character.spellSlotsMax || {}).map(([lvl, max]) => {
                                            if (max === 0) return null;
                                            const used = (character.spellSlotsUsed || {})[lvl] || 0;
                                            return (
                                                <div key={lvl} className="flex flex-col items-center bg-dnd-surface/40 p-2 rounded border border-dnd-border/50">
                                                    <span className="text-[10px] text-dnd-muted mb-2 font-bold uppercase">Lvl {lvl}</span>
                                                    <div className="flex gap-1.5 flex-wrap justify-center">
                                                        {[...Array(max)].map((_, i) => (<div key={i} onClick={() => { if (i >= used) socket.emit('use_spell_slot', { characterId: character.id, slotLevel: lvl }); }} className={`w-3.5 h-3.5 rounded-full border-2 transition-all cursor-pointer ${i < used ? 'bg-dnd-blue border-dnd-blue shadow-[0_0_8px_rgba(56,189,248,0.4)]' : 'bg-transparent border-dnd-blue/40 hover:border-dnd-blue/70'}`}></div>))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                                {character.concentratingOn && (
                                    <div className="bg-dnd-red/10 border border-dnd-red/30 p-4 rounded-lg flex justify-between items-center animate-pulse">
                                        <div><span className="text-[10px] text-dnd-red font-bold uppercase mb-1 block">Concentrating On</span><strong className="text-white text-lg font-fantasy">{character.concentratingOn}</strong></div>
                                        <button className="bg-dnd-red/20 text-dnd-red text-xs px-4 py-2 rounded border border-dnd-red/30 font-bold uppercase tracking-widest" onClick={() => socket.emit('drop_concentration', { characterId: character.id })}>Break</button>
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
                                                    <SpellItem key={idx} spell={s} character={character} onCast={(lvl) => socket.emit(s.isConcentration ? 'cast_concentration_spell' : 'use_spell_slot', { characterId: character.id, spellName: s.name, slotLevel: lvl > 0 ? lvl : null })} />
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* Added Conditions with Tooltips logic */}
            <style dangerouslySetInnerHTML={{
                __html: `
                .stat-box { background: var(--dnd-navy); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--dnd-border); text-align: center; }
                .stat-box .label { font-size: 0.7rem; color: var(--dnd-muted); text-transform: uppercase; margin-bottom: 0.25rem; }
                .stat-box .value { font-size: 1.2rem; font-weight: bold; color: var(--dnd-gold); }
            `}} />
        </div>
    );
}
