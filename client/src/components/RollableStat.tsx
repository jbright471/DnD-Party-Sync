import { rollDice } from '../types/character';
import socket from '../socket';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { Dices } from 'lucide-react';

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
}: RollableStatProps) {
  const handleClick = () => {
    const roll = rollDice('d20', 1, modifier);
    const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;

    // Broadcast to the party — same shape as DiceRoller, with extra context
    socket.emit('dice_roll', {
      actor: characterName,
      sides: 20,
      count: 1,
      modifier: roll.modifier,
      total: roll.total,
      rolls: roll.results,
      label,
      rollType,
    });

    toast(`${rollType}: ${label}`, {
      description: `[${roll.results[0]}] ${modStr} = ${roll.total}`,
      duration: 3000,
    });

    onRoll?.({
      rollType,
      label,
      modifier,
      roll: roll.results[0],
      total: roll.total,
    });
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
          className,
        )}
        title={`Roll ${rollType}: ${label} (1d20 ${modStr})`}
        aria-label={`Roll ${label} ${rollType}`}
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
        'group bg-secondary/30 rounded-lg p-3 text-center border border-border w-full',
        'hover:bg-primary/10 hover:border-primary/40',
        'transition-colors duration-100 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
      title={`Roll ${rollType}: ${label} (1d20 ${modStr})`}
      aria-label={`Roll ${label}`}
    >
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
