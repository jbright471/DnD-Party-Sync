import { rollDice, type AbilityScore } from '../types/character';
import socket from '../socket';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { Dices, AlertTriangle, ChevronUp, ChevronDown, Ban } from 'lucide-react';
import {
  evaluateRoll,
  rollWithAdvantage,
  getRollIndicator,
  type ActionType,
  type RollIndicator,
} from '../lib/rollInterceptor';

export interface StatRollResult {
  rollType: string;
  label: string;
  modifier: number;
  roll: number;
  total: number;
}

interface RollableStatProps {
  /** Display name — "Stealth", "Strength", "Dexterity Saving Throw", etc. */
  label: string;
  /** Pre-computed modifier (+4, -1, …) */
  modifier: number;
  /** Log context shown in the effect stream */
  rollType: string;
  characterName?: string;
  /** Short ability abbreviation shown alongside the label (e.g. "DEX") */
  sublabel?: string;
  /** Raw ability score rendered inside card variant */
  score?: number;
  /** Filled dot = proficient */
  proficient?: boolean;
  /** card = large ability-score block, row = compact skill/save row */
  variant?: 'card' | 'row';
  className?: string;
  onRoll?: (result: StatRollResult) => void;
  /** Active conditions on this character — drives advantage/disadvantage */
  conditions?: string[];
  /** The ability score key for this roll (e.g. 'DEX', 'STR') */
  ability?: AbilityScore;
}

/** Map user-facing rollType strings to ActionType for the interceptor */
function toActionType(rollType: string): ActionType {
  const rt = rollType.toLowerCase();
  if (rt.includes('attack')) return 'attack';
  if (rt.includes('saving throw') || rt.includes('save')) return 'saving_throw';
  if (rt.includes('initiative')) return 'initiative';
  return 'ability_check';
}

export function RollableStat({
  label,
  modifier,
  rollType,
  characterName = 'Unknown',
  sublabel,
  score,
  proficient = false,
  variant = 'card',
  className,
  onRoll,
  conditions = [],
  ability,
}: RollableStatProps) {
  const actionType = toActionType(rollType);
  const indicator = conditions.length > 0
    ? getRollIndicator(conditions, actionType, ability)
    : null;

  const handleClick = () => {
    const mod = evaluateRoll(conditions, actionType, ability);

    // Auto-fail: emit a 0 total with explanation
    if (mod.autoFail) {
      const reason = mod.reasons.join('; ');
      socket.emit('dice_roll', {
        actor: characterName,
        sides: 20,
        count: 1,
        modifier,
        total: 0,
        rolls: [0],
        label,
        rollType,
        conditionFlags: { autoFail: true, reasons: mod.reasons },
      });
      toast.error(`Auto-Fail: ${label}`, {
        description: reason,
        duration: 4000,
      });
      onRoll?.({ rollType, label, modifier, roll: 0, total: 0 });
      return;
    }

    // Roll with advantage/disadvantage evaluation
    const rollOnce = () => Math.floor(Math.random() * 20) + 1;
    const { chosen, all, isAdvantage, isDisadvantage } = rollWithAdvantage(rollOnce, mod.advantage);
    const total = chosen + modifier;
    const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;

    // Build reason string for the effect stream
    const reasonTag = mod.reasons.length > 0
      ? ` (${isAdvantage ? 'Advantage' : 'Disadvantage'}: ${mod.reasons.map(r => r.split(':')[0]).join(', ')})`
      : '';

    socket.emit('dice_roll', {
      actor: characterName,
      sides: 20,
      count: isAdvantage || isDisadvantage ? 2 : 1,
      modifier,
      total,
      rolls: isAdvantage || isDisadvantage ? [all[0], all[1]] : [chosen],
      label: `${label}${reasonTag}`,
      rollType,
      conditionFlags: mod.reasons.length > 0
        ? { advantage: mod.advantage, reasons: mod.reasons }
        : undefined,
    });

    // Toast shows both dice when advantage/disadvantage applies
    const diceStr = isAdvantage || isDisadvantage
      ? `[${all[0]}, ${all[1]}] → ${chosen}`
      : `[${chosen}]`;

    if (isAdvantage) {
      toast.success(`${rollType}: ${label} (Advantage)`, {
        description: `${diceStr} ${modStr} = ${total}`,
        duration: 3500,
      });
    } else if (isDisadvantage) {
      toast.warning(`${rollType}: ${label} (Disadvantage)`, {
        description: `${diceStr} ${modStr} = ${total}`,
        duration: 3500,
      });
    } else {
      toast(`${rollType}: ${label}`, {
        description: `${diceStr} ${modStr} = ${total}`,
        duration: 3000,
      });
    }

    onRoll?.({ rollType, label, modifier, roll: chosen, total });
  };

  const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;

  /* ── Row layout: used for Skills and Saving Throws ── */
  if (variant === 'row') {
    return (
      <button
        onClick={handleClick}
        className={cn(
          'group w-full flex items-center gap-2 px-2 py-1 rounded-md text-left',
          'border border-transparent hover:bg-primary/10 hover:border-primary/20',
          'transition-colors duration-100 cursor-pointer',
          indicator === 'disadvantage' && 'border-destructive/20 bg-destructive/5',
          indicator === 'advantage' && 'border-emerald-500/20 bg-emerald-500/5',
          indicator === 'auto-fail' && 'border-destructive/30 bg-destructive/10 opacity-60',
          indicator === 'incapacitated' && 'border-destructive/30 bg-destructive/10 opacity-40 cursor-not-allowed',
          className,
        )}
        title={indicatorTitle(indicator, rollType, label, modStr)}
        aria-label={`Roll ${label} ${rollType}`}
        disabled={indicator === 'incapacitated'}
      >
        {/* Proficiency indicator */}
        <span
          className={cn(
            'w-2 h-2 rounded-full border shrink-0',
            proficient ? 'bg-primary border-primary' : 'border-muted-foreground/50',
          )}
        />
        {/* Ability abbreviation */}
        {sublabel && (
          <span className="text-[10px] text-muted-foreground w-7 shrink-0 font-display">{sublabel}</span>
        )}
        {/* Skill / save name */}
        <span className="text-sm flex-1 group-hover:text-foreground transition-colors">{label}</span>
        {/* Condition indicator icon */}
        <IndicatorIcon indicator={indicator} />
        {/* Modifier */}
        <span className="text-sm font-display font-bold tabular-nums">{modStr}</span>
        {/* Dice icon — appears on hover */}
        <Dices className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-70 transition-opacity shrink-0" />
      </button>
    );
  }

  /* ── Card layout: used for Ability Scores and Initiative ── */
  return (
    <button
      onClick={handleClick}
      className={cn(
        'group bg-secondary/30 rounded-lg p-3 text-center border border-border w-full relative',
        'hover:bg-primary/10 hover:border-primary/40',
        'transition-colors duration-100 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        indicator === 'disadvantage' && 'border-destructive/30 bg-destructive/5',
        indicator === 'advantage' && 'border-emerald-500/30 bg-emerald-500/5',
        indicator === 'auto-fail' && 'border-destructive/40 bg-destructive/10 opacity-60',
        indicator === 'incapacitated' && 'border-destructive/40 bg-destructive/10 opacity-40 cursor-not-allowed',
        className,
      )}
      title={indicatorTitle(indicator, rollType, label, modStr)}
      aria-label={`Roll ${label}`}
      disabled={indicator === 'incapacitated'}
    >
      {/* Condition badge in top-right corner */}
      {indicator && (
        <span className="absolute top-1 right-1">
          <IndicatorIcon indicator={indicator} />
        </span>
      )}
      {sublabel ? (
        <>
          <div className="text-[10px] text-muted-foreground font-display tracking-widest uppercase">{sublabel}</div>
          <div className="text-xs text-muted-foreground font-display mt-0.5">{label}</div>
        </>
      ) : (
        <div className="text-xs text-muted-foreground font-display tracking-wider">{label}</div>
      )}
      {score !== undefined && (
        <div className="text-2xl font-display font-bold mt-1 group-hover:text-primary transition-colors">
          {score}
        </div>
      )}
      <div className="text-sm text-primary font-display font-bold">{modStr}</div>
      <div className="text-[9px] text-transparent group-hover:text-muted-foreground/60 transition-colors mt-0.5">
        <Dices className="inline h-2.5 w-2.5 mr-0.5" />
        roll
      </div>
    </button>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function IndicatorIcon({ indicator }: { indicator: RollIndicator }) {
  if (!indicator) return null;
  if (indicator === 'advantage')
    return <ChevronUp className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
  if (indicator === 'disadvantage')
    return <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />;
  if (indicator === 'auto-fail')
    return <Ban className="h-3.5 w-3.5 text-destructive shrink-0" />;
  // incapacitated
  return <Ban className="h-3.5 w-3.5 text-destructive/60 shrink-0" />;
}

function indicatorTitle(
  indicator: RollIndicator,
  rollType: string,
  label: string,
  modStr: string,
): string {
  const base = `Roll ${rollType}: ${label} (1d20 ${modStr})`;
  if (!indicator) return base;
  if (indicator === 'advantage') return `${base} — Advantage (condition effect)`;
  if (indicator === 'disadvantage') return `${base} — Disadvantage (condition effect)`;
  if (indicator === 'auto-fail') return `${base} — Auto-Fail (condition effect)`;
  return `Incapacitated — cannot act`;
}
