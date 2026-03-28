import { useState, useMemo } from 'react';
import { GitCompareArrows, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useGame } from '../context/GameContext';
import { EffectEvent } from '../types/effects';

interface CharacterRoundDiff {
  targetId: number | null;
  targetName: string;
  damageTaken: number;
  healReceived: number;
  conditionsGained: string[];
  conditionsLost: string[];
  buffsGained: string[];
  autoCount: number;
}

function computeDiff(events: EffectEvent[], round: number): CharacterRoundDiff[] {
  const roundEvents = events.filter(e => e.session_round === round);
  const byTarget = new Map<string, CharacterRoundDiff>();

  const key = (e: EffectEvent) => `${e.target_type}:${e.target_id ?? 'sys'}`;

  for (const e of roundEvents) {
    const k = key(e);
    if (!byTarget.has(k)) {
      byTarget.set(k, {
        targetId: e.target_id,
        targetName: e.target_name ?? e.actor,
        damageTaken: 0,
        healReceived: 0,
        conditionsGained: [],
        conditionsLost: [],
        buffsGained: [],
        autoCount: 0,
      });
    }
    const diff = byTarget.get(k)!;

    try {
      const p = JSON.parse(e.payload_json || '{}');
      switch (e.event_type) {
        case 'damage':
          diff.damageTaken += p.value ?? 0;
          break;
        case 'heal':
          diff.healReceived += p.value ?? 0;
          break;
        case 'condition_applied':
          if (p.condition && !diff.conditionsGained.includes(p.condition)) diff.conditionsGained.push(p.condition);
          break;
        case 'condition_removed':
          if (p.condition && !diff.conditionsLost.includes(p.condition)) diff.conditionsLost.push(p.condition);
          break;
        case 'buff_applied': {
          const buffName = p.buffData?.name ?? p.name ?? 'Buff';
          if (!diff.buffsGained.includes(buffName)) diff.buffsGained.push(buffName);
          break;
        }
        case 'automation_trigger':
          diff.autoCount++;
          break;
      }
    } catch {
      // malformed payload — skip
    }
  }

  // Filter out system/automation-only rows with no HP/condition data
  return [...byTarget.values()].filter(
    d => d.target_type !== 'system' &&
         (d.damageTaken > 0 || d.healReceived > 0 || d.conditionsGained.length > 0 ||
          d.conditionsLost.length > 0 || d.buffsGained.length > 0)
  );
}

export function EffectDiffEngine() {
  const { state } = useGame();
  const { effectEvents } = state;
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);

  const rounds = useMemo(() => {
    const set = new Set<number>();
    for (const e of effectEvents) if (e.session_round > 0) set.add(e.session_round);
    return [...set].sort((a, b) => a - b);
  }, [effectEvents]);

  const activeRound = selectedRound ?? rounds[rounds.length - 1] ?? null;

  const diff = useMemo(
    () => (activeRound !== null ? computeDiff(effectEvents, activeRound) : []),
    [effectEvents, activeRound]
  );

  const totalDmg = diff.reduce((s, d) => s + d.damageTaken, 0);
  const totalHeal = diff.reduce((s, d) => s + d.healReceived, 0);

  return (
    <Card className="border-primary/20 bg-secondary/5">
      <CardHeader
        className="pb-2 cursor-pointer select-none"
        onClick={() => setIsExpanded(v => !v)}
      >
        <CardTitle className="font-display flex items-center gap-2 text-sm">
          <GitCompareArrows className="h-4 w-4 text-primary" />
          Round Diff
          {rounds.length > 0 && (
            <Badge variant="outline" className="text-[9px] ml-1">{rounds.length} rounds</Badge>
          )}
          <span className="ml-auto text-muted-foreground">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </CardTitle>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 space-y-3">
          {rounds.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground/40 italic text-xs">
              <GitCompareArrows className="h-6 w-6 mx-auto mb-2 opacity-30" />
              No combat rounds recorded yet.
            </div>
          ) : (
            <>
              {/* Round selector */}
              <div className="flex flex-wrap gap-1">
                {rounds.map(r => (
                  <button
                    key={r}
                    onClick={() => setSelectedRound(r)}
                    className={`text-[9px] font-bold px-2 py-0.5 rounded border transition-all ${
                      r === activeRound
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    }`}
                  >
                    R{r}
                  </button>
                ))}
              </div>

              {/* Summary bar */}
              {activeRound !== null && (
                <div className="flex items-center gap-3 text-[10px] px-1">
                  <span className="font-bold text-primary/60 uppercase tracking-widest">Round {activeRound}</span>
                  {totalDmg > 0 && (
                    <span className="text-red-400 font-bold">-{totalDmg} HP dealt</span>
                  )}
                  {totalHeal > 0 && (
                    <span className="text-green-400 font-bold">+{totalHeal} HP healed</span>
                  )}
                </div>
              )}

              {/* Per-character rows */}
              {diff.length === 0 ? (
                <div className="text-xs text-muted-foreground/40 italic text-center py-2">
                  No HP/condition events in Round {activeRound}.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {diff.map((d, i) => {
                    const netHp = d.healReceived - d.damageTaken;
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-2 px-2 py-1.5 rounded border border-border/30 bg-secondary/10 text-xs"
                      >
                        {/* Name */}
                        <span className="font-semibold font-display truncate flex-1 min-w-0">{d.targetName}</span>

                        {/* Net HP */}
                        {(d.damageTaken > 0 || d.healReceived > 0) && (
                          <span className={`font-bold font-mono shrink-0 tabular-nums ${
                            netHp < 0 ? 'text-red-400' : netHp > 0 ? 'text-green-400' : 'text-muted-foreground'
                          }`}>
                            {netHp > 0 ? '+' : ''}{netHp} HP
                          </span>
                        )}

                        {/* Condition / buff pills */}
                        <div className="flex flex-wrap gap-0.5 shrink-0">
                          {d.conditionsGained.map(c => (
                            <span key={c} className="text-[7px] font-bold px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              +{c.slice(0, 3).toUpperCase()}
                            </span>
                          ))}
                          {d.conditionsLost.map(c => (
                            <span key={c} className="text-[7px] font-bold px-1 py-0.5 rounded bg-slate-500/20 text-slate-400 border border-slate-500/30">
                              -{c.slice(0, 3).toUpperCase()}
                            </span>
                          ))}
                          {d.buffsGained.map(b => (
                            <span key={b} className="text-[7px] font-bold px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                              {b.slice(0, 4).toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
