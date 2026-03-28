import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, ChevronDown, ChevronUp, RefreshCw, Wifi, WifiOff, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useGame } from '../context/GameContext';

interface ConnectedPlayer {
  characterId: number;
  playerName: string;
}

interface PendingSave {
  id: number;
  character_id: number;
  character_name: string | null;
  dc: number;
  ability: string;
  source: string;
  created_at: string;
}

interface AuditData {
  currentRound: number;
  currentTurn: number;
  combatActive: boolean;
  connectedPlayers: ConnectedPlayer[];
  pendingSaves: PendingSave[];
}

export function SyncAuditView() {
  const { state } = useGame();
  const party = state.characters;

  const [isExpanded, setIsExpanded] = useState(false);
  const [audit, setAudit] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sync-audit');
      const data: AuditData = await res.json();
      setAudit(data);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch {
      // silent — server may be starting up
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isExpanded && !audit) fetchAudit();
  }, [isExpanded, audit, fetchAudit]);

  const connectedIds = new Set((audit?.connectedPlayers ?? []).map(p => p.characterId));

  const partyStatus = party.map(char => ({
    id: parseInt(char.id),
    name: char.name,
    connected: connectedIds.has(parseInt(char.id)),
    playerName: audit?.connectedPlayers.find(p => p.characterId === parseInt(char.id))?.playerName,
  }));

  const allConnected = partyStatus.length > 0 && partyStatus.every(p => p.connected);
  const hasPendingSaves = (audit?.pendingSaves.length ?? 0) > 0;
  const issueCount = partyStatus.filter(p => !p.connected).length + (audit?.pendingSaves.length ?? 0);

  return (
    <Card className="border-primary/20 bg-secondary/5">
      <CardHeader
        className="pb-2 cursor-pointer select-none"
        onClick={() => setIsExpanded(v => !v)}
      >
        <CardTitle className="font-display flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Sync Audit
          {issueCount > 0 ? (
            <Badge variant="outline" className="text-[9px] ml-1 text-amber-400 border-amber-400/30">
              {issueCount} issue{issueCount !== 1 ? 's' : ''}
            </Badge>
          ) : audit ? (
            <Badge variant="outline" className="text-[9px] ml-1 text-green-400 border-green-400/30">OK</Badge>
          ) : null}
          <span className="ml-auto text-muted-foreground">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </CardTitle>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 space-y-3">
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {audit?.combatActive ? (
                <span className="text-primary font-bold">
                  Round {audit.currentRound} · Turn {audit.currentTurn}
                </span>
              ) : (
                <span className="italic opacity-50">Combat idle</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {lastRefreshed && (
                <span className="text-[9px] text-muted-foreground/40 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" /> {lastRefreshed}
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={e => { e.stopPropagation(); fetchAudit(); }}
                disabled={loading}
                title="Refresh"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Player Connection Status */}
          <div className="space-y-1">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 flex items-center gap-1">
              <Wifi className="h-2.5 w-2.5" /> Player Connections
              {allConnected && party.length > 0 && (
                <CheckCircle2 className="h-2.5 w-2.5 text-green-400 ml-1" />
              )}
            </div>
            {party.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/40 italic">No party members.</p>
            ) : (
              <div className="space-y-0.5">
                {partyStatus.map(p => (
                  <div key={p.id} className={`flex items-center gap-2 px-2 py-1 rounded border text-[10px] ${
                    p.connected
                      ? 'border-green-800/30 bg-green-950/20'
                      : 'border-amber-800/30 bg-amber-950/20'
                  }`}>
                    {p.connected
                      ? <Wifi className="h-3 w-3 text-green-400 shrink-0" />
                      : <WifiOff className="h-3 w-3 text-amber-400 shrink-0" />
                    }
                    <span className="font-semibold flex-1">{p.name}</span>
                    {p.playerName && p.playerName !== p.name && (
                      <span className="text-muted-foreground/50 text-[9px] italic">{p.playerName}</span>
                    )}
                    {!p.connected && (
                      <span className="text-amber-400 text-[8px] font-bold uppercase tracking-wide">offline</span>
                    )}
                  </div>
                ))}
                {/* Show unregistered sockets (connected but not matching a party member) */}
                {audit?.connectedPlayers
                  .filter(cp => !party.some(ch => parseInt(ch.id) === cp.characterId))
                  .map(cp => (
                    <div key={cp.characterId} className="flex items-center gap-2 px-2 py-1 rounded border border-blue-800/30 bg-blue-950/20 text-[10px]">
                      <Wifi className="h-3 w-3 text-blue-400 shrink-0" />
                      <span className="flex-1 text-muted-foreground/60 italic">{cp.playerName ?? `Socket #${cp.characterId}`}</span>
                      <span className="text-blue-400 text-[8px] font-bold uppercase">guest</span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Pending Saves */}
          <div className="space-y-1">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 flex items-center gap-1">
              <AlertTriangle className="h-2.5 w-2.5" /> Pending Saves
              {!hasPendingSaves && audit && (
                <CheckCircle2 className="h-2.5 w-2.5 text-green-400 ml-1" />
              )}
            </div>
            {!hasPendingSaves ? (
              <p className="text-[10px] text-muted-foreground/40 italic">No outstanding saving throws.</p>
            ) : (
              <div className="space-y-0.5">
                {audit!.pendingSaves.map(ps => (
                  <div key={ps.id} className="flex items-center gap-2 px-2 py-1 rounded border border-amber-800/40 bg-amber-950/20 text-[10px]">
                    <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                    <span className="font-semibold flex-1">{ps.character_name ?? `#${ps.character_id}`}</span>
                    <span className="text-amber-300 font-mono font-bold">
                      DC {ps.dc} {ps.ability.toUpperCase()}
                    </span>
                    <span className="text-muted-foreground/40 text-[8px]">from {ps.source}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* All-clear message */}
          {audit && issueCount === 0 && party.length > 0 && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-green-800/30 bg-green-950/20 text-[10px] text-green-400">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              All {party.length} player{party.length !== 1 ? 's' : ''} connected · no pending saves
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
