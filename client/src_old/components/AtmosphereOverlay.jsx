import React, { useState, useEffect } from 'react';
import socket from '../socket';

export default function AtmosphereOverlay() {
    const [weather, setWeather] = useState(null);

    useEffect(() => {
        fetch('/api/world/state').then(res => res.json()).then(data => setWeather(data.weather));
        
        const handleUpdate = (data) => setWeather(data.weather);
        socket.on('world_state', handleUpdate);
        return () => socket.off('world_state', handleUpdate);
    }, []);

    if (!weather) return null;

    const condition = weather.condition?.toLowerCase() || '';

    return (
        <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden opacity-40">
            {condition.includes('rain') && <RainEffect />}
            {condition.includes('snow') && <SnowEffect />}
            {condition.includes('fog') && <div className="absolute inset-0 bg-white/5 backdrop-blur-sm animate-pulse"></div>}
            {condition.includes('heat') && <div className="absolute inset-0 bg-orange-500/5 mix-blend-overlay animate-pulse"></div>}
            
            <style dangerouslySetInnerHTML={{ __html: `
                .rain-particle {
                    position: absolute;
                    width: 1px;
                    height: 10px;
                    background: rgba(255,255,255,0.3);
                    top: -20px;
                    animation: fall linear infinite;
                }
                .snow-particle {
                    position: absolute;
                    width: 4px;
                    height: 4px;
                    background: white;
                    border-radius: 50%;
                    top: -10px;
                    animation: fall linear infinite;
                }
                @keyframes fall {
                    to { transform: translateY(105vh); }
                }
            `}} />
        </div>
    );
}

function RainEffect() {
    return (
        <div className="absolute inset-0">
            {[...Array(50)].map((_, i) => (
                <div 
                    key={i} 
                    className="rain-particle" 
                    style={{
                        left: `${Math.random() * 100}%`,
                        animationDuration: `${0.5 + Math.random()}s`,
                        animationDelay: `${Math.random() * 2}s`
                    }}
                />
            ))}
        </div>
    );
}

function SnowEffect() {
    return (
        <div className="absolute inset-0">
            {[...Array(40)].map((_, i) => (
                <div 
                    key={i} 
                    className="snow-particle" 
                    style={{
                        left: `${Math.random() * 100}%`,
                        animationDuration: `${3 + Math.random() * 2}s`,
                        animationDelay: `${Math.random() * 5}s`,
                        opacity: 0.5 + Math.random() * 0.5
                    }}
                />
            ))}
        </div>
    );
}
