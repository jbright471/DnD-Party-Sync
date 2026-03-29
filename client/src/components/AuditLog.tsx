import { useState, useEffect, useRef } from 'react';
import { ScrollText, ChevronDown, ChevronUp, Undo2, Zap, Filter } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import socket from '../socket';
import { useGame } from '../context/GameContext';
import { EffectEvent, EVENT_META, getEventSummary, groupByRound } from '../types/effects';

const FILTER_CATEGORIES = [
  { key: 'combat', label: 'Combat', types: ['damage', 'heal', 'temp_hp'] },
  { key: 'conditions', label: 'Status', types: ['condition_applied', 'condition_removed', 'buff_applied', 'buff_removed'] },
  { key: 'concentration', label: 'Conc.', types: ['concentration_start', 'concentration_dropped', 'concentration_check', 'concentration_broken'] },
  { key: 'resources', label: 'Resources', types: ['spell_slot_used', 'loot_claimed', 'rest'] },
  { key: 'automation', label: 'Auto', types: ['automation_trigger'] },
] as const;

interface AuditLogProps {
  isDm?: boolean;
}

export function AuditLog({ isDm = false }: AuditLogProps) {
  const { state } = useGame();
  const events = state.effectEvents;
  const [isExpanded, setIsExpanded] = useState(false);
  const [textFilter, setTextFilter] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, isExpanded]);

  const categoryTypes = activeCategory
    ? FILTER_CATEGORIES.find(c => c.key === activeCategory)?.types ?? []
    : [];

  const filtered = events.filter(e => {
    if (e.is_reversed && !isDm) return false;
    if (activeCategory && !categoryTypes.includes(e.event_type)) return false;
    if (textFilter.trim()) {
      const q = textFilter.toLowerCase();
      return (
        (e.target_name?.toLowerCase().includes(q)) ||
        e.actor.toLowerCase().includes(q) ||
        e.event_type.includes(q) ||
        (e.description?.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const grouped = groupByRound(filtered);
  const rounds = [...grouped.keys()].sort((a, b) => a - b);

  const handleReverse = (eventId: number) => {
    socket.emit('reverse_event', { eventId });
  };

  return (
    <Card className="border-primary/20 bg-secondary/5">
      <CardHeader
        className="pb-2 cursor-pointer select-none"
        onClick={() => setIsExpanded(v => !v)}
      >
        <CardTitle className="font-display flex items-center gap-2 text-sm">
          <ScrollText className="h-4 w-4 text-primary" />
          Audit Log
          <Badge variant="outline" className="text-[9px] ml-1">{events.length}</Badge>
          <span className="ml-auto text-muted-foreground">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </CardTitle>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 space-y-2">
          {/* Filter bar */}
          <div className="flex items-center gap-2">
            <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={textFilter}
              onChange={e => setTextFilter(e.target.value)}
              placeholder="Search events..."
              className="flex-1 h-7 rounded-md border border-input bg-background/50 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Category filter chips */}
          <div className="flex flex-wrap gap-1.5">
            {FILTER_CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(a => a === cat.key ? null : cat.key)}
                className={`text-[9px] font-semibold px-2 py-0.5 rounded border transition-all
                  ${activeCategory === cat.key
                    ? 'bg-primary/20 border-primary/40 text-primary ring-1 ring-primary/30'
                    : 'bg-secondary/20 border-border/40 text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Event list */}
          <ScrollArea className="h-72" ref={scrollRef as any}>
            {events.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground/40 italic text-xs">
                <ScrollText className="h-8 w-8 mx-auto mb-2 opacity-30" />
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
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-[9px] font-bold text-primary/60 uppercase tracking-widest">
                        {round === 0 ? 'Out of Combat' : `Round ${round}`}
                      </div>
                      <div className="flex-1 h-px bg-primary/10" />
                      <span className="text-[8px] text-muted-foreground/40">{grouped.get(round)!.length}</span>
                    </div>

                    <div className="space-y-0.5">
                      {grouped.get(round)!.map(event => {
                        const meta = EVENT_META[event.event_type] || EVENT_META.unknown;
                        const isChild = event.parent_event_id !== null;
                        const isAuto = event.source_preset_id !== null || event.event_type === 'automation_trigger';
                        const isReversed = !!event.is_reversed;
                        const canReverse = isDm && !isReversed && ['damage', 'heal', 'condition_applied', 'condition_removed'].includes(event.event_type);

                        return (
                          <div
                            key={event.id}
                            className={`group flex items-start gap-1.5 px-2 py-1 rounded border text-[10px] ${meta.bg} ${isChild ? 'ml-3' : ''} ${isReversed ? 'opacity-40 line-through' : ''}`}
                          >
                            {isChild && (
                              <span className="text-muted-foreground/30 mt-0.5 shrink-0">↳</span>
                            )}
                            <span className={`font-bold shrink-0 uppercase tracking-wide ${meta.color}`}>
                              {meta.label}
                            </span>
                            <span className="text-foreground/70 flex-1 leading-tight">
                              {getEventSummary(event)}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              {isAuto && (
                                <Zap className="h-2.5 w-2.5 text-orange-400" title="Automation" />
                              )}
                              {canReverse && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => handleReverse(event.id)}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/20"
                                    >
                                      <Undo2 className="h-2.5 w-2.5 text-amber-400" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="text-[10px]">
                                    Undo this event
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <span className="text-muted-foreground/40 font-mono text-[8px]">
                                {event.actor.length > 12 ? event.actor.slice(0, 12) + '...' : event.actor}
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
