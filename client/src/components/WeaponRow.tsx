import { rollDice, WeaponAttack } from '../types/character';
import socket from '../socket';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { Crosshair, Dices, Swords, Target } from 'lucide-react';

interface WeaponRowProps {
  weapon: WeaponAttack;
  characterName?: string;
}

export function WeaponRow({ weapon, characterName = 'Unknown' }: WeaponRowProps) {
  // ── Attack Roll ───────────────────────────────────────────────────────────
  const handleAttackRoll = () => {
    const roll = rollDice('d20', 1, weapon.attackBonus);
    const nat = roll.results[0];
    const isCrit = nat === 20;
    const isFumble = nat === 1;
    const modStr = weapon.attackBonus >= 0 ? `+${weapon.attackBonus}` : `${weapon.attackBonus}`;

    socket.emit('dice_roll', {
      actor: characterName,
      sides: 20,
      count: 1,
      modifier: weapon.attackBonus,
      total: roll.total,
      rolls: roll.results,
      label: weapon.name,
      rollType: 'Attack Roll',
      source: weapon.name,
    });

    if (isCrit) {
      toast.success(`CRITICAL HIT — ${weapon.name}`, {
        description: `[20] ${modStr} = ${roll.total}`,
        duration: 4000,
      });
    } else if (isFumble) {
      toast.error(`Natural 1 — ${weapon.name}`, {
        description: `[1] ${modStr} = ${roll.total}`,
        duration: 3000,
      });
    } else {
      toast(`Attack Roll: ${weapon.name}`, {
        description: `[${nat}] ${modStr} = ${roll.total}`,
        duration: 3000,
      });
    }
  };

  // ── Damage Roll (Shift+click = critical) ─────────────────────────────────
  const handleDamageRoll = (e: React.MouseEvent) => {
    const isCrit = e.shiftKey;
    // Critical hit: double the dice, keep the flat bonus unchanged (5e RAW)
    const dieCount = isCrit ? weapon.damageCount * 2 : weapon.damageCount;
    const roll = rollDice(weapon.damageDice, dieCount, weapon.damageBonus);

    const modPart = weapon.damageBonus > 0
      ? `+${weapon.damageBonus}`
      : weapon.damageBonus < 0
      ? `${weapon.damageBonus}`
      : '';
    const diceLabel = `${dieCount}${weapon.damageDice}${modPart}`;

    socket.emit('dice_roll', {
      actor: characterName,
      sides: parseInt(weapon.damageDice.slice(1)),
      count: dieCount,
      modifier: weapon.damageBonus,
      total: roll.total,
      rolls: roll.results,
      label: weapon.name,
      rollType: isCrit ? 'Critical Damage' : 'Damage Roll',
      source: weapon.name,
      damageType: weapon.damageType,
    });

    if (isCrit) {
      toast.success(`CRITICAL DAMAGE — ${weapon.name}`, {
        description: `${diceLabel} = ${roll.total} ${weapon.damageType}`,
        duration: 4000,
      });
    } else {
      toast(`Damage: ${weapon.name}`, {
        description: `${diceLabel} = ${roll.total} ${weapon.damageType}`,
        duration: 3000,
      });
    }
  };

  // ── Derived display strings ───────────────────────────────────────────────
  const attackModStr = weapon.attackBonus >= 0 ? `+${weapon.attackBonus}` : `${weapon.attackBonus}`;
  const damageModStr = weapon.damageBonus > 0
    ? `+${weapon.damageBonus}`
    : weapon.damageBonus < 0
    ? `${weapon.damageBonus}`
    : '';
  const diceLabel = `${weapon.damageCount}${weapon.damageDice}${damageModStr}`;
  // Abbreviated damage type for the badge (e.g. "Piercing" → "PIERC")
  const dmgTypeShort = weapon.damageType.slice(0, 5).toUpperCase();

  return (
    <div className="flex items-center gap-2 sm:gap-3 py-2 px-3 rounded-lg border border-border/60 bg-secondary/10 group hover:bg-secondary/20 hover:border-border transition-colors">
      {/* Weapon type icon */}
      <div className="shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
        {weapon.isMelee
          ? <Swords className="h-4 w-4" />
          : <Target className="h-4 w-4" />
        }
      </div>

      {/* Name + property tags */}
      <div className="flex-1 min-w-0">
        <div className="font-display text-sm leading-tight truncate">{weapon.name}</div>
        {weapon.notes && (
          <div className="text-[10px] text-muted-foreground/70 truncate mt-0.5">{weapon.notes}</div>
        )}
      </div>

      {/* Range — hidden on small screens */}
      {weapon.range && (
        <div className="text-xs text-muted-foreground shrink-0 hidden md:block tabular-nums">{weapon.range}</div>
      )}

      {/* ── TO HIT button ── */}
      <button
        onClick={handleAttackRoll}
        title={`Attack Roll: 1d20 ${attackModStr}`}
        aria-label={`Roll attack with ${weapon.name}`}
        className={cn(
          'group/atk shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md',
          'border border-primary/40 bg-primary/10 text-primary',
          'hover:bg-primary/25 hover:border-primary/70 hover:shadow-[0_0_8px_hsl(var(--primary)/0.2)]',
          'transition-all duration-100 cursor-pointer',
          'font-display text-sm font-bold tabular-nums',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        )}
      >
        <Crosshair className="h-3 w-3 opacity-50 group-hover/atk:opacity-100 transition-opacity" />
        {attackModStr}
      </button>

      {/* ── DAMAGE button (shift+click = crit) ── */}
      <button
        onClick={handleDamageRoll}
        title={`Damage Roll: ${diceLabel} ${weapon.damageType} · Shift+Click for Critical (${weapon.damageCount * 2}${weapon.damageDice}${damageModStr})`}
        aria-label={`Roll damage with ${weapon.name}. Shift-click for critical hit.`}
        className={cn(
          'group/dmg shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md',
          'border border-destructive/40 bg-destructive/10 text-destructive',
          'hover:bg-destructive/25 hover:border-destructive/70 hover:shadow-[0_0_8px_hsl(var(--destructive)/0.2)]',
          'transition-all duration-100 cursor-pointer',
          'font-display text-sm font-bold tabular-nums',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive',
        )}
      >
        <Dices className="h-3 w-3 opacity-50 group-hover/dmg:opacity-100 transition-opacity" />
        {diceLabel}
        <span className="hidden sm:inline text-[9px] font-normal opacity-60 ml-0.5">{dmgTypeShort}</span>
      </button>
    </div>
  );
}
