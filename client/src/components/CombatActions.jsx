import React, { useMemo, useState } from 'react';
import socket from '../socket';

const FILTERS = ['All', 'Attack', 'Action', 'Bonus Action', 'Reaction', 'Other', 'Limited Use'];

export default function CombatActions({ character }) {
    const [activeFilter, setActiveFilter] = useState('All');

    // Parse weapons/features to find offensive capabilities
    const allCards = useMemo(() => {
        const ObjectValues = obj => obj ? Object.values(obj) : [];
        const cards = [];

        const getCategoryFromDesc = (desc, defaultCat) => {
            if (!desc) return defaultCat;
            const d = desc.toLowerCase();
            if (d.includes('per short rest') || d.includes('per long rest') || d.includes('charge')) return 'Limited Use';
            if (d.includes('bonus action')) return 'Bonus Action';
            if (d.includes('reaction')) return 'Reaction';
            if (d.includes('as an action')) return 'Action';
            if (d.includes('attack')) return 'Attack';
            return defaultCat;
        };

        // 1. Check equipped inventory for weapons or damage items
        (character.inventory || []).filter(item => item.equipped).forEach(item => {
            const desc = item.description ? item.description.toLowerCase() : '';
            const isWeapon = item.filterType === 'Weapon' || desc.includes('damage') || desc.includes('attack') || desc.match(/\d*d\d+/);

            if (isWeapon) {
                cards.push({
                    id: item.id || item.name,
                    name: item.name,
                    description: item.description || 'A trusty weapon.',
                    type: item.filterType || 'Weapon',
                    source: 'Equipment',
                    category: getCategoryFromDesc(desc, 'Attack')
                });
            }
        });

        // 2. Check features for offensive capabilities
        (character.features || []).forEach(feature => {
            const desc = feature.description ? feature.description.toLowerCase() : '';
            // Only pull in features that mention damage, attacks, dice, or actions
            if (desc.includes('damage') || desc.includes('attack') || desc.match(/\d*d\d+/) || desc.includes('action')) {
                cards.push({
                    id: feature.id || feature.name,
                    name: feature.name,
                    description: feature.description,
                    type: 'Feature',
                    source: 'Class Feature',
                    category: getCategoryFromDesc(desc, 'Other')
                });
            }
        });

        // Optional: Custom parsed Actions from DDB raw json
        try {
            const raw = JSON.parse(character.raw_dndbeyond_json || '{}');
            if (raw.actions) {
                ObjectValues(raw.actions).flat().forEach(act => {
                    // avoid duplicates by name
                    if (!cards.find(c => c.name === act.name)) {
                        let category = 'Action';
                        if (act.activation) {
                            if (act.activation.activationType === 3) category = 'Bonus Action';
                            else if (act.activation.activationType === 4) category = 'Reaction';
                            else if (act.activation.activationType === 1) category = 'Action';
                            else if (act.activation.activationType === 8) category = 'Other';
                        } else {
                            category = getCategoryFromDesc(act.snippet || act.description, 'Action');
                        }
                        if (act.displayAsAttack) category = 'Attack';

                        cards.push({
                            id: act.id || act.name,
                            name: act.name,
                            description: act.snippet || act.description || 'A combat action.',
                            type: 'Action',
                            source: 'DDB Action',
                            category: category
                        });
                    }
                });
            }
        } catch (e) { }

        return cards;
    }, [character]);

    const actionCards = useMemo(() => {
        if (activeFilter === 'All') return allCards;
        return allCards.filter(c => {
            if (activeFilter === 'Attack') return c.category === 'Attack' || c.type === 'Weapon';
            return c.category === activeFilter;
        });
    }, [allCards, activeFilter]);

    const handleActionRoll = (card) => {
        // Emit a generic roll/action event or prompt the user for dice
        // The DmWhisperPanel and regular DiceTray cover actual number generation, 
        // this is more of a quick-reference and intent-declaration button.
        socket.emit('game_roll', {
            characterId: character.id,
            characterName: character.name,
            rollType: 'Combat Action',
            total: 'Used Action',
            count: 0,
            sides: 0,
            modifier: 0,
            rolls: [],
            actionName: card.name
        });
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Header section with Badges */}
            <div className="flex justify-between items-center mb-1">
                <h4 className="text-[12px] text-dnd-red font-fantasy tracking-[0.2em] uppercase m-0 flex items-center gap-2">
                    <span className="text-xl">⚔️</span> Attack Actions
                </h4>
                {/* Status Badges */}
                <div className="flex gap-2">
                    {character.conditions?.map(c => (
                        <span key={c} className="bg-dnd-red/20 text-dnd-red border border-dnd-red/40 px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest animate-pulse">
                            {c}
                        </span>
                    ))}
                    {character.concentratingOn && (
                        <span className="bg-dnd-blue/20 text-dnd-blue border border-dnd-blue/40 px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest">
                            Concentrating
                        </span>
                    )}
                </div>
            </div>

            {/* Sub-Filters (DDB Style) */}
            <div className="flex flex-wrap gap-2 border-b border-dnd-red/30 pb-3 mb-2">
                {FILTERS.map(f => (
                    <button
                        key={f}
                        onClick={() => setActiveFilter(f)}
                        className={`text-[9px] uppercase tracking-widest font-bold px-3 py-1.5 rounded transition-all shadow-sm ${activeFilter === f
                            ? 'bg-[#c6a254] text-[#121212] border-transparent shadow-[0_0_10px_rgba(198,162,84,0.4)]'
                            : 'bg-[#181818] text-white/70 hover:text-white border border-[#303030] hover:border-[#505050]'
                            }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {actionCards.length === 0 ? (
                <div className="text-center py-10 bg-dnd-red/5 border border-dnd-red/10 rounded-xl mt-4">
                    <span className="text-2xl mb-2 block">🤷‍♂️</span>
                    <span className="text-dnd-muted italic text-sm">No weapons equipped or combat-ready features detected.</span>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {actionCards.map(card => {
                        // Attempt to extract damage dice like "1d8 + 3" or "2d6" for a premium visual flair
                        const diceMatch = card.description?.match(/(\d*d\d+(\s*\+\s*\d+)?)/i);
                        const diceStr = diceMatch ? diceMatch[0] : '';

                        return (
                            <div
                                key={card.id}
                                className="bg-gradient-to-br from-[#120a0e] to-dnd-navy border border-dnd-red/20 hover:border-dnd-red/60 rounded-xl p-4 flex flex-col justify-between group transition-all shadow-[0_4px_12px_rgba(0,0,0,0.6)] cursor-pointer"
                                onClick={() => handleActionRoll(card)}
                            >
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <h5 className="font-fantasy text-dnd-gold text-[1.1rem] leading-tight m-0 group-hover:text-red-400 transition-colors">
                                            {card.name}
                                        </h5>
                                        <span className="text-[8px] uppercase tracking-widest px-2 py-0.5 rounded border border-dnd-muted/30 text-dnd-muted bg-black/40 whitespace-nowrap ml-2">
                                            {card.type}
                                        </span>
                                    </div>
                                    <div
                                        className="text-[11px] text-dnd-text/80 line-clamp-3 leading-relaxed mb-4 font-serif opacity-80 group-hover:opacity-100 transition-opacity"
                                        dangerouslySetInnerHTML={{ __html: card.description }}
                                    />
                                </div>

                                {diceStr ? (
                                    <div className="mt-auto pt-3 border-t border-dnd-red/10 flex justify-between items-center group-hover:border-dnd-red/30 transition-colors">
                                        <span className="text-[9px] text-dnd-muted uppercase tracking-widest font-bold">Damage / Effect</span>
                                        <div className="flex items-center gap-1.5 bg-dnd-red/10 px-2 py-1 rounded border border-dnd-red/20 shadow-inner group-hover:bg-dnd-red/20 transition-colors">
                                            <span className="text-sm">🎲</span>
                                            <span className="text-dnd-red font-bold font-mono text-[11px]">{diceStr.toLowerCase()}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-auto pt-3 border-t border-dnd-red/10 flex justify-between items-center opacity-50">
                                        <span className="text-[9px] text-dnd-muted uppercase tracking-widest font-bold">Action</span>
                                        <span className="text-[10px] text-dnd-gold">Use ➔</span>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    );
}
