import { useState, useEffect, useRef } from 'react';
import { Activity, ChevronRight, X, Zap, Filter } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { useGame } from '../context/GameContext';
import { EffectEvent, EVENT_META, getEventSummary, groupByRound } from '../types/effects';

interface EffectStreamProps {
  /** If provided, pre-filter to this character's events (player view). Undefined = show all (DM view). */
  currentCharacterId?: string;
}

const FILTERABLE_TYPES = [
  'damage', 'heal', 'condition_applied', 'condition_removed',
  'buff_applied', 'concentration_check', 'concentration_broken', 'automation_trigger',
] as const;

export function EffectStream({ currentCharacterId }: EffectStreamProps) {
  const { state } = useGame();
  const { effectEvents, isDm } = state;

  const [isOpen, setIsOpen] = useState(false);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [unseenCount, setUnseenCount] = useState(0);
  const lastSeenIdRef = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Count unseen events when drawer is closed
  useEffect(() => {
    if (!isOpen && effectEvents.length > 0) {
      const newest = effectEvents[effectEvents.length - 1];
      if (newest.id > lastSeenIdRef.current) {
        setUnseenCount(effectEvents.filter(e => e.id > lastSeenIdRef.current).length);
      }
    }
  }, [effectEvents, isOpen]);

  // Clear unseen count when opening
  const handleOpen = () => {
    setIsOpen(true);
    setUnseenCount(0);
    if (effectEvents.length > 0) {
      lastSeenIdRef.current = effectEvents[effectEvents.length - 1].id;
    }
  };

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [effectEvents, isOpen]);

  const toggleType = (type: string) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Filter by character (player view) + active type filters
  const filtered = effectEvents.filter(event => {
    if (!isDm && currentCharacterId) {
      const charId = parseInt(currentCharacterId);
      const isOwnEvent = event.target_id === charId && event.target_type === 'character';
      const isPartyWide = event.target_type === 'system' || event.event_type === 'automation_trigger';
      if (!isOwnEvent && !isPartyWide) return false;
    }
    if (activeTypes.size > 0 && !activeTypes.has(event.event_type)) return false;
    return true;
  });

  const grouped = groupByRound(filtered);
  const rounds = [...grouped.keys()].sort((a, b) => a - b);

  return (
    <>
      {/* Drawer Tab — anchored left-center */}
      <button
        onClick={isOpen ? () => setIsOpen(false) : handleOpen}
        aria-label="Toggle Effect Stream"
        className="fixed left-0 top-1/2 -translate-y-1/2 z-[90] flex flex-col items-center justify-center gap-1 bg-card border border-l-0 border-primary/30 rounded-r-lg px-1.5 py-3 shadow-lg shadow-black/40 hover:border-primary/60 hover:bg-secondary/30 transition-all duration-200 group"
      >
        <Activity className="h-4 w-4 text-primary" />
        {unseenCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-[9px] font-bold flex items-center justify-center text-white">
            {unseenCount > 9 ? '9+' : unseenCount}
          </span>
        )}
        <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Drawer Panel */}
      <div
        className={`fixed left-0 top-0 h-full w-[300px] bg-card border-r border-border shadow-2xl shadow-black/60 z-[89] flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-secondary/20 shrink-0">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="font-display text-sm font-bold">Effect Stream</span>
            <Badge variant="outline" className="text-[9px] h-4 px-1">{filtered.length}</Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Type Filters */}
        <div className="px-2 py-2 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-1 mb-1.5">
            <Filter className="h-3 w-3 text-muted-foreground/50" />
            <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Filter</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERABLE_TYPES.map(type => {
              const meta = EVENT_META[type] || EVENT_META.unknown;
              const active = activeTypes.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={`text-[8px] font-bold px-1.5 py-0.5 rounded border transition-all ${meta.bg} ${meta.color} ${
                    active ? 'opacity-100 ring-1 ring-current scale-105' : 'opacity-40 hover:opacity-80'
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
            {activeTypes.size > 0 && (
              <button
                onClick={() => setActiveTypes(new Set())}
                className="text-[8px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                clear
              </button>
            )}
          </div>
        </div>

        {/* Stream */}
        <ScrollArea className="flex-1" ref={scrollRef as any}>
          {effectEvents.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground/30 italic text-xs flex flex-col items-center gap-2">
              <Activity className="h-8 w-8 opacity-20" />
              <span>No effects yet.<br />Start combat to see the stream.</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground/30 italic text-xs">
              No events match the filter.
            </div>
          ) : (
            <div className="p-2 space-y-3">
              {rounds.map(round => (
                <div key={round}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-[9px] font-bold text-primary/50 uppercase tracking-widest">
                      {round === 0 ? 'Pre-Combat' : `Round ${round}`}
                    </div>
                    <div className="flex-1 h-px bg-primary/10" />
                    <span className="text-[8px] text-muted-foreground/30">{grouped.get(round)!.length}</span>
                  </div>
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
                          {isChild && <span className="text-muted-foreground/30 mt-0.5 shrink-0">↳</span>}
                          <span className={`font-bold shrink-0 uppercase tracking-wide ${meta.color}`}>
                            {meta.label}
                          </span>
                          <span className="text-foreground/70 flex-1 leading-tight min-w-0 break-words">
                            {getEventSummary(event)}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {isAuto && <Zap className="h-2.5 w-2.5 text-orange-400" title="Automation" />}
                            <span className="text-muted-foreground/30 font-mono text-[8px]">T{event.turn_index}</span>
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

        {/* Footer — player label when in filtered mode */}
        {!isDm && currentCharacterId && (
          <div className="px-3 py-1.5 border-t border-border/50 bg-secondary/10 shrink-0">
            <span className="text-[9px] text-muted-foreground/40 italic">Showing your effects + party-wide events</span>
          </div>
        )}
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[88] bg-black/20"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
