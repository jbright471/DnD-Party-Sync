import React, { useState } from 'react';
import socket from '../socket';

const ATMOSPHERES = [
    { name: 'Rainy Night', url: 'https://www.soundjay.com/nature/rain-01.mp3' },
    { name: 'Dungeon Depths', url: 'https://www.soundjay.com/free-music/iron-man-01.mp3' }, // Placeholder
    { name: 'Tavern Brawl', url: 'https://www.soundjay.com/human/fist-punch-01.mp3' }, // Placeholder
    { name: 'Mystic Forest', url: 'https://www.soundjay.com/nature/wind-01.mp3' }
];

export default function Soundboard() {
    const [activeSound, setActiveSound] = useState(null);

    const toggleSound = (sound) => {
        const action = activeSound === sound.name ? 'stop' : 'play';
        socket.emit('play_sound', { soundName: sound.name, url: sound.url, action });
        setActiveSound(action === 'play' ? sound.name : null);
    };

    return (
        <div className="bg-dnd-surface border-fantasy rounded-xl p-5 shadow-2xl animate-in fade-in duration-300">
            <h4 className="fantasy-heading text-xs mb-5 tracking-[0.2em] flex items-center gap-2">
                <span className="text-lg">🎵</span> Atmospheric Soundboard
            </h4>
            <div className="grid grid-cols-2 gap-3">
                {ATMOSPHERES.map(s => (
                    <button
                        key={s.name}
                        onClick={() => toggleSound(s)}
                        className={`p-3 text-[11px] font-bold rounded-lg border transition-all duration-300 flex items-center justify-center gap-2 ${activeSound === s.name
                                ? 'bg-dnd-gold text-dnd-navy border-dnd-gold shadow-[0_0_20px_rgba(212,160,23,0.4)] scale-[1.02] animate-pulse'
                                : 'bg-dnd-navy text-dnd-muted border-dnd-border hover:border-dnd-gold/50 hover:text-dnd-gold'
                            }`}
                    >
                        <span className="text-sm">{activeSound === s.name ? '🔊' : '🔇'}</span>
                        {s.name}
                    </button>
                ))}
            </div>
        </div>
    );
}
