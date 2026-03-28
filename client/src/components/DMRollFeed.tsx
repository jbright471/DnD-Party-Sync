/**
 * DMRollFeed — real-time dice roll aggregator for the DM Dashboard.
 *
 * Listens to `roll_feed_event` socket events and renders them as a
 * scannable chat-style log with per-type colour coding and filter toggles.
 * Rolls are in-memory only (not persisted); the feed resets on page reload.
 */

import { useState, useEffect, useRef } from 'react';
import { Activity, Lock, Trash2, Filter } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import socket from '../socket';
import { RollFeedEvent, ROLL_TYPE_META, getRollTypeMeta } from '../types/effects';
import { useGame } from '../context/GameContext';

// Filter groups — each maps a set of rollTypes to a display tag
const FILTERS: { key: string; label: string; color: string; bg: string; types: string[] }[] = [
  { key: 'atk',   label: 'ATK',  color: 'text-amber-300',  bg: 'bg-amber-950/60',  types: ['Attack Roll'] },
  { key: 'dmg',   label: 'DMG',  color: 'text-red-400',    bg: 'bg-red-950/60',    types: ['Damage Roll', 'Critical Damage'] },
  { key: 'skill', label: 'SKILL',color: 'text-blue-400',   bg: 'bg-blue-950/60',   types: ['Skill Check', 'Ability Check'] },
  { key: 'save',  label: 'SAVE', color: 'text-purple-400', bg: 'bg-purple-950/60', types: ['Saving Throw'] },
  { key: 'init',  label: 'INIT', color: 'text-yellow-400', bg: 'bg-yellow-950/60', types: ['Initiative'] },
  { key: 'hp',    label: 'HP',   color: 'text-emerald-400',bg: 'bg-emerald-950/60',types: ['HP Damage', 'HP Heal'] },
  { key: 'loot',  label: 'LOOT', color: 'text-amber-300',  bg: 'bg-amber-950/60',  types: ['Loot Claimed'] },
  { key: 'other', label: 'OTHER',color: 'text-slate-400',  bg: 'bg-slate-800/60',  types: ['Roll'] },
  { key: 'priv',  label: 'PRIV', color: 'text-fuchsia-400',bg: 'bg-fuchsia-950/60',types: ['__private__'] },
];

const MAX_FEED_SIZE = 100;

function getFilterKey(event: RollFeedEvent): string {
  if (event.isPrivate) return 'priv';
  const filter = FILTERS.find(f => f.types.includes(event.rollType));
  return filter?.key ?? 'other';
}

function formatRollBreakdown(event: RollFeedEvent): string {
  const dice = event.rolls.length > 1 ? `[${event.rolls.join('+')}]` : '';
  const mod = event.modifier !== 0 ? (event.modifier > 0 ? `+${event.modifier}` : `${event.modifier}`) : '';
  return `${dice}${mod}`.trim();
}

function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) || '?';
}

// Stable avatar colour per actor name
const AVATAR_COLORS = [
  'bg-red-800', 'bg-blue-800', 'bg-green-800', 'bg-amber-800',
  'bg-purple-800', 'bg-cyan-800', 'bg-rose-800', 'bg-indigo-800',
];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface DMRollFeedProps {
  /** Max height of the scroll area in pixels */
  maxHeight?: number;
}

export function DMRollFeed({ maxHeight = 320 }: DMRollFeedProps) {
  const { state } = useGame();
  const [events, setEvents] = useState<RollFeedEvent[]>([]);
  // Active filters = SHOWN types. Empty set = show all.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: RollFeedEvent) => {
      setEvents(prev => {
        const next = [...prev, event];
        return next.length > MAX_FEED_SIZE ? next.slice(next.length - MAX_FEED_SIZE) : next;
      });
    };
    socket.on('roll_feed_event', handler);
    return () => { socket.off('roll_feed_event', handler); };
  }, []);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const toggleHide = (key: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filtered = events.filter(e => !hidden.has(getFilterKey(e)));

  // Group events by actor for "run" display (same actor consecutive = collapsed header)
  const enriched = filtered.map((e, i) => ({
    ...e,
    showActor: i === 0 || filtered[i - 1].actor !== e.actor,
  }));

  return (
    <div className="space-y-2">
      {/* Filter bar */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className="h-3 w-3 text-muted-foreground/50 shrink-0" />
        {FILTERS.map(f => {
          const isHidden = hidden.has(f.key);
          return (
            <button
              key={f.key}
              onClick={() => toggleHide(f.key)}
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-all ${f.bg} ${f.color} border-current ${
                isHidden ? 'opacity-25 line-through' : 'opacity-100'
              }`}
            >
              {f.label}
            </button>
          );
        })}
        {hidden.size > 0 && (
          <button
            onClick={() => setHidden(new Set())}
            className="text-[9px] text-muted-foreground/50 hover:text-foreground px-1 transition-colors"
          >
            show all
          </button>
        )}
        <span className="ml-auto text-[9px] text-muted-foreground/30">{filtered.length}/{events.length}</span>
        {events.length > 0 && (
          <button
            onClick={() => setEvents([])}
            className="text-muted-foreground/30 hover:text-destructive/70 transition-colors"
            title="Clear feed"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Feed */}
      <ScrollArea style={{ maxHeight }} ref={scrollRef as any}>
        {events.length === 0 ? (
          <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground/30">
            <Activity className="h-6 w-6 opacity-30" />
            <p className="text-[10px] italic text-center">
              No rolls yet.<br />Player actions will appear here in real-time.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-6 text-center text-[10px] text-muted-foreground/30 italic">
            All roll types are hidden.
          </div>
        ) : (
          <div className="space-y-0.5 pr-1">
            {enriched.map(event => {
              const meta = getRollTypeMeta(event.rollType);
              const breakdown = formatRollBreakdown(event);
              const isCrit = event.rollType === 'Critical Damage';
              const isNat20 = event.sides === 20 && event.total - event.modifier === 20;
              const isNat1 = event.sides === 20 && event.total - event.modifier === 1;

              return (
                <div key={event.id}>
                  {/* Actor header — shown on first event in a run */}
                  {event.showActor && (
                    <div className="flex items-center gap-1.5 pt-2 pb-0.5 px-1">
                      <div className={`h-5 w-5 rounded-full ${avatarColor(event.actor)} flex items-center justify-center text-[8px] font-bold text-white shrink-0`}>
                        {getInitials(event.actor)}
                      </div>
                      <span className="text-[10px] font-semibold text-foreground/80">{event.actor}</span>
                      {event.isPrivate && (
                        <Lock className="h-2.5 w-2.5 text-fuchsia-400" title="Private roll" />
                      )}
                      <span className="text-[8px] text-muted-foreground/30 ml-auto">
                        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  )}

                  {/* Roll row */}
                  <div className={`flex items-center gap-2 px-2 py-1.5 rounded border text-[10px] ml-6 ${meta.bg} ${meta.border}`}>
                    {/* Type tag */}
                    <span className={`font-bold shrink-0 uppercase tracking-wide text-[8px] ${meta.color}`}>
                      {meta.label}
                    </span>

                    {/* Label / action name */}
                    <span className="text-foreground/70 flex-1 truncate min-w-0" title={event.label}>
                      {event.label}
                      {event.damageType && (
                        <span className="text-muted-foreground/50 ml-1">({event.damageType})</span>
                      )}
                    </span>

                    {/* Breakdown */}
                    {breakdown && (
                      <span className="text-muted-foreground/40 font-mono text-[8px] shrink-0">{breakdown}</span>
                    )}

                    {/* Total */}
                    <span className={`font-bold font-display text-sm shrink-0 min-w-[1.5rem] text-right ${
                      isCrit     ? 'text-red-300' :
                      isNat20    ? 'text-amber-300' :
                      isNat1     ? 'text-red-500' :
                      meta.color
                    }`}>
                      {event.total}
                    </span>

                    {/* Special badges */}
                    {isCrit && (
                      <Badge className="text-[7px] px-1 py-0 h-3.5 bg-red-700 border-0 text-white shrink-0">CRIT</Badge>
                    )}
                    {isNat20 && !isCrit && (
                      <Badge className="text-[7px] px-1 py-0 h-3.5 bg-amber-700 border-0 text-white shrink-0">NAT 20</Badge>
                    )}
                    {isNat1 && (
                      <Badge className="text-[7px] px-1 py-0 h-3.5 bg-red-900 border-0 text-red-300 shrink-0">NAT 1</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
