import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket';

export default function SoundReceiver() {
    const audioRef = useRef(null);
    const [unmuted, setUnmuted] = useState(false);
    const [currentSound, setCurrentSound] = useState(null);

    useEffect(() => {
        const handleSound = ({ soundName, url, action }) => {
            if (!audioRef.current) return;

            if (action === 'play') {
                setCurrentSound(soundName);
                audioRef.current.src = url;
                audioRef.current.loop = true;
                if (unmuted) {
                    audioRef.current.play().catch(e => {
                        console.warn("Autoplay blocked:", e);
                        setUnmuted(false);
                    });
                }
            } else {
                audioRef.current.pause();
                setCurrentSound(null);
            }
        };

        socket.on('sound_event', handleSound);
        return () => socket.off('sound_event', handleSound);
    }, [unmuted]);

    const handleEnable = () => {
        setUnmuted(true);
        if (audioRef.current && audioRef.current.src) {
            audioRef.current.play().catch(e => console.error("Still blocked:", e));
        }
    };

    return (
        <>
            <audio ref={audioRef} style={{ display: 'none' }} />
            {!unmuted && (
                <div className="fixed bottom-4 right-4 z-[200] animate-bounce">
                    <button 
                        onClick={handleEnable}
                        className="bg-dnd-gold text-dnd-navy px-4 py-2 rounded-full font-bold text-xs shadow-2xl flex items-center gap-2 border-2 border-white/20"
                    >
                        <span>🔇</span> Enable Audio {currentSound && `(Playing: ${currentSound})`}
                    </button>
                </div>
            )}
            {unmuted && currentSound && (
                <div className="fixed bottom-4 right-4 z-[200] opacity-50 hover:opacity-100 transition-opacity">
                    <div className="bg-dnd-navy/80 border border-dnd-gold text-dnd-gold px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-dnd-gold opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-dnd-gold"></span>
                        </span>
                        {currentSound}
                    </div>
                </div>
            )}
        </>
    );
}
