import { useState, useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import {
  Swords, SkipForward, SkipBack, StopCircle, Shield, Skull,
  Plus, ChevronUp, ChevronDown, Eye, EyeOff, Zap, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import socket from '../socket';
import { CombatReportModal } from './CombatReportModal';

// ─── Sorting Utility ─────────────────────────────────────────────────────────

interface Combatant {
  id: number;
  entity_name: string;
  entity_type: 'pc' | 'monster' | 'npc';
  initiative: number;
  current_hp: number;
  max_hp: number;
  ac: number;
  is_active: number;
  is_hidden: number;
  sort_order: number;
  character_id: number | null;
  instance_id: string | null;
  conditions: string[];
  concentrating_on: string | null;
  hp_status: string;
}

/**
 * Sort combatants descending by initiative score.
 * Ties preserve existing sort_order (stable sort) so DM can manually reorder.
 */
export function sortInitiative(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    return a.sort_order - b.sort_order; // tie-break by current order
  });
}

// ─── Inline Add Monster Form ─────────────────────────────────────────────────

function InlineSpawner({ onSpawn }: { onSpawn: (data: { name: string; hp: number; ac: number; initiative_mod: number; is_hidden: boolean }) => void }) {
  const [name, setName] = useState('');
  const [hp, setHp] = useState(10);
  const [ac, setAc] = useState(10);
  const [initMod, setInitMod] = useState(0);
  const [isHidden, setIsHidden] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSpawn({ name: name.trim(), hp, ac, initiative_mod: initMod, is_hidden: isHidden });
    setName('');
    setHp(10);
    setAc(10);
    setInitMod(0);
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-1.5 p-2 rounded-lg bg-secondary/20 border border-border/30">
      <div className="flex-1 min-w-0 space-y-0.5">
        <label className="text-[8px] uppercase tracking-wider text-muted-foreground/60 font-bold">Name</label>
        <Input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Goblin..."
          className="h-7 text-xs"
          required
        />
      </div>
      <div className="w-14 space-y-0.5">
        <label className="text-[8px] uppercase tracking-wider text-muted-foreground/60 font-bold">HP</label>
        <Input type="number" value={hp} onChange={e => setHp(parseInt(e.target.value) || 0)} className="h-7 text-xs text-center" />
      </div>
      <div className="w-12 space-y-0.5">
        <label className="text-[8px] uppercase tracking-wider text-muted-foreground/60 font-bold">AC</label>
        <Input type="number" value={ac} onChange={e => setAc(parseInt(e.target.value) || 0)} className="h-7 text-xs text-center" />
      </div>
      <div className="w-12 space-y-0.5">
        <label className="text-[8px] uppercase tracking-wider text-muted-foreground/60 font-bold">Init</label>
        <Input type="number" value={initMod} onChange={e => setInitMod(parseInt(e.target.value) || 0)} className="h-7 text-xs text-center" />
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setIsHidden(!isHidden)}
            className={`h-7 w-7 flex items-center justify-center rounded border shrink-0 transition-colors ${
              isHidden ? 'bg-violet-500/20 border-violet-500/40 text-violet-400' : 'bg-secondary/30 border-border/30 text-muted-foreground/40'
            }`}
          >
            {isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[10px]">
          {isHidden ? 'Hidden from players' : 'Visible to players'}
        </TooltipContent>
      </Tooltip>
      <Button type="submit" size="sm" className="h-7 px-2 shrink-0">
        <Plus className="h-3 w-3" />
      </Button>
    </form>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function InitiativeTracker() {
  const { state } = useGame();
  const tracker = (state.initiativeState || []) as Combatant[];
  const members = state.characters || [];
  const roundNumber = state.roundNumber || 1;
  const [showSpawner, setShowSpawner] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [reportData, setReportData] = useState<{
    report: string | null;
    events: Array<{ round: number; actor: string; action: string; target: string; detail: string }>;
    survivors: Array<{ name: string; type: string; hp: number; maxHp: number; conditions: string[] }>;
    totalRounds: number;
  } | null>(null);
  const [showReport, setShowReport] = useState(false);
  const activeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active combatant when turn changes
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [tracker.find(e => e.is_active)?.id]);

  const isCombatActive = tracker.length > 0;
  const activeEntity = tracker.find(e => e.is_active);
  const activeIndex = tracker.findIndex(e => e.is_active);

  const handleStartCombat = () => socket.emit('start_encounter', { encounterId: 1 });
  const handleEndCombat = () => {
    if (!confirm('End combat? An AI battle report will be generated.')) return;
    setIsEnding(true);
    socket.emit('end_encounter', (res: { success: boolean; error?: string; report?: string | null; events?: any[]; survivors?: any[]; totalRounds?: number }) => {
      setIsEnding(false);
      if (res.success) {
        setReportData({
          report: res.report ?? null,
          events: res.events ?? [],
          survivors: res.survivors ?? [],
          totalRounds: res.totalRounds ?? 0,
        });
        setShowReport(true);
        toast.success('Combat ended — report ready!');
      } else {
        toast.error('Error ending combat: ' + (res.error || 'Unknown'));
      }
    });
  };
  const handleNextTurn = () => socket.emit('next_turn');
  const handlePrevTurn = () => socket.emit('prev_turn');
  const handleSetInitiative = (trackerId: number, val: number) => socket.emit('set_initiative', { trackerId, initiative: val });
  const handleReorder = (trackerId: number, direction: 'up' | 'down') => socket.emit('reorder_initiative', { trackerId, direction });

  const handleSpawn = (data: { name: string; hp: number; ac: number; initiative_mod: number; is_hidden: boolean }) => {
    socket.emit('spawn_monster', data);
  };

  const handleHpDelta = (trackerId: number, delta: number) => {
    socket.emit('update_initiative_hp', { trackerId, delta });
  };

  // ── Empty State ──
  if (!isCombatActive) {
    return (
      <>
      <Card className="border-primary/20 bg-secondary/5">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Swords className="h-5 w-5 text-primary" />
              <span className="font-display text-lg">Combat Tracker</span>
            </div>
            <Button onClick={handleStartCombat} size="sm" className="font-display">
              <Swords className="h-4 w-4 mr-1" /> Start Combat
            </Button>
          </div>
          {/* Allow pre-spawning monsters before combat starts */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSpawner(v => !v)}
            className="w-full text-xs text-muted-foreground"
          >
            <Plus className="h-3 w-3 mr-1" /> Add Monster / NPC
          </Button>
          {showSpawner && <InlineSpawner onSpawn={handleSpawn} />}
        </CardContent>
      </Card>
      <CombatReportModal
        open={showReport}
        onClose={() => setShowReport(false)}
        data={reportData}
      />
      </>
    );
  }

  // ── Active Combat ──
  return (
    <Card className="border-primary/20 bg-secondary/5 overflow-hidden">
      {/* Header */}
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display flex items-center gap-2 text-primary">
            <Swords className="h-5 w-5" />
            Initiative
            <Badge variant="outline" className="text-[9px] ml-1 font-mono">
              R{roundNumber}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSpawner(v => !v)}
              className="h-7 px-2 text-[10px]"
              title="Add Monster/NPC"
            >
              <Plus className="h-3 w-3" />
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleEndCombat}
              disabled={isEnding}
              className="h-7 text-[10px] uppercase tracking-wider"
            >
              {isEnding
                ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Ending...</>
                : <><StopCircle className="h-3 w-3 mr-1" /> End</>
              }
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-1 pt-0">
        {/* Inline spawner */}
        {showSpawner && <InlineSpawner onSpawn={handleSpawn} />}

        {/* Combatant List */}
        <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
          {tracker.map((ent, i) => {
            const char = members.find(m => m.id === ent.character_id?.toString());
            const hp = ent.current_hp ?? char?.hp.current ?? 0;
            const maxHp = ent.max_hp ?? char?.hp.max ?? 1;
            const hpPercent = Math.max(0, (hp / maxHp) * 100);
            const isDead = hp <= 0;
            const conditions: string[] = ent.conditions ?? char?.conditions ?? [];
            const isActive = ent.is_active === 1;
            const isHidden = ent.is_hidden === 1;
            const isPC = ent.entity_type === 'pc';

            const hpColor = isDead
              ? 'text-muted-foreground'
              : hpPercent > 50 ? 'text-health' : hpPercent > 25 ? 'text-gold' : 'text-destructive';
            const barColor = isDead
              ? 'bg-muted-foreground/40'
              : hpPercent > 50 ? 'bg-health' : hpPercent > 25 ? 'bg-gold' : 'bg-destructive';

            return (
              <div
                key={ent.id}
                ref={isActive ? activeRef : undefined}
                className={`
                  group rounded-lg p-2 transition-all duration-300 border space-y-1.5 relative
                  ${isActive
                    ? 'bg-primary/15 border-primary/50 shadow-[0_0_20px_rgba(var(--primary),0.15)] scale-[1.01] ring-1 ring-primary/20'
                    : isDead
                      ? 'bg-secondary/5 border-transparent opacity-50'
                      : 'bg-secondary/10 border-transparent hover:border-border/30'
                  }
                  ${isHidden ? 'border-l-2 border-l-violet-500/50' : ''}
                `}
              >
                {/* Active turn indicator pulse */}
                {isActive && (
                  <div className="absolute inset-0 rounded-lg border-2 border-primary/30 animate-pulse pointer-events-none" />
                )}

                {/* Top row: position, initiative, name, badges, HP, AC */}
                <div className="flex items-center gap-2 relative z-10">
                  {/* Turn number */}
                  <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors ${
                    isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-muted-foreground'
                  }`}>
                    {isDead ? <Skull className="h-3 w-3" /> : i + 1}
                  </div>

                  {/* Initiative score (editable) */}
                  <div className="w-10 text-center">
                    <input
                      type="number"
                      value={ent.initiative}
                      onChange={e => handleSetInitiative(ent.id, parseInt(e.target.value) || 0)}
                      className={`w-full bg-transparent text-center text-xs font-bold focus:outline-none focus:ring-1 focus:ring-primary/30 rounded transition-colors ${
                        isActive ? 'text-primary' : 'text-foreground/70'
                      }`}
                      title="Initiative score"
                    />
                  </div>

                  {/* Name + type badge + conditions */}
                  <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                    <span className={`font-display text-sm truncate transition-colors ${
                      isActive ? 'text-primary font-semibold' : isDead ? 'line-through text-muted-foreground/50' : ''
                    }`}>
                      {ent.entity_name}
                    </span>
                    {!isPC && (
                      <Badge variant="outline" className="text-[7px] h-3 px-1 border-red-500/30 text-red-400">
                        {ent.entity_type === 'monster' ? 'MON' : 'NPC'}
                      </Badge>
                    )}
                    {isHidden && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <EyeOff className="h-3 w-3 text-violet-400/60" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[10px]">Hidden from players</TooltipContent>
                      </Tooltip>
                    )}
                    {ent.concentrating_on && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-violet-500/20 text-violet-400 border border-violet-500/30 leading-none cursor-default">
                            <Zap className="h-2 w-2 inline -mt-px mr-0.5" />
                            {ent.concentrating_on.length > 8 ? ent.concentrating_on.slice(0, 8) + '...' : ent.concentrating_on}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">Concentrating: {ent.concentrating_on}</TooltipContent>
                      </Tooltip>
                    )}
                    {conditions.map(cond => (
                      <Tooltip key={cond}>
                        <TooltipTrigger asChild>
                          <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 leading-none cursor-default">
                            {cond.slice(0, 3).toUpperCase()}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">{cond}</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>

                  {/* HP + AC */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[10px] font-bold tabular-nums ${hpColor}`}>
                      {hp}<span className="text-muted-foreground/50 font-normal">/{maxHp}</span>
                    </span>
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Shield className="h-2.5 w-2.5 text-mana" />{ent.ac ?? char?.ac}
                    </span>
                  </div>

                  {/* Reorder buttons (visible on hover) */}
                  <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => handleReorder(ent.id, 'up')}
                      className="h-3 w-4 flex items-center justify-center text-muted-foreground/40 hover:text-foreground transition-colors"
                      title="Move up (tie-break)"
                      disabled={i === 0}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleReorder(ent.id, 'down')}
                      className="h-3 w-4 flex items-center justify-center text-muted-foreground/40 hover:text-foreground transition-colors"
                      title="Move down (tie-break)"
                      disabled={i === tracker.length - 1}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* HP bar + quick damage/heal (monsters/NPCs) */}
                <div className="flex items-center gap-1.5 relative z-10">
                  <div className="flex-1 h-1.5 rounded-full bg-secondary/30 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
                      style={{ width: `${Math.max(0, hpPercent)}%` }}
                    />
                  </div>
                  {!isPC && (
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleHpDelta(ent.id, -1)}
                        className="w-5 h-4 flex items-center justify-center text-[8px] font-bold text-destructive bg-destructive/10 border border-destructive/20 rounded hover:bg-destructive/20 transition-colors"
                      >
                        -1
                      </button>
                      <button
                        onClick={() => handleHpDelta(ent.id, -5)}
                        className="w-5 h-4 flex items-center justify-center text-[8px] font-bold text-destructive bg-destructive/10 border border-destructive/20 rounded hover:bg-destructive/20 transition-colors"
                      >
                        -5
                      </button>
                      <button
                        onClick={() => handleHpDelta(ent.id, 5)}
                        className="w-5 h-4 flex items-center justify-center text-[8px] font-bold text-health bg-health/10 border border-health/20 rounded hover:bg-health/20 transition-colors"
                      >
                        +5
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Turn Controls */}
        <div className="pt-3 flex gap-2">
          <Button
            onClick={handlePrevTurn}
            variant="outline"
            className="flex-1 font-display h-9 border-primary/20 text-primary/70 hover:text-primary"
            size="sm"
          >
            <SkipBack className="h-4 w-4 mr-1" />
            Prev
          </Button>
          <Button
            onClick={handleNextTurn}
            className="flex-[2] font-display h-9"
            size="sm"
          >
            <SkipForward className="h-4 w-4 mr-2" />
            Next Turn
          </Button>
        </div>

        {/* Active entity callout */}
        {activeEntity && (
          <div className="text-center text-[10px] text-muted-foreground/50 pt-1">
            <span className="text-primary/70 font-semibold">{activeEntity.entity_name}</span>'s turn
            {activeIndex >= 0 && <span className="ml-1">({activeIndex + 1}/{tracker.length})</span>}
          </div>
        )}

        {/* Combat Report Modal */}
        <CombatReportModal
          open={showReport}
          onClose={() => setShowReport(false)}
          data={reportData}
        />
      </CardContent>
    </Card>
  );
}
