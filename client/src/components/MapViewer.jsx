import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket';

export default function MapViewer({ isGm }) {
    const [mapData, setMapData] = useState(null); // { id, name, image_data, grid_size, tokens[] }
    const containerRef = useRef(null);
    const [draggingToken, setDraggingToken] = useState(null);

    useEffect(() => {
        // Fetch initial active map
        fetch('/api/maps/active')
            .then(res => res.json())
            .then(data => setMapData(data));

        const handleMapUpdate = (data) => setMapData(data);
        socket.on('map_state', handleMapUpdate);
        return () => socket.off('map_state', handleMapUpdate);
    }, []);

    const handleMouseDown = (token, e) => {
        if (!isGm && token.entity_type === 'monster') return; // Players can't move monsters
        setDraggingToken({
            ...token,
            offsetX: e.clientX - token.x,
            offsetY: e.clientY - token.y
        });
    };

    const handleMouseMove = (e) => {
        if (!draggingToken) return;

        const newX = e.clientX - draggingToken.offsetX;
        const newY = e.clientY - draggingToken.offsetY;

        // Visual only update for smooth dragging
        setMapData(prev => ({
            ...prev,
            tokens: prev.tokens.map(t =>
                t.id === draggingToken.id ? { ...t, x: newX, y: newY } : t
            )
        }));
    };

    const handleMouseUp = () => {
        if (!draggingToken) return;

        // Snap to grid on release
        const gridSize = mapData.grid_size || 50;
        const currentToken = mapData.tokens.find(t => t.id === draggingToken.id);

        const snappedX = Math.round(currentToken.x / gridSize) * gridSize;
        const snappedY = Math.round(currentToken.y / gridSize) * gridSize;

        socket.emit('move_token', {
            tokenId: draggingToken.id,
            x: snappedX,
            y: snappedY
        });

        setDraggingToken(null);
    };

    if (!mapData) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-dnd-muted italic bg-dnd-navy/40 rounded-xl border border-dashed border-dnd-border min-h-[400px] animate-in fade-in duration-500">
                <div className="text-6xl mb-6 filter drop-shadow-[0_0_15px_rgba(212,160,23,0.3)]">🗺️</div>
                <p className="fantasy-heading text-lg text-dnd-gold">The mists obscure the path...</p>
                <p className="text-sm mt-1">DM must activate a map from the Map Manager.</p>
            </div>
        );
    }

    const gridSize = mapData.grid_size || 50;

    return (
        <div
            ref={containerRef}
            className="relative flex-1 bg-dnd-navy rounded-xl overflow-hidden border-fantasy select-none cursor-crosshair shadow-2xl"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
                backgroundImage: `url(${mapData.image_data})`,
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'top left',
                minHeight: '600px'
            }}
        >
            {/* Grid Overlay */}
            <div
                className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                    backgroundImage: `linear-gradient(to right, #30363D 1px, transparent 1px), linear-gradient(to bottom, #30363D 1px, transparent 1px)`,
                    backgroundSize: `${gridSize}px ${gridSize}px`
                }}
            ></div>

            {/* Tokens */}
            {mapData.tokens.map(token => {
                if (!isGm && token.is_hidden) return null;

                const isPC = token.entity_type === 'pc';

                return (
                    <div
                        key={token.id}
                        onMouseDown={(e) => handleMouseDown(token, e)}
                        className={`absolute flex items-center justify-center rounded-full border-2 cursor-pointer shadow-lg transition-all duration-300 ease-out ${isPC ? 'border-dnd-blue bg-dnd-blue/20 ring-1 ring-dnd-blue/30' : 'border-dnd-red bg-dnd-red/20 ring-1 ring-dnd-red/30'
                            } ${token.is_hidden ? 'opacity-40 grayscale border-dashed' : ''} ${draggingToken?.id === token.id ? 'z-50 scale-125 shadow-2xl !duration-0 ring-4 ring-dnd-gold/50' : 'z-10'
                            }`}
                        style={{
                            width: `${gridSize * 0.8}px`,
                            height: `${gridSize * 0.8}px`,
                            left: `${token.x + (gridSize * 0.1)}px`,
                            top: `${token.y + (gridSize * 0.1)}px`,
                            fontSize: `${gridSize * 0.3}px`,
                            fontWeight: 'bold',
                            color: 'white',
                            textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                        }}
                    >
                        {token.entity_name?.substring(0, 2).toUpperCase()}

                        {/* Tooltip on hover */}
                        <div className="absolute -top-8 bg-black/80 text-[10px] px-2 py-1 rounded opacity-0 hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10">
                            {token.entity_name}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
