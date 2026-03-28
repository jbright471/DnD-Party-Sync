import React, { useState, useMemo } from 'react';
import socket from '../socket';

const SKILL_MAP = {
    'Acrobatics': 'DEX', 'Animal Handling': 'WIS', 'Arcana': 'INT', 'Athletics': 'STR',
    'Deception': 'CHA', 'History': 'INT', 'Insight': 'WIS', 'Intimidation': 'CHA',
    'Investigation': 'INT', 'Medicine': 'WIS', 'Nature': 'INT', 'Perception': 'WIS',
    'Performance': 'CHA', 'Persuasion': 'CHA', 'Religion': 'INT', 'Sleight of Hand': 'DEX',
    'Stealth': 'DEX', 'Survival': 'WIS'
};

const STAT_FULL_NAMES = { STR: 'strength', DEX: 'dexterity', CON: 'constitution', INT: 'intelligence', WIS: 'wisdom', CHA: 'charisma' };

export default function CharacterSheetView({ character }) {
    if (!character) return (
        <div className="h-full w-full flex items-center justify-center bg-gray-900">
            <div className="text-dnd-muted/50 text-xl font-fantasy">Select a character</div>
        </div>
    );

    const rawJson = useMemo(() => {
        try { return JSON.parse(character.raw_dndbeyond_json || '{}'); } catch { return {}; }
    }, [character.raw_dndbeyond_json]);

    const dataJson = useMemo(() => {
        try { return JSON.parse(character.data_json || '{}'); } catch { return {}; }
    }, [character.data_json]);

    const allMods = useMemo(() => {
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

    const profBonus = character.proficiencyBonus || Math.ceil((character.level || character.classes?.[0]?.level || 1) / 4) + 1;
    const speed = dataJson.speed || 30;
    const initiative = getMod(stats.DEX || 10);

    return (
        <div className="h-full w-full overflow-y-auto bg-gray-900 p-3 md:p-6 text-white custom-scrollbar">

            {/* Header / Info Block */}
            <div className="flex flex-col gap-4 border-b border-dnd-border pb-4 mb-4">
                <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-md bg-gray-950 border-2 border-dnd-gold flex items-center justify-center text-3xl shadow-[0_0_10px_rgba(210,160,23,0.3)] shrink-0">
                        🛡️
                    </div>
                    <div className="flex-1">
                        <h2 className="fantasy-heading text-xl md:text-2xl m-0 leading-tight text-white">{character.name}</h2>
                        <p className="text-dnd-gold m-0 text-[10px] md:text-xs uppercase tracking-widest font-semibold truncate max-w-[200px] md:max-w-full">
                            {(Array.isArray(character.classes) ? character.classes : []).map(c => `Lv${c.level} ${c.name}`).join(' / ')}
                        </p>
                    </div>
                    <div className="bg-gray-900 border border-dnd-border rounded px-2 py-1 text-center shrink-0">
                        <div className="text-[8px] md:text-[10px] text-dnd-muted uppercase font-bold tracking-wider">Prof Bonus</div>
                        <div className="text-sm md:text-base font-bold text-dnd-gold">+{profBonus}</div>
                    </div>
                </div>

                {/* Core Stats Priority Block */}
                <div className="grid grid-cols-3 gap-2 md:gap-4">
                    <div className="col-span-3 bg-gray-950 border border-dnd-border rounded-lg p-3 relative overflow-hidden flex flex-col items-center justify-center shadow-inner">
                        <div className="absolute inset-0 bg-gradient-to-t from-dnd-red/10 to-transparent pointer-events-none" />
                        <div className="text-[10px] text-dnd-muted uppercase font-bold tracking-wider mb-1 relative z-10">Hit Points</div>
                        <div className="text-3xl md:text-4xl font-bold text-white relative z-10 flex items-baseline gap-1 font-fantasy">
                            {character.currentHp} <span className="text-sm md:text-base text-dnd-red/80 font-sans">/ {character.maxHp}</span>
                        </div>
                        <div className="absolute bottom-0 left-0 h-1.5 md:h-2 bg-gray-800 w-full" />
                        <div className="absolute bottom-0 left-0 h-1.5 md:h-2 bg-dnd-red transition-all duration-500 ease-out shadow-[0_0_8px_#EF4444]" style={{ width: `${Math.max(0, Math.min(100, (character.currentHp / (character.maxHp || 1)) * 100))}%` }} />
                    </div>

                    <div className="bg-gray-950 border border-dnd-border rounded-lg p-2 flex flex-col items-center justify-center hover:border-dnd-gold/50 transition-colors">
                        <div className="text-[9px] md:text-[10px] text-dnd-muted uppercase font-bold tracking-wider mb-1">Armor Class</div>
                        <div className="text-lg md:text-xl font-bold text-white flex items-center gap-1.5"><span className="text-dnd-gold text-sm md:text-lg">🛡️</span> {character.ac}</div>
                    </div>
                    <div className="bg-gray-950 border border-dnd-border rounded-lg p-2 flex flex-col items-center justify-center hover:border-dnd-gold/50 transition-colors">
                        <div className="text-[9px] md:text-[10px] text-dnd-muted uppercase font-bold tracking-wider mb-1">Initiative</div>
                        <div className="text-lg md:text-xl font-bold text-white">{initiative >= 0 ? `+${initiative}` : initiative}</div>
                    </div>
                    <div className="bg-gray-950 border border-dnd-border rounded-lg p-2 flex flex-col items-center justify-center hover:border-dnd-gold/50 transition-colors">
                        <div className="text-[9px] md:text-[10px] text-dnd-muted uppercase font-bold tracking-wider mb-1">Speed</div>
                        <div className="text-lg md:text-xl font-bold text-white">{speed}ft</div>
                    </div>
                </div>
            </div>

            {/* Horizontal Ability Scores Row */}
            <div className="flex justify-between gap-2 mb-6 overflow-x-auto pb-2 custom-scrollbar">
                {['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map(s => {
                    const score = stats[s] || 10;
                    return (
                        <div key={s} className="bg-gray-950 border border-dnd-border rounded-lg p-2 text-center flex-1 min-w-[65px] relative">
                            <div className="text-[10px] text-dnd-muted font-bold uppercase tracking-tighter mb-1 relative z-10">{s}</div>
                            <div className="text-2xl lg:text-3xl text-white font-fantasy relative z-10">
                                {formatMod(score)}
                            </div>
                            <div className="mt-1 bg-gray-900 border border-dnd-border rounded-full text-[10px] lg:text-xs font-mono w-8 h-5 mx-auto flex items-center justify-center relative z-10">
                                {score}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Body 2-Column Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Left Column: Saves & Senses */}
                <div className="flex flex-col gap-6">
                    <div className="bg-gray-950 border border-dnd-border rounded-lg p-3">
                        <h3 className="text-xs text-dnd-gold uppercase tracking-widest font-bold border-b border-dnd-border pb-2 mb-3">Saving Throws</h3>
                        <div className="flex flex-col gap-1.5">
                            {['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map(s => {
                                const fullName = STAT_FULL_NAMES[s];
                                const score = stats[s] || 10;
                                const mod = getMod(score);

                                let hasSaveProf = false;
                                let hasSaveAdv = false;
                                let saveBonus = mod;

                                if (allMods.length > 0) {
                                    hasSaveProf = allMods.some(m => m.type === 'proficiency' && m.subType && m.subType.includes('saving') && m.subType.includes(fullName));
                                    hasSaveAdv = allMods.some(m => m.type === 'advantage' && m.subType && m.subType.includes('saving') && m.subType.includes(fullName));
                                    saveBonus = mod + (hasSaveProf ? profBonus : 0);
                                } else if (dataJson.savingThrows && dataJson.savingThrows[s] !== undefined) {
                                    saveBonus = dataJson.savingThrows[s];
                                    hasSaveProf = saveBonus > mod;
                                }

                                return (
                                    <div key={s} onClick={() => rollCheck(`${s} Save`, saveBonus, hasSaveAdv)} className="flex justify-between items-center p-2 rounded hover:bg-white/5 cursor-pointer group transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2.5 h-2.5 rounded-full border border-dnd-gold/50 shrink-0 ${hasSaveProf ? 'bg-dnd-gold shadow-[0_0_5px_rgba(210,160,23,0.5)]' : 'bg-transparent'}`}></div>
                                            <span className="text-sm uppercase font-bold group-hover:text-dnd-gold transition-colors">{s}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {hasSaveAdv && <span className="bg-dnd-green text-dnd-navy text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-dnd-green/50">A</span>}
                                            <span className={`text-sm font-bold w-6 text-right ${saveBonus >= 0 ? 'text-white' : 'text-dnd-red'}`}>
                                                {saveBonus >= 0 ? `+${saveBonus}` : saveBonus}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="bg-gray-950 border border-dnd-border rounded-lg p-3">
                        <h3 className="text-xs text-dnd-gold uppercase tracking-widest font-bold border-b border-dnd-border pb-2 mb-3">Senses</h3>
                        <div className="flex flex-col gap-2 text-sm text-dnd-muted">
                            <div className="flex justify-between p-1"><span>Passive Perception</span><span className="text-white font-bold">{dataJson.passivePerception || 10 + getMod(stats.WIS || 10)}</span></div>
                            <div className="flex justify-between p-1"><span>Passive Investigation</span><span className="text-white font-bold">{dataJson.passiveInvestigation || 10 + getMod(stats.INT || 10)}</span></div>
                            <div className="flex justify-between p-1"><span>Passive Insight</span><span className="text-white font-bold">{dataJson.passiveInsight || 10 + getMod(stats.WIS || 10)}</span></div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Skills */}
                <div className="flex flex-col gap-6">
                    <div className="bg-gray-950 border border-dnd-border rounded-lg p-3">
                        <h3 className="text-xs text-dnd-gold uppercase tracking-widest font-bold border-b border-dnd-border pb-2 mb-3">Skills</h3>
                        <div className="flex flex-col gap-0.5">
                            {Object.entries(SKILL_MAP).map(([skill, stat]) => {
                                const prof = (Array.isArray(character.skills) ? character.skills : []).includes(skill);
                                const bonus = getMod(stats[stat] || 10) + (prof ? profBonus : 0);
                                const skillId = skill.toLowerCase().replace(/ /g, '-');
                                const hasAdv = allMods.some(m => m.type === 'advantage' && (m.subType === skillId || m.subType === 'ability-checks' || m.subType === `${STAT_FULL_NAMES[stat]}-ability-checks`));

                                return (
                                    <div key={skill} onClick={() => rollCheck(skill, bonus, hasAdv)} className="flex justify-between items-center px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer group transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2.5 h-2.5 rounded-full border border-dnd-gold/50 shrink-0 ${prof ? 'bg-dnd-gold shadow-[0_0_5px_rgba(210,160,23,0.5)]' : 'bg-transparent'}`}></div>
                                            <span className="text-[13px] group-hover:text-dnd-gold transition-colors">{skill} <span className="text-dnd-muted/50 text-[9px] uppercase">({stat})</span></span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {hasAdv && <span className="bg-dnd-green text-dnd-navy text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-dnd-green/50">A</span>}
                                            <span className={`text-sm font-bold w-6 text-right ${bonus >= 0 ? 'text-white' : 'text-dnd-red'}`}>
                                                {bonus >= 0 ? `+${bonus}` : bonus}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
