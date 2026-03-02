import React, { useState, useEffect } from 'react';
import socket from '../socket';

export default function MapManagerModal({ onClose }) {
    const [maps, setMaps] = useState([]);
    const [newMap, setNewMap] = useState({ name: '', grid_size: 50, image_data: '' });
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        fetchMaps();
    }, []);

    const fetchMaps = async () => {
        const res = await fetch('/api/maps');
        const data = await res.json();
        setMaps(data);
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            setNewMap({ ...newMap, image_data: reader.result, name: file.name.split('.')[0] });
        };
        reader.readAsDataURL(file);
    };

    const handleSaveMap = async () => {
        if (!newMap.name || !newMap.image_data) return;
        setIsUploading(true);
        const res = await fetch('/api/maps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newMap)
        });
        if (res.ok) {
            setNewMap({ name: '', grid_size: 50, image_data: '' });
            fetchMaps();
        }
        setIsUploading(false);
    };

    const handleActivate = async (id) => {
        const res = await fetch(`/api/maps/${id}/activate`, { method: 'POST' });
        if (res.ok) {
            socket.emit('activate_map', { mapId: id });
            socket.emit('sync_map_tokens');
            onClose();
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this map?')) return;
        await fetch(`/api/maps/${id}`, { method: 'DELETE' });
        fetchMaps();
    };

    return (
        <div className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
            <div className="bg-dnd-surface border border-dnd-border w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-xl shadow-2xl flex flex-col">
                <div className="p-6 border-b border-dnd-border flex justify-between items-center bg-dnd-navy/50">
                    <h2 className="fantasy-heading text-2xl text-dnd-gold m-0">🧭 Map Cartographer</h2>
                    <button onClick={onClose} className="text-dnd-muted hover:text-white transition-colors text-xl">✕</button>
                </div>

                <div className="flex-1 overflow-hidden grid grid-cols-12">
                    {/* Left: Upload New */}
                    <div className="col-span-12 lg:col-span-4 p-6 border-r border-dnd-border bg-black/20">
                        <h3 className="text-xs font-bold text-dnd-muted uppercase tracking-[0.2em] mb-6">Upload New Map</h3>
                        <div className="flex flex-col gap-5">
                            <div className="aspect-video bg-dnd-navy border-2 border-dashed border-dnd-border rounded-lg flex flex-col items-center justify-center relative overflow-hidden group hover:border-dnd-gold/50 transition-colors">
                                {newMap.image_data ? (
                                    <img src={newMap.image_data} className="w-full h-full object-cover opacity-50" />
                                ) : (
                                    <div className="text-3xl opacity-20">🖼️</div>
                                )}
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    onChange={handleFileChange}
                                    className="absolute inset-0 opacity-0 cursor-pointer" 
                                />
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <span className="text-[10px] font-bold text-dnd-gold uppercase tracking-widest">{newMap.image_data ? 'Change Image' : 'Select Image'}</span>
                                </div>
                            </div>

                            <input 
                                type="text" 
                                placeholder="Map Name" 
                                value={newMap.name}
                                onChange={e => setNewMap({...newMap, name: e.target.value})}
                                className="w-full bg-dnd-navy border border-dnd-border rounded px-4 py-2 text-sm text-white focus:border-dnd-gold outline-none"
                            />

                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] text-dnd-muted uppercase font-bold">Grid Size (px)</label>
                                <input 
                                    type="number" 
                                    value={newMap.grid_size}
                                    onChange={e => setNewMap({...newMap, grid_size: parseInt(e.target.value)})}
                                    className="w-full bg-dnd-navy border border-dnd-border rounded px-4 py-2 text-sm text-white focus:border-dnd-gold outline-none"
                                />
                            </div>

                            <button 
                                onClick={handleSaveMap}
                                disabled={isUploading || !newMap.image_data}
                                className={`w-full py-3 rounded text-xs font-bold uppercase tracking-[0.2em] shadow-lg transition-all ${
                                    isUploading ? 'bg-dnd-border text-dnd-muted' : 'bg-dnd-gold/20 text-dnd-gold border border-dnd-gold/40 hover:bg-dnd-gold hover:text-dnd-navy'
                                }`}
                            >
                                {isUploading ? 'Drafting...' : 'Add to Library'}
                            </button>
                        </div>
                    </div>

                    {/* Right: Library */}
                    <div className="col-span-12 lg:col-span-8 p-6 overflow-y-auto bg-dnd-surface2/30">
                        <h3 className="text-xs font-bold text-dnd-muted uppercase tracking-[0.2em] mb-6">Map Library</h3>
                        {maps.length === 0 ? (
                            <div className="h-64 flex flex-col items-center justify-center text-dnd-muted italic opacity-30">
                                <div className="text-5xl mb-2">📜</div>
                                <p>No maps in library.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                {maps.map(map => (
                                    <div key={map.id} className={`bg-dnd-navy border rounded-lg overflow-hidden group transition-all ${map.is_active ? 'border-dnd-gold ring-1 ring-dnd-gold/50' : 'border-dnd-border hover:border-dnd-muted'}`}>
                                        <div className="aspect-video bg-black/40 relative">
                                            {map.is_active && (
                                                <div className="absolute top-2 left-2 bg-dnd-gold text-dnd-navy text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-tighter z-10">Active</div>
                                            )}
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/60 transition-opacity z-20">
                                                {!map.is_active && (
                                                    <button 
                                                        onClick={() => handleActivate(map.id)}
                                                        className="bg-white text-black text-[10px] font-bold px-4 py-2 rounded uppercase tracking-widest hover:bg-dnd-gold transition-colors"
                                                    >Activate</button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="p-3 flex justify-between items-center bg-dnd-surface">
                                            <div>
                                                <div className="text-sm font-bold text-white truncate max-w-[150px]">{map.name}</div>
                                                <div className="text-[9px] text-dnd-muted uppercase font-mono">{map.grid_size}px Grid</div>
                                            </div>
                                            <button 
                                                onClick={() => handleDelete(map.id)}
                                                className="text-dnd-muted hover:text-dnd-red text-sm p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >🗑</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
