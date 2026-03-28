import React, { useState, useEffect } from 'react';
import socket from '../socket';

const DICE_TYPES = [
    { type: 'd20', color: 'text-purple-400', label: 'd20' },
    { type: 'd12', color: 'text-blue-400', label: 'd12' },
    { type: 'd100', color: 'text-pink-400', label: 'd100' },
    { type: 'd10', color: 'text-green-400', label: 'd10' },
    { type: 'd8', color: 'text-yellow-400', label: 'd8' },
    { type: 'd6', color: 'text-orange-400', label: 'd6' },
    { type: 'd4', color: 'text-red-400', label: 'd4' }
];

export default function DiceRoller({ characterName, isDm }) {
    const [isOpen, setIsOpen] = useState(false);
    const [pool, setPool] = useState({ d20: 0, d12: 0, d100: 0, d10: 0, d8: 0, d6: 0, d4: 0 });
    const [modifier, setModifier] = useState(0);
    const [rolling, setRolling] = useState(false);
    const [lastRoll, setLastRoll] = useState(null);
    const [isPrivate, setIsPrivate] = useState(false);

    const toggleDie = (dieType) => {
        setPool(prev => ({ ...prev, [dieType]: prev[dieType] + 1 }));
    };

    const resetPool = () => {
        setPool({ d20: 0, d12: 0, d100: 0, d10: 0, d8: 0, d6: 0, d4: 0 });
        setModifier(0);
        setLastRoll(null);
    };

    const getPoolString = () => {
        const parts = [];
        for (const [die, count] of Object.entries(pool)) {
            if (count > 0) parts.push(`${count}${die}`);
        }
        if (modifier !== 0) {
            parts.push(modifier > 0 ? `+${modifier}` : `${modifier}`);
        }
        return parts.length > 0 ? parts.join(' + ') : 'READY TO ROLL';
    };

    const hasDiceInPool = Object.values(pool).some(count => count > 0);

    const rollDice = () => {
        if (rolling || !hasDiceInPool) return;
        setRolling(true);
        setLastRoll(null);

        setTimeout(() => {
            let totalSum = 0;
            const detailedRolls = [];
            const rollSummaries = [];
            let hasNat20 = false;
            let hasNat1 = false;

            for (const [dieType, count] of Object.entries(pool)) {
                if (count > 0) {
                    const sides = parseInt(dieType.slice(1));
                    const currentGroupRolls = [];
                    for (let i = 0; i < count; i++) {
                        const roll = Math.floor(Math.random() * sides) + 1;
                        currentGroupRolls.push(roll);
                        totalSum += roll;

                        // Only care about nat 20/1 for d20s natively
                        if (sides === 20) {
                            if (roll === 20) hasNat20 = true;
                            if (roll === 1) hasNat1 = true;
                        }
                    }
                    rollSummaries.push(`${count}${dieType}`);
                    detailedRolls.push(...currentGroupRolls);
                }
            }

            totalSum += modifier;

            const poolStr = rollSummaries.join(' + ') + (modifier !== 0 ? (modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`) : '');
            const detailStr = detailedRolls.length > 1 ? ` (${detailedRolls.join(' + ')})` : '';

            const result = {
                poolStr,
                rolls: detailedRolls,
                total: totalSum,
                isNat20: hasNat20,
                isNat1: hasNat1
            };

            setLastRoll(result);
            setRolling(false);

            // Log mixed pools to the global log using log_action so the server registers it generically
            socket.emit('log_action', {
                actor: characterName || (isDm ? 'DM' : 'Player'),
                description: `rolled **${totalSum}** on ${poolStr}${detailStr}`,
                useLlm: false
            });

        }, 600);
    };

    return (
        <div className="fixed bottom-[150px] left-4 lg:bottom-[80px] lg:left-[270px] z-50 flex flex-col items-start">

            {/* Popover Menu */}
            {isOpen && (
                <div className="mb-4 bg-[#202128] border border-gray-700/50 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] w-[300px] overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">

                    {/* Header */}
                    <div className="px-4 py-3 flex justify-between items-center border-b border-gray-700/50">
                        <span className="text-gray-300 font-bold text-sm">Roll Dice</span>
                        <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                            <span className="text-lg leading-none">✕</span>
                        </button>
                    </div>

                    {/* Active Pool Banner */}
                    <div className="px-4 py-4 bg-gradient-to-r from-[#1a1b21] to-[#252730] border-b border-gray-700/50 flex flex-col items-center justify-center min-h-[90px] relative">
                        {rolling ? (
                            <div className="animate-bounce text-4xl text-dnd-gold drop-shadow-[0_0_10px_rgba(212,160,23,0.5)]">🎲</div>
                        ) : lastRoll ? (
                            <div className="flex flex-col items-center animate-in zoom-in duration-200">
                                <span className={`text-4xl font-bold ${lastRoll.isNat20 ? 'text-dnd-gold' : lastRoll.isNat1 ? 'text-dnd-red' : 'text-white'}`}>
                                    {lastRoll.total}
                                </span>
                                <span className="text-xs text-dnd-muted/70 mt-1 font-mono tracking-wider">{lastRoll.poolStr}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                <div className="text-4xl opacity-80 mix-blend-screen drop-shadow-md pb-1 text-dnd-blue">🎲</div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Current Pool</span>
                                    <span className={`font-mono font-bold tracking-tight ${hasDiceInPool ? 'text-white text-lg' : 'text-gray-500 text-sm italic'}`}>
                                        {getPoolString()}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Dice Selection Grid */}
                    <div className="p-5 flex flex-col gap-6 items-center">
                        {/* Top Row: d20, d12, d100, d10 */}
                        <div className="flex justify-center gap-4 w-full">
                            {DICE_TYPES.slice(0, 4).map(die => (
                                <button key={die.type} onClick={() => toggleDie(die.type)} disabled={rolling} className="flex flex-col items-center group active:scale-90 transition-transform disabled:opacity-50">
                                    <div className="w-12 h-12 flex items-center justify-center text-3xl opacity-80 group-hover:opacity-100 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] transition-all">
                                        <span className={die.color}>⬡</span>
                                    </div>
                                    <span className="text-[11px] font-bold text-gray-400 mt-1 uppercase tracking-widest group-hover:text-white transition-colors">{die.label}</span>
                                </button>
                            ))}
                        </div>
                        {/* Bottom Row: d8, d6, d4 */}
                        <div className="flex justify-center gap-6 w-full px-4">
                            {DICE_TYPES.slice(4).map(die => (
                                <button key={die.type} onClick={() => toggleDie(die.type)} disabled={rolling} className="flex flex-col items-center group active:scale-90 transition-transform disabled:opacity-50">
                                    <div className="w-[40px] h-[40px] flex items-center justify-center text-2xl opacity-80 group-hover:opacity-100 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] transition-all">
                                        <span className={die.color}>⬡</span>
                                    </div>
                                    <span className="text-[11px] font-bold text-gray-400 mt-1 uppercase tracking-widest group-hover:text-white transition-colors">{die.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Modifier Input */}
                        <div className="flex items-center gap-3 w-full justify-center mt-2 border-t border-gray-700/30 pt-4">
                            <span className="text-xs font-bold text-gray-400 tracking-widest uppercase">Modifier</span>
                            <div className="flex items-center bg-black/40 rounded border border-gray-700 overflow-hidden">
                                <button onClick={() => setModifier(m => m - 1)} className="px-3 py-1 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">-</button>
                                <span className="text-sm font-mono w-8 text-center bg-transparent text-white font-bold">{modifier > 0 ? `+${modifier}` : modifier}</span>
                                <button onClick={() => setModifier(m => m + 1)} className="px-3 py-1 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">+</button>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 w-full mt-2">
                            <button
                                onClick={resetPool}
                                className="flex-1 bg-[#363942] hover:bg-[#40444f] text-gray-300 font-bold text-xs uppercase tracking-widest py-3 rounded transition-colors"
                            >
                                Reset
                            </button>
                            <button
                                onClick={rollDice}
                                disabled={!hasDiceInPool || rolling}
                                className="flex-1 bg-[#8c2e35] hover:bg-[#a5363e] disabled:bg-[#4a2428] disabled:text-gray-500 text-white font-bold text-xs uppercase tracking-widest py-3 rounded transition-colors shadow-inner"
                            >
                                Roll {Object.values(pool).reduce((a, b) => a + b, 0) > 0 ? `(${Object.values(pool).reduce((a, b) => a + b, 0)})` : ''}
                            </button>
                        </div>
                    </div>

                    {/* Privacy Toggle Footer */}
                    <div className="bg-[#18191e] border-t border-gray-800 p-3 flex items-center gap-3">
                        <div className="flex bg-[#23252c] rounded overflow-hidden">
                            <button
                                onClick={() => setIsPrivate(false)}
                                className={`px-3 py-1.5 text-xs transition-colors flex items-center gap-1 ${!isPrivate ? 'bg-[#3b3d46] text-white shadow-inner' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                👥
                            </button>
                            <button
                                onClick={() => setIsPrivate(true)}
                                className={`px-3 py-1.5 text-xs transition-colors flex items-center gap-1 ${isPrivate ? 'bg-[#3b3d46] text-white shadow-inner' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                👤
                            </button>
                        </div>
                        <span className="text-[10px] italic text-gray-500">{isPrivate ? 'Rolling privately to Self/DM' : 'Rolling to everyone'}</span>
                    </div>
                </div>
            )}

            {/* Floating Action Button (FAB) */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-14 h-14 bg-dnd-gold hover:bg-dnd-amber rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.5)] flex items-center justify-center transition-all ${isOpen ? 'scale-90 opacity-80 rotate-12 bg-dnd-navy border-2 border-dnd-gold' : 'hover:scale-105 active:scale-95'}`}
            >
                <div className={`text-2xl ${isOpen ? 'text-dnd-gold' : 'text-dnd-navy'}`}>
                    {isOpen ? '✕' : '🎲'}
                </div>
            </button>
        </div>
    );
}
