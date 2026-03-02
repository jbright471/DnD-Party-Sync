import React, { useState, useEffect } from 'react';
import socket from '../socket';

const CLIMATES = ['Temperate', 'Arctic', 'Desert', 'Coastal', 'Underdark', 'Jungle'];

export default function WorldPanel({ isDm }) {
    const [worldState, setWorldState] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedClimate, setSelectedClimate] = useState('Temperate');

    useEffect(() => {
        fetch('/api/world/state').then(res => res.json()).then(data => setWorldState(data));
        
        const handleUpdate = (data) => setWorldState(data);
        socket.on('world_state', handleUpdate);
        return () => socket.off('world_state', handleUpdate);
    }, []);

    const advanceTime = async (minutes) => {
        await fetch('/api/world/advance-time', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minutes })
        });
        socket.emit('advance_time', { minutes });
    };

    const generateWeather = async () => {
        setIsGenerating(true);
        try {
            await fetch('/api/world/weather', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ climate: selectedClimate })
            });
            socket.emit('advance_time', { minutes: 0 }); // Trigger refresh
        } finally {
            setIsGenerating(false);
        }
    };

    if (!worldState) return null;

    const { time, weather } = worldState;
    const timeStr = `${time.hour.toString().padStart(2, '0')}:${time.minute.toString().padStart(2, '0')}`;
    const dateStr = `Day ${time.day}, Month ${time.month}, Year ${time.year}`;

    return (
        <div className="bg-dnd-navy border border-dnd-border rounded-lg p-4 shadow-xl flex flex-col gap-4 text-white">
            <div className="flex justify-between items-start">
                <div>
                    <h4 className="text-[10px] font-bold text-dnd-gold uppercase tracking-[0.2em] mb-1">📅 World Chronos</h4>
                    <div className="text-xl font-fantasy text-white leading-none mb-1">{timeStr}</div>
                    <div className="text-[9px] text-dnd-muted uppercase font-bold tracking-tighter">{dateStr}</div>
                </div>
                {isDm && (
                    <div className="flex flex-wrap gap-1 justify-end max-w-[120px]">
                        <button onClick={() => advanceTime(10)} className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[8px] font-bold hover:bg-white/10">+10m</button>
                        <button onClick={() => advanceTime(60)} className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[8px] font-bold hover:bg-white/10">+1h</button>
                        <button onClick={() => advanceTime(480)} className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[8px] font-bold hover:bg-white/10">+8h</button>
                    </div>
                )}
            </div>

            <div className="pt-3 border-t border-white/5">
                <div className="flex justify-between items-center mb-2">
                    <h4 className="text-[10px] font-bold text-dnd-blue uppercase tracking-[0.2em]">🌤 Current Weather</h4>
                    {isDm && (
                        <select 
                            value={selectedClimate} 
                            onChange={e => setSelectedClimate(e.target.value)}
                            className="bg-black/40 border border-white/10 rounded text-[8px] px-1 text-dnd-muted outline-none"
                        >
                            {CLIMATES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    )}
                </div>
                <div className="bg-black/20 border border-white/5 rounded p-2 relative group">
                    <div className="text-xs font-bold text-dnd-text">{weather.condition || 'Clear Skies'}</div>
                    <div className="text-[9px] text-dnd-muted italic mb-1">"{weather.flavor || 'The air is calm and the sky is open.'}"</div>
                    {weather.impact !== "None" && (
                        <div className="text-[8px] bg-dnd-blue/10 text-dnd-blue border border-dnd-blue/20 inline-block px-1.5 py-0.5 rounded font-bold uppercase">{weather.impact}</div>
                    )}
                    
                    {isDm && (
                        <button 
                            onClick={generateWeather}
                            disabled={isGenerating}
                            className="absolute inset-0 bg-dnd-blue/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[8px] font-bold uppercase tracking-widest backdrop-blur-sm rounded"
                        >
                            {isGenerating ? 'Weaving...' : 'Regenerate Weather'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
