import { useState, useEffect, useRef, useCallback } from 'react';
import { useGame } from '../context/GameContext';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { RefreshCw, Map, Users, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import socket from '../socket';
import { useAuthenticatedResourceUrl } from '../hooks/useAuthenticatedResourceUrl';

// Token data structure from map_state broadcast
interface MapToken {
  id: number;
  map_id: number;
  entity_id: string;    // 'pc-{charId}' or 'm-{instanceId}'
  entity_name: string;
  entity_type: 'pc' | 'monster' | 'npc';
  x: number;           // percentage 0-100
  y: number;           // percentage 0-100
  is_hidden: number;
}

interface MapState {
  id: number;
  name: string;
  image_data: string | null;
  tokens: MapToken[];
}

interface InitiativeEntry {
  id: number;
  entity_name: string;
  entity_type: string;
  current_hp: number;
  max_hp: number;
  character_id: number | null;
  instance_id: string | null;
  is_hidden: number;
}

const TOKEN_COLORS: Record<string, string> = {
  pc:      '#6366f1',  // indigo
  monster: '#ef4444',  // red
  npc:     '#a855f7',  // purple
};

const HP_COLOR = (pct: number) =>
  pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#f59e0b' : '#ef4444';

function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) || '?';
}

export default function BattleMap() {
  const { state } = useGame();
  const isDm = state.isDm;
  const initiativeState = (state.initiativeState || []) as InitiativeEntry[];

  const [mapState, setMapState] = useState<MapState | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dragging state
  const dragging = useRef<{ tokenId: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [localPositions, setLocalPositions] = useState<Record<number, { x: number; y: number }>>({});
  const mapImageUrl = useAuthenticatedResourceUrl(mapState?.image_data);

  useEffect(() => {
    const handler = (data: MapState | null) => setMapState(data);
    socket.on('map_state', handler);
    // Request current state on mount
    socket.emit('sync_map_tokens');
    return () => { socket.off('map_state', handler); };
  }, []);

  // Resolve HP data for a token from initiative state
  const getHpData = (token: MapToken) => {
    let entry: InitiativeEntry | undefined;
    if (token.entity_type === 'pc') {
      const charId = parseInt(token.entity_id.replace('pc-', ''));
      entry = initiativeState.find(e => e.character_id === charId);
    } else {
      const instanceId = token.entity_id.replace('m-', '');
      entry = initiativeState.find(e => e.instance_id === instanceId);
    }
    return entry ? { current: entry.current_hp, max: entry.max_hp } : null;
  };

  const handlePointerDown = useCallback((e: React.PointerEvent, token: MapToken) => {
    if (!isDm) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = localPositions[token.id] ?? { x: token.x, y: token.y };
    dragging.current = { tokenId: token.id, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  }, [isDm, localPositions]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragging.current.startX) / rect.width)  * 100;
    const dy = ((e.clientY - dragging.current.startY) / rect.height) * 100;
    const newX = Math.max(0, Math.min(100, dragging.current.origX + dx));
    const newY = Math.max(0, Math.min(100, dragging.current.origY + dy));
    setLocalPositions(prev => ({ ...prev, [dragging.current!.tokenId]: { x: newX, y: newY } }));
  }, []);

  const handlePointerUp = useCallback((_e: React.PointerEvent) => {
    if (!dragging.current) return;
    const d = dragging.current;
    dragging.current = null;
    const pos = localPositions[d.tokenId];
    if (pos) {
      socket.emit('move_token', { tokenId: d.tokenId, x: Math.round(pos.x * 10) / 10, y: Math.round(pos.y * 10) / 10 });
    }
  }, [localPositions]);

  const handleSyncTokens = () => {
    socket.emit('sync_map_tokens');
    toast.success('Synced tokens from initiative tracker.');
  };

  const tokens = mapState?.tokens ?? [];
  const visibleTokens = isDm && showHidden ? tokens : tokens.filter(t => !t.is_hidden);

  if (!mapState) {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Map className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-display tracking-wider">Battlemap</h1>
        </div>
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground space-y-3 border border-border/20 rounded-xl bg-secondary/5">
          <Map className="h-12 w-12 opacity-20" />
          <p className="italic text-sm">No active battlemap. Ask the DM to set one up.</p>
          {isDm && (
            <Button size="sm" variant="outline" onClick={handleSyncTokens}>
              <RefreshCw className="h-4 w-4 mr-2" /> Sync Tokens
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-3 pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Map className="h-6 w-6 text-primary shrink-0" />
        <h1 className="text-2xl font-display tracking-wider">{mapState.name || 'Battlemap'}</h1>
        <Badge variant="outline" className="text-[10px] font-mono">{visibleTokens.length} token{visibleTokens.length !== 1 ? 's' : ''}</Badge>
        <div className="ml-auto flex items-center gap-2">
          {isDm && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setShowHidden(v => !v)}>
                    {showHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 opacity-40" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">{showHidden ? 'Hiding hidden tokens' : 'Showing hidden tokens'}</TooltipContent>
              </Tooltip>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleSyncTokens}>
                <Users className="h-4 w-4 mr-1.5" /> Sync from Initiative
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Map canvas */}
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden border border-primary/20 bg-black"
        style={{ aspectRatio: '16/9', userSelect: 'none' }}
        onPointerMove={isDm ? handlePointerMove : undefined}
        onPointerUp={isDm ? handlePointerUp : undefined}
        onPointerLeave={isDm ? handlePointerUp : undefined}
      >
        {mapImageUrl && (
          <img
            src={mapImageUrl}
            alt={mapState.name}
            className="w-full h-full object-contain"
            draggable={false}
          />
        )}

        {/* Tokens */}
        {visibleTokens.map(token => {
          const pos = localPositions[token.id] ?? { x: token.x, y: token.y };
          const hpData = getHpData(token);
          const hpPct  = hpData ? Math.max(0, hpData.current / hpData.max) : 1;
          const color  = TOKEN_COLORS[token.entity_type] ?? TOKEN_COLORS.monster;
          const hidden = !!token.is_hidden;

          return (
            <div
              key={token.id}
              style={{
                position: 'absolute',
                left: `${pos.x}%`,
                top:  `${pos.y}%`,
                transform: 'translate(-50%, -50%)',
                cursor: isDm ? 'grab' : 'default',
                touchAction: 'none',
                opacity: hidden ? 0.5 : 1,
              }}
              onPointerDown={isDm ? (e) => handlePointerDown(e, token) : undefined}
            >
              {/* Token circle */}
              <div
                className="relative flex items-center justify-center rounded-full border-2 text-white font-bold text-[10px] select-none shadow-lg"
                style={{
                  width: 32,
                  height: 32,
                  backgroundColor: color,
                  borderColor: hidden ? '#888' : 'white',
                  boxShadow: `0 0 6px ${color}80`,
                }}
                title={`${token.entity_name}${hpData ? ` — HP: ${hpData.current}/${hpData.max}` : ''}`}
              >
                {getInitials(token.entity_name)}
                {hidden && (
                  <EyeOff className="absolute -top-1 -right-1 h-3 w-3 text-slate-300 bg-black/60 rounded-full p-0.5" />
                )}
                {/* HP bar */}
                {hpData && (
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-b-full overflow-hidden"
                    style={{ height: 3 }}
                  >
                    <div
                      style={{
                        width: `${hpPct * 100}%`,
                        height: '100%',
                        backgroundColor: HP_COLOR(hpPct),
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                )}
              </div>
              {/* Name label */}
              <div
                className="absolute top-full mt-0.5 left-1/2 -translate-x-1/2 text-[8px] text-white font-semibold whitespace-nowrap bg-black/60 px-1 rounded pointer-events-none"
              >
                {token.entity_name.split(' ')[0]}
              </div>
            </div>
          );
        })}
      </div>

      {/* Token legend */}
      {visibleTokens.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visibleTokens.map(token => {
            const hpData = getHpData(token);
            const hpPct  = hpData ? Math.max(0, hpData.current / hpData.max) : null;
            const color  = TOKEN_COLORS[token.entity_type] ?? TOKEN_COLORS.monster;
            return (
              <div
                key={token.id}
                className="flex items-center gap-1.5 text-xs bg-secondary/30 border border-border/20 rounded px-2 py-1"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="font-display">{token.entity_name}</span>
                {hpData && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {hpData.current}/{hpData.max}
                  </span>
                )}
                {token.entity_type !== 'pc' && hpPct !== null && (
                  <span className="text-[10px]" style={{ color: HP_COLOR(hpPct) }}>
                    {Math.round(hpPct * 100)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
