import { useState, useEffect, useRef } from 'react';
import { Clock, Trash2, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import socket from '../socket';

interface EffectEvent {
  id: number;
  session_round: number;
  turn_index: number;
  phase: string;
  event_type: string;
  actor: string;
  target_id: number | null;
  target_type: string;
  target_name: string | null;
  payload_json: string;
  parent_event_id: number | null;
  source_preset_id: number | null;
  created_at: string;
}

const EVENT_META: Record<string, { label: string; color: string; bg: string }> = {
  damage:                { label: 'DMG',   color: 'text-red-400',     bg: 'bg-red-950/40 border-red-800/40' },
  heal:                  { label: 'HEAL',  color: 'text-green-400',   bg: 'bg-green-950/40 border-green-800/40' },
  condition_applied:     { label: 'COND',  color: 'text-amber-400',   bg: 'bg-amber-950/40 border-amber-800/40' },
  condition_removed:     { label: '-COND', color: 'text-slate-400',   bg: 'bg-slate-900/40 border-slate-700/40' },
  buff_applied:          { label: 'BUFF',  color: 'text-blue-400',    bg: 'bg-blue-950/40 border-blue-800/40' },
  buff_removed:          { label: '-BUFF', color: 'text-slate-400',   bg: 'bg-slate-900/40 border-slate-700/40' },
  automation_trigger:    { label: 'AUTO',  color: 'text-orange-400',  bg: 'bg-orange-950/40 border-orange-800/40' },
  concentration_check:   { label: 'CON✓', color: 'text-violet-400',  bg: 'bg-violet-950/40 border-violet-800/40' },
  concentration_broken:  { label: 'CONC!', color: 'text-rose-300',   bg: 'bg-rose-950/60 border-rose-600/60' },
  unknown:               { label: '???',   color: 'text-muted-foreground', bg: 'bg-secondary/20 border-border/40' },
};

function getEventSummary(event: EffectEvent): string {
  try {
    const p = JSON.parse(event.payload_json || '{}');
    switch (event.event_type) {
      case 'damage':
        return `${p.value ?? '?'} ${p.damageType || 'untyped'} dmg → ${event.target_name}`;
      case 'heal':
        return `+${p.value ?? '?'} HP → ${event.target_name}`;
      case 'condition_applied':
        return `${p.condition} → ${event.target_name}`;
      case 'condition_removed':
        return `${p.condition} removed from ${event.target_name}`;
      case 'buff_applied':
        return `${p.buffData?.name ?? p.name ?? 'Buff'} → ${event.target_name}`;
      case 'automation_trigger':
        return `Triggered: ${p.presetName ?? event.actor}`;
      case 'concentration_check':
        return `${event.target_name} Con save — ${p.passed ? 'PASS' : 'FAIL'} (rolled ${p.total} vs DC ${p.dc}) on ${p.spellName}`;
      case 'concentration_broken':
        return `${event.target_name} lost concentration on ${p.spellName} (rolled ${p.total} vs DC ${p.dc})`;
      default:
        return event.target_name ? `→ ${event.target_name}` : event.actor;
    }
  } catch {
    return event.actor;
  }
}

function groupByRound(events: EffectEvent[]): Map<number, EffectEvent[]> {
  const map = new Map<number, EffectEvent[]>();
  for (const e of events) {
    const round = e.session_round || 0;
    if (!map.has(round)) map.set(round, []);
    map.get(round)!.push(e);
  }
  return map;
}

export function EffectTimeline() {
  const [events, setEvents] = useState<EffectEvent[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [filter, setFilter] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/effect-timeline')
      .then(r => r.json())
      .then(setEvents)
      .catch(() => {});

    socket.on('timeline_update', (data: EffectEvent[]) => setEvents(data));
    return () => { socket.off('timeline_update'); };
  }, []);

  // Auto-scroll to bottom when new events arrive and panel is open
  useEffect(() => {
    if (isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, isExpanded]);

  const filtered = filter.trim()
    ? events.filter(e =>
        (e.target_name?.toLowerCase().includes(filter.toLowerCase())) ||
        e.actor.toLowerCase().includes(filter.toLowerCase()) ||
        e.event_type.includes(filter.toLowerCase())
      )
    : events;

  const grouped = groupByRound(filtered);
  const rounds = [...grouped.keys()].sort((a, b) => a - b);

  const handleClear = () => socket.emit('clear_effect_timeline');

  return (
    <Card className="border-primary/20 bg-secondary/5">
      <CardHeader
        className="pb-2 cursor-pointer select-none"
        onClick={() => setIsExpanded(v => !v)}
      >
        <CardTitle className="font-display flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-primary" />
          Combat Timeline
          <Badge variant="outline" className="text-[9px] ml-1">{events.length}</Badge>
          <span className="ml-auto text-muted-foreground">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </CardTitle>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 space-y-2">
          {/* Controls */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter by character or type..."
              className="flex-1 h-7 rounded-md border border-input bg-background/50 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10px] text-muted-foreground hover:text-destructive"
              onClick={handleClear}
              title="Clear timeline"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(EVENT_META).filter(([k]) => k !== 'unknown').map(([type, meta]) => (
              <button
                key={type}
                onClick={() => setFilter(f => f === type ? '' : type)}
                className={`text-[8px] font-bold px-1.5 py-0.5 rounded border transition-opacity ${meta.bg} ${meta.color} ${filter === type ? 'opacity-100 ring-1 ring-current' : 'opacity-60 hover:opacity-100'}`}
              >
                {meta.label}
              </button>
            ))}
          </div>

          {/* Timeline */}
          <ScrollArea className="h-64" ref={scrollRef as any}>
            {events.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground/40 italic text-xs">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No events recorded yet.
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-4 text-center text-muted-foreground/40 italic text-xs">
                No events match the filter.
              </div>
            ) : (
              <div className="space-y-3 pr-2">
                {rounds.map(round => (
                  <div key={round}>
                    {/* Round header */}
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-[9px] font-bold text-primary/60 uppercase tracking-widest">
                        {round === 0 ? 'Pre-Combat' : `Round ${round}`}
                      </div>
                      <div className="flex-1 h-px bg-primary/10" />
                      <span className="text-[8px] text-muted-foreground/40">{grouped.get(round)!.length} events</span>
                    </div>

                    {/* Events in this round */}
                    <div className="space-y-0.5">
                      {grouped.get(round)!.map(event => {
                        const meta = EVENT_META[event.event_type] || EVENT_META.unknown;
                        const isChild = event.parent_event_id !== null;
                        const isAuto = event.source_preset_id !== null || event.event_type === 'automation_trigger';

                        return (
                          <div
                            key={event.id}
                            className={`flex items-start gap-1.5 px-2 py-1 rounded border text-[10px] ${meta.bg} ${isChild ? 'ml-3' : ''}`}
                          >
                            {isChild && (
                              <span className="text-muted-foreground/30 mt-0.5 shrink-0">↳</span>
                            )}
                            <span className={`font-bold shrink-0 uppercase tracking-wide ${meta.color}`}>
                              {meta.label}
                            </span>
                            <span className="text-foreground/70 flex-1 leading-tight">{getEventSummary(event)}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {isAuto && (
                                <Zap className="h-2.5 w-2.5 text-orange-400" title="Automation" />
                              )}
                              <span className="text-muted-foreground/40 font-mono text-[8px]">
                                T{event.turn_index}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}
