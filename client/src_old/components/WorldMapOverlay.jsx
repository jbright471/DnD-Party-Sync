import React, { useState } from 'react';
import socket from '../socket';

/**
 * WorldMapOverlay Component
 * Renders interactive markers over the MapViewer when an Overworld map is active.
 */
export default function WorldMapOverlay({ markers, mapId, isDm }) {
    const [showAddMenu, setShowAddMenu] = useState(null); // { x, y }
    const [markerName, setMarkerName] = useState('');
    const [markerType, setMarkerNameType] = useState('location'); // location, quest, encounter
    const [linkedMapId, setLinkedMapId] = useState('');
    const [availableMaps, setAvailableMaps] = useState([]);

    const handleContextMenu = async (e) => {
        if (!isDm) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Fetch all maps to allow linking
        const res = await fetch('/api/maps');
        const data = await res.json();
        setAvailableMaps(data.filter(m => m.id !== mapId));
        
        setShowAddMenu({ x, y });
    };

    const handleAddMarker = () => {
        if (!markerName) return;
        socket.emit('add_marker', {
            mapId,
            name: markerName,
            type: markerType,
            x: showAddMenu.x,
            y: showAddMenu.y,
            linkedMapId: linkedMapId || null
        });
        setShowAddMenu(null);
        setMarkerName('');
    };

    const toggleDiscovery = (marker) => {
        if (!isDm) return;
        socket.emit('update_marker', {
            markerId: marker.id,
            updates: { is_discovered: marker.is_discovered ? 0 : 1 }
        });
    };

    const warpToLinkedMap = (linkedId) => {
        if (!linkedId) return;
        socket.emit('activate_map', { mapId: linkedId });
    };

    const deleteMarker = (id) => {
        if (!isDm) return;
        socket.emit('delete_marker', { markerId: id });
    };

    return (
        <div className="absolute inset-0 z-30" onContextMenu={handleContextMenu}>
            {/* Markers */}
            {markers.map(marker => {
                if (!isDm && !marker.is_discovered) return null;

                const icon = marker.type === 'quest' ? '❓' : marker.type === 'encounter' ? '⚔️' : '🏙️';
                
                return (
                    <div 
                        key={marker.id}
                        className={`absolute group cursor-pointer transition-all ${!marker.is_discovered ? 'opacity-40 grayscale' : 'hover:scale-110'}`}
                        style={{ left: marker.x, top: marker.y, transform: 'translate(-50%, -100%)' }}
                        onClick={() => marker.linked_map_id && warpToLinkedMap(marker.linked_map_id)}
                    >
                        <div className="flex flex-col items-center">
                            {/* Marker Tooltip */}
                            <div className="bg-black/90 text-white text-[10px] px-2 py-1 rounded border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity mb-1 whitespace-nowrap">
                                {marker.name} {marker.linked_map_id && isDm && <span className="text-dnd-blue ml-1">(Linked)</span>}
                                {!marker.is_discovered && isDm && <span className="text-dnd-red ml-1">(Hidden)</span>}
                            </div>
                            
                            {/* Marker Icon */}
                            <div className="text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] relative">
                                {icon}
                                {marker.linked_map_id && (
                                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-dnd-blue rounded-full border border-black animate-pulse" />
                                )}
                            </div>

                            {/* DM Controls */}
                            {isDm && (
                                <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => { e.stopPropagation(); toggleDiscovery(marker); }} className={`p-1 rounded text-[8px] font-bold uppercase ${marker.is_discovered ? 'bg-dnd-green/20 text-dnd-green' : 'bg-dnd-red/20 text-dnd-red'}`}>
                                        {marker.is_discovered ? 'Show' : 'Hide'}
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); deleteMarker(marker.id); }} className="p-1 rounded bg-black/40 text-dnd-muted hover:text-white text-[8px]">🗑</button>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}

            {/* Add Marker Menu */}
            {showAddMenu && (
                <div 
                    className="absolute bg-dnd-surface border border-dnd-border p-4 rounded-lg shadow-2xl z-50 w-64 animate-in zoom-in-95 duration-200"
                    style={{ left: showAddMenu.x, top: showAddMenu.y }}
                    onClick={e => e.stopPropagation()}
                >
                    <h4 className="text-[10px] text-dnd-gold uppercase font-bold tracking-widest mb-3">Add Geographical Marker</h4>
                    <div className="flex flex-col gap-3">
                        <input 
                            type="text" 
                            placeholder="Location Name..." 
                            className="w-full bg-black/40 border border-dnd-border rounded px-3 py-2 text-xs text-white outline-none"
                            value={markerName}
                            onChange={e => setMarkerName(e.target.value)}
                            autoFocus
                        />
                        <select 
                            className="w-full bg-black/40 border border-dnd-border rounded px-3 py-2 text-xs text-white outline-none"
                            value={markerType}
                            onChange={e => setMarkerNameType(e.target.value)}
                        >
                            <option value="location">City / Point of Interest</option>
                            <option value="quest">Quest Hook</option>
                            <option value="encounter">Dangerous Encounter</option>
                        </select>
                        <select 
                            className="w-full bg-black/40 border border-dnd-border rounded px-3 py-2 text-xs text-white outline-none"
                            value={linkedMapId}
                            onChange={e => setLinkedMapId(e.target.value)}
                        >
                            <option value="">No Linked Map (Static)</option>
                            {availableMaps.map(m => (
                                <option key={m.id} value={m.id}>Link to: {m.name}</option>
                            ))}
                        </select>
                        <div className="flex gap-2">
                            <button onClick={handleAddMarker} className="flex-1 bg-dnd-gold text-dnd-navy py-2 rounded text-[10px] font-bold uppercase">Add Marker</button>
                            <button onClick={() => setShowAddMenu(null)} className="px-3 py-2 text-dnd-muted hover:text-white text-[10px] font-bold">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
