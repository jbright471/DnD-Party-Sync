import React, { useState, useEffect } from 'react';
import socket from '../socket';

const DICE_TYPES = [
    { type: 'd4',   color: 'text-red-400' },
    { type: 'd6',   color: 'text-orange-400' },
    { type: 'd8',   color: 'text-yellow-400' },
    { type: 'd10',  color: 'text-green-400' },
    { type: 'd12',  color: 'text-blue-400' },
    { type: 'd20',  color: 'text-purple-400' },
    { type: 'd100', color: 'text-pink-400' }
];

export default function DiceRoller({ characterName, isDm }) {
    const [count, setCount] = useState(1);
    const [modifier, setModifier] = useState(0);
    const [rolling, setRolling] = useState(false);
    const [lastRoll, setLastRoll] = useState(null);
    const [history, setHistory] = useState([]);

    const rollDice = (sides) => {
        if (rolling) return;
        setRolling(true);
        setLastRoll(null);

        // Visual "tumbling" delay
        setTimeout(() => {
            const rolls = [];
            for (let i = 0; i < count; i++) {
                rolls.push(Math.floor(Math.random() * sides) + 1);
            }
            const sum = rolls.reduce((a, b) => a + b, 0);
            const total = sum + modifier;

            const result = {
                sides,
                count,
                modifier,
                rolls,
                total,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                isNat20: sides === 20 && rolls.includes(20),
                isNat1: sides === 20 && rolls.includes(1)
            };

            setLastRoll(result);
            setHistory(prev => [result, ...prev].slice(0, 10));
            setRolling(false);

            // Broadcast to the table
            socket.emit('dice_roll', {
                actor: characterName || (isDm ? 'DM' : 'Player'),
                sides,
                count,
                modifier,
                total,
                rolls,
                isPrivate: false // We can toggle this later
            });
        }, 600);
    };

    return (
        <div className="bg-dnd-surface border border-dnd-border rounded-lg shadow-2xl p-4 flex flex-col gap-4 select-none">
            <div className="flex justify-between items-center border-b border-dnd-border pb-2">
                <h4 className="fantasy-heading text-sm text-dnd-gold m-0">🎲 Dice Tray</h4>
                <div className="flex gap-2 items-center">
                    <input 
                        type="number" 
                        value={count} 
                        onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-10 bg-dnd-navy border border-dnd-border rounded text-center text-xs py-1 text-white outline-none focus:border-dnd-gold"
                        title="Dice Count"
                    />
                    <span className="text-dnd-muted text-[10px] font-bold">D</span>
                    <input 
                        type="number" 
                        value={modifier} 
                        onChange={e => setModifier(parseInt(e.target.value) || 0)}
                        className="w-10 bg-dnd-navy border border-dnd-border rounded text-center text-xs py-1 text-white outline-none focus:border-dnd-gold"
                        title="Modifier"
                    />
                </div>
            </div>

            {/* Dice Buttons */}
            <div className="grid grid-cols-4 gap-2">
                {DICE_TYPES.map(die => (
                    <button
                        key={die.type}
                        onClick={() => rollDice(parseInt(die.type.slice(1)))}
                        disabled={rolling}
                        className={`bg-dnd-navy border border-dnd-border p-2 rounded hover:border-dnd-gold transition-all group active:scale-95 disabled:opacity-50`}
                    >
                        <div className={`text-xs font-bold ${die.color} group-hover:scale-110 transition-transform`}>
                            {die.type}
                        </div>
                    </button>
                ))}
                <button 
                    onClick={() => { setCount(1); setModifier(0); setLastRoll(null); setHistory([]); }}
                    className="bg-dnd-red/10 border border-dnd-red/30 text-dnd-red text-[8px] font-bold uppercase rounded hover:bg-dnd-red/20"
                >Clear</button>
            </div>

            {/* Display Area */}
            <div className="h-32 bg-black/40 rounded-lg border border-dnd-border relative overflow-hidden flex flex-col items-center justify-center">
                {rolling ? (
                    <div className="flex flex-col items-center gap-2 animate-bounce">
                        <div className="text-3xl text-dnd-gold drop-shadow-[0_0_10px_rgba(210,160,23,0.5)]">🎲</div>
                        <span className="text-[10px] text-dnd-gold font-bold uppercase tracking-widest">Rolling...</span>
                    </div>
                ) : lastRoll ? (
                    <div className={`flex flex-col items-center animate-in zoom-in duration-300 ${lastRoll.isNat20 ? 'text-dnd-gold' : lastRoll.isNat1 ? 'text-dnd-red' : 'text-white'}`}>
                        <div className="text-4xl font-fantasy text-shadow-lg drop-shadow-md">
                            {lastRoll.total}
                        </div>
                        <div className="text-[10px] text-dnd-muted mt-1 font-mono">
                            {lastRoll.count}d{lastRoll.sides} ({lastRoll.rolls.join(' + ')}) {lastRoll.modifier >= 0 ? '+' : ''}{lastRoll.modifier}
                        </div>
                        {lastRoll.isNat20 && <div className="text-[8px] font-bold uppercase tracking-[0.2em] mt-1 animate-pulse">Critical Hit!</div>}
                        {lastRoll.isNat1 && <div className="text-[8px] font-bold uppercase tracking-[0.2em] mt-1">Critical Fail...</div>}
                    </div>
                ) : (
                    <div className="text-dnd-muted text-[10px] uppercase font-bold tracking-widest opacity-20 italic">Ready to Roll</div>
                )}
            </div>

            {/* History mini-log */}
            <div className="flex flex-col gap-1 max-h-24 overflow-y-auto pr-1 scrollbar-thin">
                {history.map((h, i) => (
                    <div key={i} className="flex justify-between items-center text-[9px] bg-dnd-navy/30 p-1 rounded border border-white/5">
                        <span className="text-dnd-muted">{h.timestamp}</span>
                        <span className="text-dnd-text font-bold">Result: {h.total}</span>
                        <span className="text-dnd-muted italic">{h.count}d{h.sides}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
