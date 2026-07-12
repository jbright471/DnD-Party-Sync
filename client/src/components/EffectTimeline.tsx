import { useState, useEffect, useRef } from 'react';
import { Clock, Trash2, Download, ChevronDown, ChevronUp, Zap, RotateCcw, History } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useGame } from '../context/GameContext';
import socket from '../socket';

export interface EffectEvent {
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
  request_id: string | null;
  description: string | null;
  is_reversed: number;
  reversed_by_event_id: number | null;
  group_id: string | null;
  combat_session_id: number | null;
  created_at: string;
}

interface CombatSession {
  id: number;
  encounter_id: number | null;
  name: string;
  status: 'active' | 'archived';
  started_at: string;
  ended_at: string | null;
  total_rounds: number;
  event_count: number;
}

const TIMELINE_PAGE_SIZE = 200;
const EXPORT_PAGE_SIZE = 500;

const REVERSIBLE_TYPES = new Set(['damage', 'heal', 'condition_applied', 'condition_removed']);

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
  undo:                  { label: 'UNDO',  color: 'text-slate-300',   bg: 'bg-slate-900/60 border-slate-600/40' },
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

// ─── Display sequence builder ─────────────────────────────────────────────────
// Collapses events sharing a group_id into a single group entry (at first occurrence position).

type DisplayItem =
  | { kind: 'solo'; event: EffectEvent }
  | { kind: 'group'; groupId: string; events: EffectEvent[] };

function buildDisplaySequence(events: EffectEvent[]): DisplayItem[] {
  const groupMap = new Map<string, EffectEvent[]>();
  for (const e of events) {
    if (e.group_id) {
      if (!groupMap.has(e.group_id)) groupMap.set(e.group_id, []);
      groupMap.get(e.group_id)!.push(e);
    }
  }

  const items: DisplayItem[] = [];
  const seenGroups = new Set<string>();
  for (const e of events) {
    if (!e.group_id) {
      items.push({ kind: 'solo', event: e });
    } else if (!seenGroups.has(e.group_id)) {
      seenGroups.add(e.group_id);
      items.push({ kind: 'group', groupId: e.group_id, events: groupMap.get(e.group_id)! });
    }
  }
  return items;
}

function AoEGroupSummary({ events }: { events: EffectEvent[] }) {
  const uniqueTargets = new Set(events.map(e => e.target_name).filter(Boolean)).size;
  const types = [...new Set(events.map(e => e.event_type))];
  const dmgTotal = events
    .filter(e => e.event_type === 'damage' && !e.is_reversed)
    .reduce((sum, e) => {
      try { return sum + (JSON.parse(e.payload_json)?.value || 0); } catch { return sum; }
    }, 0);

  const parts: string[] = [`${uniqueTargets} target${uniqueTargets !== 1 ? 's' : ''}`];
  if (dmgTotal > 0) parts.push(`${dmgTotal} dmg`);
  if (types.includes('condition_applied')) parts.push('conditions');

  return (
    <span className="text-foreground/70 flex-1 text-[10px]">
      {parts.join(' · ')}
    </span>
  );
}

// ─── Single event row ─────────────────────────────────────────────────────────

function EventRow({ event, isDm, indented = false }: { event: EffectEvent; isDm: boolean; indented?: boolean }) {
  const isUndo = event.phase === 'undo';
  const effectiveMeta = isUndo ? EVENT_META.undo : (EVENT_META[event.event_type] || EVENT_META.unknown);
  const isChild = event.parent_event_id !== null;
  const isAuto = event.source_preset_id !== null || event.event_type === 'automation_trigger';
  const isReversed = event.is_reversed === 1;
  const canUndo = isDm && !isReversed && !isUndo && REVERSIBLE_TYPES.has(event.event_type);

  return (
    <div
      className={`flex items-start gap-1.5 px-2 py-1 rounded border text-[10px] ${effectiveMeta.bg} ${(isChild || indented) ? 'ml-3' : ''} ${isReversed ? 'opacity-40' : ''}`}
    >
      {(isChild || indented) && (
        <span className="text-muted-foreground/30 mt-0.5 shrink-0">↳</span>
      )}
      <span className={`font-bold shrink-0 uppercase tracking-wide ${effectiveMeta.color}`}>
        {effectiveMeta.label}
      </span>
      <span className={`text-foreground/70 flex-1 leading-tight ${isReversed ? 'line-through' : ''}`}>
        {getEventSummary(event)}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        {isReversed && (
          <RotateCcw className="h-2.5 w-2.5 text-slate-500" title="Undone" />
        )}
        {isAuto && !isReversed && (
          <Zap className="h-2.5 w-2.5 text-orange-400" title="Automation" />
        )}
        <span className="text-muted-foreground/40 font-mono text-[8px]">
          T{event.turn_index}
        </span>
        {canUndo && (
          <button
            className="ml-1 text-muted-foreground/50 hover:text-amber-400 transition-colors"
            title="Undo this effect"
            onClick={() => socket.emit('reverse_event', { eventId: event.id })}
          >
            <RotateCcw className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── AoE group row ────────────────────────────────────────────────────────────

function AoEGroupRow({ groupId, events, isDm, isExpanded, onToggle }: {
  groupId: string;
  events: EffectEvent[];
  isDm: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasReversible = events.some(e => !e.is_reversed && REVERSIBLE_TYPES.has(e.event_type));
  const allReversed = events.every(e => e.is_reversed === 1);

  return (
    <div className="space-y-0.5">
      {/* Group header */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] bg-orange-950/30 border-orange-700/30 cursor-pointer select-none ${allReversed ? 'opacity-40' : ''}`}
        onClick={onToggle}
      >
        <Zap className="h-2.5 w-2.5 text-orange-400 shrink-0" />
        <span className="font-bold text-orange-400 uppercase tracking-wide shrink-0">AoE</span>
        <AoEGroupSummary events={events} />
        <div className="flex items-center gap-1 shrink-0">
          {isDm && hasReversible && (
            <button
              className="text-muted-foreground/50 hover:text-amber-400 transition-colors"
              title="Undo all events in this group"
              onClick={e => { e.stopPropagation(); socket.emit('reverse_group', { groupId }); }}
            >
              <RotateCcw className="h-2.5 w-2.5" />
            </button>
          )}
          {isExpanded
            ? <ChevronUp className="h-2.5 w-2.5 text-muted-foreground/40" />
            : <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/40" />
          }
        </div>
      </div>
      {/* Individual events when expanded */}
      {isExpanded && (
        <div className="space-y-0.5">
          {events.map(ev => (
            <EventRow key={ev.id} event={ev} isDm={isDm} indented />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function EffectTimeline() {
  const { state } = useGame();
  const isDm = state.isDm;

  const [events, setEvents] = useState<EffectEvent[]>([]);
  const [sessions, setSessions] = useState<CombatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<'live' | number>('live');
  const [hasEarlierEvents, setHasEarlierEvents] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [filter, setFilter] = useState('');
  const [undoError, setUndoError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const canModifyTimeline = isDm && selectedSessionId === 'live';

  useEffect(() => {
    const timelineUrl = selectedSessionId === 'live'
      ? `/api/effect-timeline?limit=${TIMELINE_PAGE_SIZE}`
      : `/api/effect-timeline?sessionId=${selectedSessionId}&limit=${TIMELINE_PAGE_SIZE}`;
    fetch(timelineUrl)
      .then(r => r.json())
      .then((data: EffectEvent[]) => {
        setEvents(data);
        setHasEarlierEvents(data.length === TIMELINE_PAGE_SIZE);
      })
      .catch(() => {});

    fetch('/api/combat-sessions')
      .then(r => r.json())
      .then(setSessions)
      .catch(() => {});

    const onTimelineUpdate = (data: EffectEvent[]) => {
      if (selectedSessionId === 'live') {
        setEvents(data);
        setHasEarlierEvents(data.length === TIMELINE_PAGE_SIZE);
      }
      fetch('/api/combat-sessions').then(r => r.json()).then(setSessions).catch(() => {});
    };
    socket.on('timeline_update', onTimelineUpdate);
    socket.on('rules_error', ({ message }: { message: string }) => {
      setUndoError(message);
      setTimeout(() => setUndoError(null), 3000);
    });
    return () => {
      socket.off('timeline_update', onTimelineUpdate);
      socket.off('rules_error');
    };
  }, [selectedSessionId]);

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
        e.event_type.includes(filter.toLowerCase()) ||
        (e.description?.toLowerCase().includes(filter.toLowerCase())) ||
        e.payload_json.toLowerCase().includes(filter.toLowerCase())
      )
    : events;

  const grouped = groupByRound(filtered);
  const rounds = [...grouped.keys()].sort((a, b) => a - b);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  };

  const handleClear = () => {
    if (confirm('Clear the current combat timeline? This cannot be undone.')) {
      socket.emit('clear_effect_timeline');
    }
  };

  const handleLoadEarlier = async () => {
    if (events.length === 0) return;
    const params = new URLSearchParams({ beforeId: String(events[0].id), limit: String(TIMELINE_PAGE_SIZE) });
    if (selectedSessionId !== 'live') params.set('sessionId', String(selectedSessionId));
    try {
      const older: EffectEvent[] = await fetch(`/api/effect-timeline?${params}`).then(r => r.json());
      setEvents(current => [...older, ...current]);
      setHasEarlierEvents(older.length === TIMELINE_PAGE_SIZE);
    } catch { /* keep the visible page */ }
  };

  const handleExport = async () => {
    let allEvents: EffectEvent[] = events;
    try {
      let exportedEvents: EffectEvent[] = [];
      let beforeId: number | undefined;
      let page: EffectEvent[];
      do {
        const params = new URLSearchParams({ limit: String(EXPORT_PAGE_SIZE) });
        if (selectedSessionId !== 'live') params.set('sessionId', String(selectedSessionId));
        if (beforeId !== undefined) params.set('beforeId', String(beforeId));
        page = await fetch(`/api/effect-timeline?${params}`).then(r => r.json());
        exportedEvents = [...page, ...exportedEvents];
        beforeId = page[0]?.id;
      } while (page.length === EXPORT_PAGE_SIZE && beforeId !== undefined);
      allEvents = exportedEvents;
    } catch { /* use in-state events */ }

    const date = new Date().toISOString().slice(0, 10);
    const reversedCount = allEvents.filter(e => e.is_reversed).length;
    const lines: string[] = [
      `# Arcane Ally — Combat Log`,
      `**Exported:** ${date}  `,
      `**Total Events:** ${allEvents.length}${reversedCount > 0 ? ` (${reversedCount} reversed)` : ''}`,
      ``,
      `---`,
    ];

    const byRound = groupByRound(allEvents);
    const rounds = [...byRound.keys()].sort((a, b) => a - b);
    for (const round of rounds) {
      lines.push(``, `## ${round === 0 ? 'Pre-Combat' : `Round ${round}`}`, ``);
      lines.push(`| Turn | Actor | Type | Target | Detail |`);
      lines.push(`|------|-------|------|--------|--------|`);
      for (const ev of byRound.get(round)!) {
        const type = ev.phase === 'undo' ? 'UNDO' : (EVENT_META[ev.event_type]?.label ?? ev.event_type.toUpperCase());
        const summary = getEventSummary(ev);
        const target = ev.target_name ?? '—';
        const actor = ev.actor;
        const turn = `T${ev.turn_index}`;
        if (ev.is_reversed) {
          lines.push(`| ${turn} | ~~${actor}~~ | ~~${type}~~ | ~~${target}~~ | ~~${summary}~~ _(undone)_ |`);
        } else {
          lines.push(`| ${turn} | ${actor} | ${type} | ${target} | ${summary} |`);
        }
      }
    }
    lines.push(``, `---`, `_Generated by Arcane Ally_`);

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `combat-log-${date}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
            <div className="relative shrink-0">
              <History className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <select
                value={selectedSessionId}
                onChange={event => setSelectedSessionId(event.target.value === 'live' ? 'live' : Number(event.target.value))}
                aria-label="Choose combat timeline"
                className="h-7 max-w-44 rounded-md border border-input bg-background/50 pl-7 pr-2 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="live">Current timeline</option>
                {sessions.filter(session => session.status === 'archived').map(session => (
                  <option key={session.id} value={session.id}>
                    {session.name} ({session.event_count})
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              name="timeline-filter"
              autoComplete="off"
              aria-label="Filter combat timeline"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search actor, target, spell, condition…"
              className="flex-1 h-7 rounded-md border border-input bg-background/50 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10px] text-muted-foreground hover:text-primary"
              onClick={handleExport}
              title="Export as markdown"
              aria-label="Export timeline as Markdown"
            >
              <Download className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10px] text-muted-foreground hover:text-destructive"
              onClick={handleClear}
              title="Clear timeline"
              aria-label="Clear current timeline"
              disabled={selectedSessionId !== 'live'}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          {undoError && (
            <div className="px-2 py-1 rounded border border-destructive/40 bg-destructive/10 text-[10px] text-destructive">
              {undoError}
            </div>
          )}

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
                {hasEarlierEvents && (
                  <button onClick={handleLoadEarlier} className="w-full py-1 text-[10px] text-primary/80 hover:text-primary">
                    Load earlier events
                  </button>
                )}
                {rounds.map(round => {
                  const sequence = buildDisplaySequence(grouped.get(round)!);
                  return (
                    <div key={round}>
                      {/* Round header */}
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-[9px] font-bold text-primary/60 uppercase tracking-widest">
                          {round === 0 ? 'Pre-Combat' : `Round ${round}`}
                        </div>
                        <div className="flex-1 h-px bg-primary/10" />
                        <span className="text-[8px] text-muted-foreground/40">{grouped.get(round)!.length} events</span>
                      </div>

                      {/* Display items */}
                      <div className="space-y-0.5">
                        {sequence.map((item, idx) =>
                          item.kind === 'solo' ? (
                            <EventRow key={item.event.id} event={item.event} isDm={canModifyTimeline} />
                          ) : (
                            <AoEGroupRow
                              key={`group-${item.groupId}-${idx}`}
                              groupId={item.groupId}
                              events={item.events}
                              isDm={canModifyTimeline}
                              isExpanded={expandedGroups.has(item.groupId)}
                              onToggle={() => toggleGroup(item.groupId)}
                            />
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}
