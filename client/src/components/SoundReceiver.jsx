import React, { useEffect, useRef } from 'react';
import socket from '../socket';

export default function SoundReceiver() {
    const audioRef = useRef(null);

    useEffect(() => {
        const handleSound = ({ url, action }) => {
            if (!audioRef.current) return;

            if (action === 'play') {
                audioRef.current.src = url;
                audioRef.current.loop = true;
                audioRef.current.play().catch(e => console.warn("Audio autoplay blocked by browser. Interaction required."));
            } else {
                audioRef.current.pause();
            }
        };

        socket.on('sound_event', handleSound);
        return () => socket.off('sound_event', handleSound);
    }, []);

    return (
        <audio ref={audioRef} style={{ display: 'none' }} />
    );
}
