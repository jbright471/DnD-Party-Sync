import { type AbilityScore, type ProficiencyLevel, type Character } from '../types/character';
import socket from '../socket';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { Dices, AlertTriangle, ChevronUp, ChevronDown, Ban } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import type { RollVisibility } from '../types/effects';

const ROLL_VISIBILITY_KEY = 'arcane_roll_visibility';

function getStoredRollVisibility(): RollVisibility {
  if (typeof window === 'undefined') return 'public';
  const stored = window.localStorage.getItem(ROLL_VISIBILITY_KEY) as RollVisibility | null;
  return stored && ['public', 'private', 'secret', 'super_secret'].includes(stored) ? stored : 'public';
}

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
  character: Character;
  /** Short ability abbreviation shown alongside the label (e.g. "DEX") */
  sublabel?: string;
  /** Raw ability score rendered inside card variant */
  score?: number;
  /** Filled dot = proficient (legacy — prefer proficiencyLevel) */
  proficient?: boolean;
  /** Full proficiency level; overrides proficient when set */
  proficiencyLevel?: ProficiencyLevel | 'none';
  /** card = large ability-score block, row = compact skill/save row */
  variant?: 'card' | 'row';
  className?: string;
  onRoll?: (result: StatRollResult) => void;
  /** The ability score key for this roll (e.g. 'DEX', 'STR') */
  ability?: AbilityScore;
}

export function RollableStat({
  label,
  modifier,
  rollType,
  character,
  sublabel,
  score,
  proficient = false,
  proficiencyLevel,
  variant = 'card',
  className,
  onRoll,
  ability,
  breakdown,
}: RollableStatProps & {
  breakdown?: {
    final: number;
    sources: { source: string; type: string; value: number | string }[];
    rollState?: string;
    advantages?: string[];
    disadvantages?: string[];
    autoFails?: string[];
  };
}) {
  const characterName = character.name || 'Someone';
  // Resolve effective proficiency from either prop
  const effectiveProfLevel: ProficiencyLevel | 'none' =
    proficiencyLevel ?? (proficient ? 'proficiency' : 'none');
  // Determine indicator from server-provided roll modifiers
  let indicator: 'advantage' | 'disadvantage' | 'auto-fail' | 'incapacitated' | null = null;
  let modObj: any = null;
  
  if (character.rollModifiers) {
    const rt = rollType.toLowerCase();
    if (rt.includes('attack')) {
      modObj = character.rollModifiers.attacks;
    } else if (rt.includes('initiative')) {
      modObj = character.rollModifiers.initiative;
    } else if (rt.includes('saving throw') || rt.includes('save')) {
      modObj = ability ? character.rollModifiers.saving_throws[ability] : null;
    } else {
      modObj = ability ? character.rollModifiers.ability_checks[ability] : null;
    }

    if (modObj) {
      if (modObj.incapacitated) indicator = 'incapacitated';
      else if (modObj.autoFail) indicator = 'auto-fail';
      else if (modObj.advantage === 'disadvantage') indicator = 'disadvantage';
      else if (modObj.advantage === 'advantage') indicator = 'advantage';
    }
  }

  const handleClick = () => {
    const rollVisibility = getStoredRollVisibility();
    const isHiddenRoll = rollVisibility === 'secret' || rollVisibility === 'super_secret';

    // Auto-fail: emit a 0 total with explanation
    if (modObj?.autoFail) {
      const reason = modObj.reasons.join('; ');
      socket.emit('dice_roll', {
        actor: characterName,
        sides: 20,
        count: 1,
        modifier,
        total: 0,
        rolls: [0],
        label,
        rollType,
        rollVisibility,
        isPrivate: rollVisibility !== 'public',
        conditionFlags: { autoFail: true, reasons: modObj.reasons },
      });
      if (isHiddenRoll) {
        toast.message('Fate sealed', {
          description: `${label} result sent to the DM.`,
          duration: 3000,
        });
      } else {
        toast.error(`Auto-Fail: ${label}`, {
          description: reason,
          duration: 4000,
        });
        onRoll?.({ rollType, label, modifier, roll: 0, total: 0 });
      }
      return;
    }

    // Roll with advantage/disadvantage evaluation
    const rollOnce = () => Math.floor(Math.random() * 20) + 1;
    
    // Inline rollWithAdvantage logic since we removed it from rollInterceptor
    let chosen: number, all: [number, number], isAdvantage: boolean, isDisadvantage: boolean;
    const advantage = modObj?.advantage || 'straight';
    if (advantage === 'straight') {
      const r = rollOnce();
      chosen = r; all = [r, r]; isAdvantage = false; isDisadvantage = false;
    } else {
      const r1 = rollOnce();
      const r2 = rollOnce();
      chosen = advantage === 'advantage' ? Math.max(r1, r2) : Math.min(r1, r2);
      all = [r1, r2];
      isAdvantage = advantage === 'advantage';
      isDisadvantage = advantage === 'disadvantage';
    }

    const total = chosen + modifier;
    const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;

    // Build reason string for the effect stream
    const reasonTag = modObj?.reasons?.length > 0
      ? ` (${isAdvantage ? 'Advantage' : 'Disadvantage'}: ${modObj.reasons.map((r: string) => r.split(':')[0]).join(', ')})`
      : '';

    if (isHiddenRoll) {
      socket.emit('server_dice_roll', {
        actor: characterName,
        sides: 20,
        modifier,
        label: `${label}${reasonTag}`,
        rollType,
        ability,
        rollMode: isAdvantage ? 'advantage' : isDisadvantage ? 'disadvantage' : 'straight',
        rollVisibility,
        conditionFlags: modObj?.reasons?.length > 0
          ? { advantage: modObj.advantage, reasons: modObj.reasons }
          : undefined,
      });
      if (rollVisibility === 'super_secret') {
        toast.message('Roll sent to the DM', {
          description: `${rollType}: ${label}`,
          duration: 3000,
        });
      }
      return;
    }

    socket.emit('dice_roll', {
      actor: characterName,
      sides: 20,
      count: isAdvantage || isDisadvantage ? 2 : 1,
      modifier,
      total,
      rolls: isAdvantage || isDisadvantage ? [all[0], all[1]] : [chosen],
      label: `${label}${reasonTag}`,
      rollType,
      rollVisibility,
      isPrivate: rollVisibility === 'private',
      conditionFlags: modObj?.reasons?.length > 0
        ? { advantage: modObj.advantage, reasons: modObj.reasons }
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

  const hasBreakdown = breakdown && breakdown.sources && breakdown.sources.length > 0;

  const tooltipBody = hasBreakdown ? (
    <div className="p-2.5 space-y-1.5 text-xs max-w-[260px] bg-slate-950/95 border border-amber-900/30 rounded-lg shadow-xl font-sans text-slate-300 backdrop-blur-sm">
      <div className="font-semibold text-amber-400 font-display uppercase tracking-wider text-[10px] pb-1.5 border-b border-amber-950/40">
        {label} Breakdown
      </div>
      <div className="space-y-1 pt-0.5">
        {breakdown.sources.map((src, i) => (
          <div key={i} className="flex justify-between items-center gap-4">
            <span className="text-slate-400 font-medium">{src.source}</span>
            <span className="font-mono font-semibold text-amber-500/90 text-right">
              {typeof src.value === 'number' && src.value >= 0 ? `+${src.value}` : src.value}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center pt-1.5 mt-1 border-t border-amber-950/40 font-bold text-amber-400">
        <span>Total Modifier</span>
        <span className="font-mono text-sm">{modStr}</span>
      </div>
      {(breakdown.advantages && breakdown.advantages.length > 0) && (
        <div className="text-[10px] text-emerald-400 font-medium pt-1">
          Advantage from: {breakdown.advantages.join(', ')}
        </div>
      )}
      {(breakdown.disadvantages && breakdown.disadvantages.length > 0) && (
        <div className="text-[10px] text-destructive font-medium pt-1">
          Disadvantage from: {breakdown.disadvantages.join(', ')}
        </div>
      )}
      {(breakdown.autoFails && breakdown.autoFails.length > 0) && (
        <div className="text-[10px] text-destructive font-bold pt-1 uppercase">
          Auto-Fail from: {breakdown.autoFails.join(', ')}
        </div>
      )}
    </div>
  ) : null;

  /* ── Row layout: used for Skills and Saving Throws ── */
  const rowElement = (
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
      title={hasBreakdown ? undefined : indicatorTitle(indicator, rollType, label, modStr)}
      aria-label={`Roll ${label} ${rollType}`}
      disabled={indicator === 'incapacitated'}
    >
      {/* Proficiency indicator */}
      <span
        className={cn(
          'w-2 h-2 rounded-full border shrink-0',
          effectiveProfLevel === 'expertise'   && 'bg-amber-400 border-amber-400',
          effectiveProfLevel === 'proficiency' && 'bg-primary border-primary',
          effectiveProfLevel === 'half'        && 'bg-primary/40 border-primary/60',
          effectiveProfLevel === 'none'        && 'border-muted-foreground/50',
        )}
        title={effectiveProfLevel === 'expertise' ? 'Expertise' : effectiveProfLevel === 'proficiency' ? 'Proficient' : effectiveProfLevel === 'half' ? 'Half Proficiency' : undefined}
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

  /* ── Card layout: used for Ability Scores and Initiative ── */
  const cardElement = (
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
      title={hasBreakdown ? undefined : indicatorTitle(indicator, rollType, label, modStr)}
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

  const mainElement = variant === 'row' ? rowElement : cardElement;

  if (hasBreakdown) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {mainElement}
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className="bg-transparent border-none p-0 shadow-none">
          {tooltipBody}
        </TooltipContent>
      </Tooltip>
    );
  }

  return mainElement;
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
