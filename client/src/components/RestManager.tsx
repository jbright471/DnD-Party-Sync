import { useState, useEffect, useCallback } from 'react';
import { Character, getAbilityModifier } from '../types/character';
import { backend } from '../integrations/backend';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import socket from '../socket';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from './ui/dialog';
import { Button } from './ui/button';
import { Moon, Sun, Dices, Heart, Shield, Sparkles } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface HitDieResult {
  dieType: string;
  roll: number;
  conMod: number;
  healAmount: number;
  healed: number;
  newHp: number;
  maxHp: number;
  remaining: number;
}

interface RestManagerProps {
  character: Character;
}

// ── Component ──────────────────────────────────────────────────────────────

export function RestManager({ character }: RestManagerProps) {
  const [mode, setMode] = useState<'pick' | 'short' | 'long'>('pick');
  const [open, setOpen] = useState(false);
  const [rollLog, setRollLog] = useState<HitDieResult[]>([]);
  const [isRolling, setIsRolling] = useState(false);

  const conMod = getAbilityModifier(character.abilityScores.CON);

  // Compute available hit dice
  const hitDiceEntries = Object.entries(character.hitDice || {}).map(([die, total]) => {
    const used = (character.hitDiceUsed || {})[die] || 0;
    return { die, total, used, remaining: total - used };
  }).filter(e => e.total > 0);

  const totalRemaining = hitDiceEntries.reduce((s, e) => s + e.remaining, 0);
  const totalDice = hitDiceEntries.reduce((s, e) => s + e.total, 0);

  // Listen for hit_die_result from server
  useEffect(() => {
    const handler = (result: HitDieResult) => {
      setRollLog(prev => [...prev, result]);
      setIsRolling(false);
      toast(`Hit Die: ${result.dieType}`, {
        description: `Rolled ${result.roll} + ${result.conMod} CON = ${result.healed} HP healed`,
      });
    };
    socket.on('hit_die_result', handler);
    return () => { socket.off('hit_die_result', handler); };
  }, []);

  // Reset state when dialog opens/closes
  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setMode('pick');
      setRollLog([]);
      setIsRolling(false);
    }
  }, []);

  const handleSpendDie = (dieType: string) => {
    setIsRolling(true);
    backend.spendHitDie(character.id, dieType);
  };

  const handleFinishShortRest = () => {
    backend.shortRest(character.id);
    toast.success(`${character.name} completed a short rest`);
    handleOpenChange(false);
  };

  const handleLongRest = () => {
    backend.longRest(character.id);
    toast.success(`${character.name} completed a long rest`);
    handleOpenChange(false);
  };

  // Compute long rest summary
  const hpToRestore = character.hp.max - character.hp.current;
  const usedDiceCount = Object.values(character.hitDiceUsed || {}).reduce((s, n) => s + n, 0);
  const recoverableDice = Math.max(Math.floor(totalDice / 2), 1);
  const actualRecover = Math.min(recoverableDice, usedDiceCount);

  // Spell slots used
  const slotsUsedCount = Object.values(character.spellSlots || {}).reduce((sum, slot: any) => {
    return sum + (slot?.used || 0);
  }, 0);

  const totalRollHealed = rollLog.reduce((s, r) => s + r.healed, 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-emerald-700/40 text-emerald-400 hover:bg-emerald-950/30 hover:border-emerald-500/60 h-8"
        >
          <Moon className="h-3.5 w-3.5 mr-1.5" />
          Rest
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[420px] border-border/70 bg-card shadow-2xl shadow-black/70">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider text-lg">
            {mode === 'pick' && 'Take a Rest'}
            {mode === 'short' && 'Short Rest'}
            {mode === 'long' && 'Long Rest'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            {mode === 'pick' && 'Choose your rest type to recover resources.'}
            {mode === 'short' && 'Spend hit dice to recover HP. Features with short rest recharge will reset.'}
            {mode === 'long' && 'Confirm your long rest to fully restore HP and resources.'}
          </DialogDescription>
        </DialogHeader>

        {/* ── Mode Picker ──────────────────────────────────────── */}
        {mode === 'pick' && (
          <div className="grid grid-cols-2 gap-3 py-2">
            <button
              onClick={() => setMode('short')}
              className={cn(
                'flex flex-col items-center gap-2 p-4 rounded-lg border',
                'border-amber-700/40 bg-amber-950/20 hover:bg-amber-950/40 hover:border-amber-500/60',
                'transition-all duration-150 cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              )}
            >
              <Sun className="h-6 w-6 text-amber-400" />
              <span className="font-display text-sm text-amber-300 tracking-wide">Short Rest</span>
              <span className="text-[10px] text-muted-foreground text-center leading-tight">
                1 hour &middot; Spend hit dice
              </span>
            </button>
            <button
              onClick={() => setMode('long')}
              className={cn(
                'flex flex-col items-center gap-2 p-4 rounded-lg border',
                'border-indigo-700/40 bg-indigo-950/20 hover:bg-indigo-950/40 hover:border-indigo-500/60',
                'transition-all duration-150 cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              )}
            >
              <Moon className="h-6 w-6 text-indigo-400" />
              <span className="font-display text-sm text-indigo-300 tracking-wide">Long Rest</span>
              <span className="text-[10px] text-muted-foreground text-center leading-tight">
                8 hours &middot; Full restore
              </span>
            </button>
          </div>
        )}

        {/* ── Short Rest: Hit Die Roller ──────────────────────── */}
        {mode === 'short' && (
          <div className="space-y-4 py-1">
            {/* Current HP */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/30 border border-border/30">
              <Heart className="h-4 w-4 text-destructive" />
              <span className="text-sm font-display">
                {character.hp.current}
                <span className="text-muted-foreground">/{character.hp.max} HP</span>
              </span>
              {totalRollHealed > 0 && (
                <span className="text-xs text-health ml-auto font-display">+{totalRollHealed} healed</span>
              )}
            </div>

            {/* Hit Dice Pool */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">
                  Hit Dice Available
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  CON modifier: <span className={cn('font-bold', conMod >= 0 ? 'text-health' : 'text-destructive')}>
                    {conMod >= 0 ? '+' : ''}{conMod}
                  </span>
                </span>
              </div>

              {hitDiceEntries.length === 0 && (
                <p className="text-xs text-muted-foreground/50 italic text-center py-3">
                  No hit dice data — sync from D&D Beyond to populate.
                </p>
              )}

              {hitDiceEntries.map(({ die, total, remaining }) => (
                <div
                  key={die}
                  className="flex items-center justify-between px-3 py-2.5 rounded-md border border-border/40 bg-secondary/20"
                >
                  <div className="flex items-center gap-2">
                    <Dices className="h-4 w-4 text-primary/70" />
                    <span className="font-display text-sm">{die}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {remaining}/{total} remaining
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={remaining <= 0 || isRolling || character.hp.current >= character.hp.max}
                    onClick={() => handleSpendDie(die)}
                    className={cn(
                      'h-7 text-[11px] font-display',
                      remaining > 0 && character.hp.current < character.hp.max
                        ? 'border-health/40 text-health hover:bg-health/10 hover:border-health/60'
                        : '',
                    )}
                  >
                    {isRolling ? (
                      <Dices className="h-3 w-3 animate-spin" />
                    ) : (
                      <>Roll {die}</>
                    )}
                  </Button>
                </div>
              ))}
            </div>

            {/* Roll Log */}
            {rollLog.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">
                  Rolls
                </span>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {rollLog.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded bg-secondary/30 text-xs"
                    >
                      <span className="font-display text-muted-foreground">{r.dieType}</span>
                      <span>
                        <span className="text-primary font-bold">[{r.roll}]</span>
                        <span className="text-muted-foreground mx-1">+</span>
                        <span className={cn(r.conMod >= 0 ? 'text-health' : 'text-destructive')}>
                          {r.conMod >= 0 ? '+' : ''}{r.conMod}
                        </span>
                        <span className="text-muted-foreground mx-1">=</span>
                        <span className="text-health font-bold">+{r.healed} HP</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Finish button */}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" size="sm" onClick={() => setMode('pick')}>
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleFinishShortRest}
                className="bg-amber-700/80 hover:bg-amber-600/80 text-white"
              >
                <Sun className="h-3.5 w-3.5 mr-1.5" />
                Finish Short Rest
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Long Rest: Confirmation ─────────────────────────── */}
        {mode === 'long' && (
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">
                Restoration Summary
              </span>

              <div className="space-y-1.5">
                {/* HP */}
                <div className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/20 border border-border/30">
                  <div className="flex items-center gap-2">
                    <Heart className="h-3.5 w-3.5 text-health" />
                    <span className="text-xs">Hit Points</span>
                  </div>
                  <span className="text-xs font-display">
                    {hpToRestore > 0 ? (
                      <span className="text-health">+{hpToRestore} HP &rarr; {character.hp.max}/{character.hp.max}</span>
                    ) : (
                      <span className="text-muted-foreground">Already full</span>
                    )}
                  </span>
                </div>

                {/* Hit Dice */}
                <div className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/20 border border-border/30">
                  <div className="flex items-center gap-2">
                    <Dices className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs">Hit Dice</span>
                  </div>
                  <span className="text-xs font-display">
                    {actualRecover > 0 ? (
                      <span className="text-primary">Recover {actualRecover} of {totalDice}</span>
                    ) : (
                      <span className="text-muted-foreground">None spent</span>
                    )}
                  </span>
                </div>

                {/* Spell Slots */}
                <div className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/20 border border-border/30">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                    <span className="text-xs">Spell Slots</span>
                  </div>
                  <span className="text-xs font-display">
                    {slotsUsedCount > 0 ? (
                      <span className="text-violet-400">Restore all</span>
                    ) : (
                      <span className="text-muted-foreground">All available</span>
                    )}
                  </span>
                </div>

                {/* Features */}
                <div className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/20 border border-border/30">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-xs">Features & Abilities</span>
                  </div>
                  <span className="text-xs font-display text-amber-400">Reset all</span>
                </div>

                {/* Temp HP */}
                {character.hp.temp > 0 && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/20 border border-border/30">
                    <div className="flex items-center gap-2">
                      <Heart className="h-3.5 w-3.5 text-cyan-400" />
                      <span className="text-xs">Temp HP</span>
                    </div>
                    <span className="text-xs font-display text-muted-foreground">
                      {character.hp.temp} &rarr; 0
                    </span>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" size="sm" onClick={() => setMode('pick')}>
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleLongRest}
                className="bg-indigo-700/80 hover:bg-indigo-600/80 text-white"
              >
                <Moon className="h-3.5 w-3.5 mr-1.5" />
                Confirm Long Rest
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
