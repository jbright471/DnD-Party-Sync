import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Map, MapPin, Swords, ScrollText, Eye, EyeOff,
  Trash2, Navigation, Castle, Plus
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../components/ui/select';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from 'sonner';
import socket from '../socket';

interface WorldMarker {
  id: number;
  parent_map_id: number;
  linked_map_id: number | null;
  name: string;
  type: string;
  x: number;
  y: number;
  is_discovered: number;
  is_hidden: number;
  description: string;
}

interface WorldMapData {
  id: number;
  name: string;
  map_url: string;
  markers: WorldMarker[];
}

const MARKER_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  location: { icon: MapPin,    color: 'text-amber-400',  label: 'Location' },
  quest:    { icon: ScrollText, color: 'text-blue-400',   label: 'Quest Site' },
  encounter:{ icon: Swords,    color: 'text-red-400',    label: 'Encounter' },
  dungeon:  { icon: Castle,    color: 'text-purple-400', label: 'Dungeon' },
};

type EditingMarker = Partial<WorldMarker> & { isNew?: boolean; pendingX?: number; pendingY?: number };

export default function WorldMapPage() {
  const [worldMap, setWorldMap] = useState<WorldMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDm, setIsDm] = useState(false);
  const [allMaps, setAllMaps] = useState<{ id: number; name: string }[]>([]);

  // Upload state
  const [uploadName, setUploadName] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Marker dialog
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<EditingMarker>({});
  const [selectedMarker, setSelectedMarker] = useState<WorldMarker | null>(null);

  const fetchWorldMap = useCallback(async () => {
    try {
      const res = await fetch('/api/maps/overworld');
      setWorldMap(res.ok ? await res.json() : null);
    } catch {
      setWorldMap(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorldMap();
    fetch('/api/maps').then(r => r.json()).then(setAllMaps).catch(() => {});

    socket.on('world_map_state', (data: WorldMapData | null) => setWorldMap(data));
    return () => { socket.off('world_map_state'); };
  }, [fetchWorldMap]);

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDm || !worldMap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setEditing({ isNew: true, pendingX: x, pendingY: y, type: 'location', is_discovered: 0, is_hidden: 0, description: '' });
    setSelectedMarker(null);
    setShowDialog(true);
  };

  const handleMarkerClick = (e: React.MouseEvent, marker: WorldMarker) => {
    e.stopPropagation();
    setSelectedMarker(marker);
    if (isDm) {
      setEditing({ ...marker });
    }
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!worldMap || !editing.name?.trim()) return;

    if (editing.isNew) {
      await fetch(`/api/maps/${worldMap.id}/markers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editing.name,
          type: editing.type || 'location',
          x: editing.pendingX,
          y: editing.pendingY,
          linked_map_id: editing.linked_map_id || null,
          description: editing.description || '',
        }),
      });
      toast.success('Marker placed on the map.');
    } else {
      await fetch(`/api/maps/markers/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editing.name,
          type: editing.type,
          linked_map_id: editing.linked_map_id ?? null,
          description: editing.description || '',
          is_discovered: editing.is_discovered ?? 0,
          is_hidden: editing.is_hidden ?? 0,
        }),
      });
      toast.success('Marker updated.');
    }

    setShowDialog(false);
    socket.emit('refresh_world_map');
    fetchWorldMap();
  };

  const handleDelete = async (markerId: number) => {
    await fetch(`/api/maps/markers/${markerId}`, { method: 'DELETE' });
    setShowDialog(false);
    setSelectedMarker(null);
    socket.emit('refresh_world_map');
    fetchWorldMap();
    toast.success('Marker removed from the realm.');
  };

  const handleToggleDiscovered = async (marker: WorldMarker, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/maps/markers/${marker.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_discovered: marker.is_discovered ? 0 : 1 }),
    });
    socket.emit('refresh_world_map');
    fetchWorldMap();
  };

  const handleFastTravel = (mapId: number) => {
    socket.emit('activate_map', { mapId });
    toast.success('The party is transported to the location...');
    setShowDialog(false);
  };

  const handleUpload = () => {
    if (!fileInputRef.current?.files?.[0] || !uploadName.trim()) return;
    setUploading(true);
    const file = fileInputRef.current.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const res = await fetch('/api/maps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: uploadName, image_data: e.target?.result, grid_size: 50 }),
        });
        const created = await res.json();
        await fetch(`/api/maps/${created.id}/set-overworld`, { method: 'POST' });
        socket.emit('refresh_world_map');
        await fetchWorldMap();
        toast.success('The world map has been charted!');
      } catch {
        toast.error('Upload failed. The cartographers are stumped.');
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const visibleMarkers = worldMap?.markers.filter(m =>
    isDm || (m.is_discovered && !m.is_hidden)
  ) ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground italic animate-pulse">
        Consulting the cartographers...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Map className="h-7 w-7 text-primary shrink-0" />
        <h1 className="text-3xl font-display tracking-wider">The Known World</h1>
        <p className="text-muted-foreground text-sm ml-2">Global overworld & fast-travel</p>
        <div className="ml-auto flex items-center gap-2">
          <Switch id="dm-mode-wm" checked={isDm} onCheckedChange={setIsDm} />
          <Label htmlFor="dm-mode-wm" className="text-sm text-muted-foreground cursor-pointer">DM Mode</Label>
        </div>
      </div>

      {!worldMap ? (
        /* ── No overworld yet ── */
        <Card className="p-8 border-primary/20 bg-secondary/5 text-center space-y-5 max-w-lg mx-auto">
          <Map className="h-16 w-16 mx-auto text-muted-foreground opacity-20" />
          <p className="text-muted-foreground italic text-sm">
            No world map has been charted yet. The lands beyond remain uncharted.
          </p>
          {isDm && (
            <div className="space-y-3 text-left">
              <Input
                placeholder="Map name (e.g. The Forgotten Realms)"
                value={uploadName}
                onChange={e => setUploadName(e.target.value)}
                className="bg-background/50"
              />
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary/10 file:text-primary file:font-semibold hover:file:bg-primary/20 cursor-pointer"
              />
              <Button
                onClick={handleUpload}
                disabled={uploading || !uploadName.trim()}
                className="w-full"
              >
                {uploading ? 'Charting the realm...' : 'Set as World Map'}
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-10rem)]">
          {/* ── Map Canvas ── */}
          <div className="lg:col-span-9 flex flex-col gap-2">
            {isDm && (
              <p className="text-[10px] text-muted-foreground italic">
                Click anywhere on the map to place a new marker. Click an existing marker to edit it.
              </p>
            )}
            <div
              className={`relative rounded-lg overflow-hidden border border-primary/20 bg-black flex-1 min-h-0 ${isDm ? 'cursor-crosshair' : 'cursor-default'}`}
              onClick={handleMapClick}
            >
              <img
                src={worldMap.map_url}
                alt={worldMap.name}
                className="w-full h-full object-contain select-none"
                draggable={false}
              />

              {/* SVG marker overlay */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {visibleMarkers.map(marker => {
                  const meta = MARKER_META[marker.type] || MARKER_META.location;
                  const undiscovered = !marker.is_discovered;
                  const hidden = !!marker.is_hidden;
                  return (
                    <circle
                      key={`pulse-${marker.id}`}
                      cx={marker.x}
                      cy={marker.y}
                      r="1.2"
                      className={`${undiscovered && isDm ? 'fill-border/40' : hidden ? 'fill-muted-foreground/20' : 'fill-primary/20'}`}
                    />
                  );
                })}
              </svg>

              {/* HTML marker pins */}
              {visibleMarkers.map(marker => {
                const meta = MARKER_META[marker.type] || MARKER_META.location;
                const Icon = meta.icon;
                const undiscovered = !marker.is_discovered;
                const hidden = !!marker.is_hidden;

                return (
                  <div
                    key={marker.id}
                    className="absolute transform -translate-x-1/2 -translate-y-full pointer-events-auto cursor-pointer group"
                    style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                    onClick={e => handleMarkerClick(e, marker)}
                  >
                    <div className={`flex flex-col items-center gap-0.5 transition-all duration-200 ${hidden ? 'opacity-40' : ''}`}>
                      <div className={`
                        p-1.5 rounded-full border-2 shadow-lg transition-all duration-200
                        group-hover:scale-125 group-hover:shadow-xl
                        ${undiscovered
                          ? 'border-border/60 bg-background/50'
                          : 'border-primary/60 bg-background/90 group-hover:border-primary'
                        }
                      `}>
                        <Icon className={`h-3 w-3 ${undiscovered && isDm ? 'text-muted-foreground/50' : meta.color}`} />
                      </div>
                      <div className={`
                        text-[9px] font-bold tracking-wide whitespace-nowrap
                        bg-background/90 border border-border/40 px-1.5 py-0.5 rounded shadow
                        opacity-0 group-hover:opacity-100 transition-opacity duration-150
                        ${meta.color}
                      `}>
                        {marker.name}
                        {isDm && hidden && <span className="text-muted-foreground/60 ml-1">(hidden)</span>}
                        {isDm && undiscovered && <span className="text-muted-foreground/60 ml-1">(undiscovered)</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex gap-4 flex-wrap">
              {Object.entries(MARKER_META).map(([type, meta]) => {
                const Icon = meta.icon;
                return (
                  <div key={type} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon className={`h-3 w-3 ${meta.color}`} />
                    <span>{meta.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── DM Sidebar: Marker List ── */}
          <Card className="lg:col-span-3 flex flex-col border-primary/20 bg-secondary/5">
            <div className="p-3 border-b border-border shrink-0 flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {isDm ? 'All Markers' : 'Discovered Locations'}
              </span>
              <Badge variant="outline" className="text-[9px]">
                {isDm ? worldMap.markers.length : visibleMarkers.length}
              </Badge>
            </div>
            <ScrollArea className="flex-1">
              {(isDm ? worldMap.markers : visibleMarkers).length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-xs italic opacity-40">
                  <MapPin className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No locations charted yet.
                </div>
              ) : (
                (isDm ? worldMap.markers : visibleMarkers).map(marker => {
                  const meta = MARKER_META[marker.type] || MARKER_META.location;
                  const Icon = meta.icon;
                  return (
                    <div
                      key={marker.id}
                      className="flex items-center gap-2 p-3 border-b border-border/30 hover:bg-secondary/20 cursor-pointer transition-colors group"
                      onClick={() => { setSelectedMarker(marker); if (isDm) setEditing({ ...marker }); setShowDialog(true); }}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">{marker.name}</div>
                        <div className="text-[9px] text-muted-foreground capitalize">{meta.label}</div>
                      </div>
                      {isDm && (
                        <button
                          className="shrink-0 text-muted-foreground/40 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                          onClick={e => handleToggleDiscovered(marker, e)}
                          title={marker.is_discovered ? 'Hide from players' : 'Reveal to players'}
                        >
                          {marker.is_discovered
                            ? <Eye className="h-3.5 w-3.5 text-green-500" />
                            : <EyeOff className="h-3.5 w-3.5" />
                          }
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </ScrollArea>
            {isDm && (
              <div className="p-3 border-t border-border shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs"
                  onClick={() => {
                    setEditing({ isNew: true, pendingX: 50, pendingY: 50, type: 'location', is_discovered: 0, is_hidden: 0, description: '' });
                    setSelectedMarker(null);
                    setShowDialog(true);
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Marker
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Marker Dialog ── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm bg-background border-primary/20">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              {editing.type && (() => {
                const meta = MARKER_META[editing.type] || MARKER_META.location;
                const Icon = meta.icon;
                return <Icon className={`h-4 w-4 ${meta.color}`} />;
              })()}
              {editing.isNew ? 'Place New Marker' : (isDm ? `Edit: ${editing.name}` : selectedMarker?.name)}
            </DialogTitle>
          </DialogHeader>

          {/* Player view */}
          {!isDm && selectedMarker && (
            <div className="space-y-2 py-2">
              {selectedMarker.description ? (
                <p className="text-sm text-foreground/80 leading-relaxed italic">
                  {selectedMarker.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic opacity-50">
                  A place shrouded in mystery.
                </p>
              )}
              <Badge variant="outline" className="text-[10px] capitalize">{selectedMarker.type}</Badge>
            </div>
          )}

          {/* DM edit form */}
          {isDm && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs mb-1 block">Name</Label>
                <Input
                  value={editing.name || ''}
                  onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                  placeholder="The Sunken Citadel"
                  className="bg-background/50"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Player-Visible Description</Label>
                <Textarea
                  value={editing.description || ''}
                  onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                  placeholder="What the party sees when they approach..."
                  className="bg-background/50 text-sm resize-none"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs mb-1 block">Type</Label>
                  <Select
                    value={editing.type || 'location'}
                    onValueChange={v => setEditing(p => ({ ...p, type: v }))}
                  >
                    <SelectTrigger className="bg-background/50 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(MARKER_META).map(([val, meta]) => (
                        <SelectItem key={val} value={val} className="text-xs">{meta.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Links to Battlemap</Label>
                  <Select
                    value={editing.linked_map_id?.toString() || 'none'}
                    onValueChange={v => setEditing(p => ({ ...p, linked_map_id: v === 'none' ? null : parseInt(v) }))}
                  >
                    <SelectTrigger className="bg-background/50 h-8 text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">None</SelectItem>
                      {allMaps.map(m => (
                        <SelectItem key={m.id} value={m.id.toString()} className="text-xs">{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-4 pt-1">
                <div className="flex items-center gap-2">
                  <Switch
                    id="discovered"
                    checked={!!editing.is_discovered}
                    onCheckedChange={v => setEditing(p => ({ ...p, is_discovered: v ? 1 : 0 }))}
                  />
                  <Label htmlFor="discovered" className="text-xs cursor-pointer">Revealed</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="hidden"
                    checked={!!editing.is_hidden}
                    onCheckedChange={v => setEditing(p => ({ ...p, is_hidden: v ? 1 : 0 }))}
                  />
                  <Label htmlFor="hidden" className="text-xs cursor-pointer">DM Only</Label>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 flex-wrap">
            {!editing.isNew && isDm && (
              <Button variant="destructive" size="sm" onClick={() => handleDelete(editing.id!)}>
                <Trash2 className="h-3 w-3 mr-1" /> Delete
              </Button>
            )}
            {!editing.isNew && isDm && editing.linked_map_id && (
              <Button variant="outline" size="sm" onClick={() => handleFastTravel(editing.linked_map_id!)}>
                <Navigation className="h-3 w-3 mr-1" /> Fast Travel
              </Button>
            )}
            {isDm && (
              <Button size="sm" onClick={handleSave} disabled={!editing.name?.trim()}>
                {editing.isNew ? 'Place Marker' : 'Save'}
              </Button>
            )}
            {!isDm && (
              <Button size="sm" variant="outline" onClick={() => setShowDialog(false)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
