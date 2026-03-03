import React, { useState, useEffect, useRef, useMemo } from 'react';
import socket from '../socket';
import WorldMapOverlay from './WorldMapOverlay';

export default function MapViewer({ isGm, party }) {
    const [mapData, setMapData] = useState(null); 
    const containerRef = useRef(null);
    const [draggingToken, setDraggingToken] = useState(null);

    useEffect(() => {
        fetch('/api/maps/active')
            .then(res => res.json())
            .then(data => setMapData(data));

        const handleMapUpdate = (data) => setMapData(data);
        socket.on('map_state', handleMapUpdate);
        return () => socket.off('map_state', handleMapUpdate);
    }, []);

    const isVideo = useMemo(() => {
        if (!mapData?.map_url) return false;
        const url = mapData.map_url.toLowerCase();
        return url.endsWith('.mp4') || url.endsWith('.webm');
    }, [mapData?.map_url]);

    const handleMouseDown = (token, e) => {
        if (!isGm && token.entity_type === 'monster') return;
        setDraggingToken({
            ...token,
            offsetX: e.clientX - token.x,
            offsetY: e.clientY - token.y
        });
    };

    const handleMouseMove = (e) => {
        if (!draggingToken) return;
        const rect = containerRef.current.getBoundingClientRect();
        const newX = e.clientX - rect.left - draggingToken.offsetX;
        const newY = e.clientY - rect.top - draggingToken.offsetY;
        
        setMapData(prev => ({
            ...prev,
            tokens: prev.tokens.map(t => t.id === draggingToken.id ? { ...t, x: newX, y: newY } : t)
        }));
    };

    const handleMouseUp = () => {
        if (!draggingToken) return;
        const gridSize = mapData.grid_size || 50;
        const currentToken = mapData.tokens.find(t => t.id === draggingToken.id);
        const snappedX = Math.round(currentToken.x / gridSize) * gridSize;
        const snappedY = Math.round(currentToken.y / gridSize) * gridSize;
        socket.emit('move_token', { tokenId: draggingToken.id, x: snappedX, y: snappedY });
        setDraggingToken(null);
    };

    const switchLevel = (id) => {
        socket.emit('activate_map', { mapId: id });
    };

    if (!mapData) {
        return (
            <div className="flex-1 min-h-[600px] flex flex-col items-center justify-center text-dnd-muted italic bg-black/20 rounded-lg border border-dashed border-dnd-border">
                <div className="text-6xl mb-4 opacity-20">🗺️</div>
                <p>No active map. DM must activate a map.</p>
            </div>
        );
    }

    const gridSize = mapData.grid_size || 50;

    return (
        <div className="flex-1 flex flex-col relative h-full overflow-hidden">
            {/* Level Switcher Overlay */}
            {mapData.siblings?.length > 1 && (
                <div className="absolute top-4 left-4 z-[60] flex flex-col gap-1">
                    {mapData.siblings.map(sib => (
                        <button
                            key={sib.id}
                            onClick={() => switchLevel(sib.id)}
                            className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-all shadow-lg border ${
                                sib.id === mapData.id 
                                ? 'bg-dnd-gold text-dnd-navy border-dnd-gold scale-105' 
                                : 'bg-dnd-navy/80 text-dnd-muted border-dnd-border hover:text-white hover:border-dnd-gold'
                            }`}
                        >
                            {sib.name}
                        </button>
                    ))}
                </div>
            )}

            <div 
                ref={containerRef}
                className="relative flex-1 bg-black rounded-lg border border-dnd-border select-none cursor-crosshair shadow-inner overflow-hidden"
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {/* Map Layer (Video or Image) */}
                <div className="absolute inset-0 z-0">
                    {isVideo ? (
                        <video 
                            src={mapData.map_url} 
                            autoPlay 
                            loop 
                            muted 
                            playsInline
                            className="w-full h-full object-contain"
                        />
                    ) : (
                        <img 
                            src={mapData.map_url} 
                            className="w-full h-full object-contain pointer-events-none"
                            alt="Map"
                        />
                    )}
                </div>

                {/* Grid Overlay */}
                <div 
                    className="absolute inset-0 pointer-events-none opacity-10 z-10" 
                    style={{ 
                        backgroundImage: `linear-gradient(to right, #30363D 1px, transparent 1px), linear-gradient(to bottom, #30363D 1px, transparent 1px)`, 
                        backgroundSize: `${gridSize}px ${gridSize}px` 
                    }}
                />

                {/* World Map Overlay (Markers) */}
                <WorldMapOverlay 
                    markers={mapData.markers || []} 
                    mapId={mapData.id} 
                    isDm={isGm} 
                />

                {/* Tokens Layer */}
                <div className="absolute inset-0 z-20 pointer-events-none">
                    {mapData.tokens.map(token => {
                        if (!isGm && token.is_hidden) return null;
                        const isPC = token.entity_type === 'pc';
                        
                        let portrait = null;
                        if (isPC && party) {
                            const charId = token.entity_id.replace('pc-', '');
                            const char = party.find(p => p.id == charId);
                            if (char?.tokenImage) portrait = char.tokenImage;
                        }

                        return (
                            <div
                                key={token.id}
                                onMouseDown={(e) => handleMouseDown(token, e)}
                                className={`absolute flex items-center justify-center rounded-full border-2 transition-all cursor-grab active:cursor-grabbing shadow-lg overflow-hidden pointer-events-auto ${
                                    isPC ? 'border-dnd-blue bg-dnd-blue/30' : 'border-dnd-red bg-dnd-red/30'
                                } ${token.is_hidden ? 'border-dashed border-red-500 opacity-50 grayscale shadow-[0_0_10px_rgba(239,68,68,0.3)]' : 'shadow-[0_4px_10px_rgba(0,0,0,0.5)]'} ${
                                    draggingToken?.id === token.id ? 'z-50 scale-110 shadow-2xl ring-2 ring-white/50' : 'z-10'
                                }`}
                                style={{ 
                                    width: `${gridSize * 0.85}px`, 
                                    height: `${gridSize * 0.85}px`, 
                                    left: `${token.x + (gridSize * 0.075)}px`, 
                                    top: `${token.y + (gridSize * 0.075)}px`, 
                                    fontSize: `${gridSize * 0.3}px`, 
                                    fontWeight: 'bold', 
                                    color: 'white', 
                                    textShadow: '0 2px 4px rgba(0,0,0,0.8)' 
                                }}
                            >
                                {portrait ? (
                                    <img src={portrait} className="w-full h-full object-cover" />
                                ) : (
                                    token.entity_name?.substring(0, 2).toUpperCase()
                                )}
                                
                                {token.is_hidden && isGm && (
                                    <div className="absolute -bottom-1 -right-1 bg-red-600 text-[6px] px-1 rounded-full border border-black shadow-md z-20">HIDDEN</div>
                                )}
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10 z-[100]">
                                    {token.entity_name}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
