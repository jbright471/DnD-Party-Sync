import React, { useEffect, useRef } from 'react';
import socket from '../socket';

export default function SoundReceiver() {
    const audioRef = useRef(null);

    useEffect(() => {
        const handleSound = ({ soundName, url, action }) => {
            if (!audioRef.current) return;

            if (action === 'play') {
                audioRef.current.src = url;
                audioRef.current.loop = true;

                // Attempt to play blindly. Browsers will block this if the 
                // user hasn't interacted with the page first—which is fine
                // because eventually the user rolls dice or clicks a tab.
                audioRef.current.play().catch(e => {
                    console.warn("Background audio play blocked pending user interaction:", e);
                });
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
