import React, { useState } from 'react';
import { DieType, DiceRoll, rollDice } from '../types/character';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dices, EyeOff, Lock, Globe } from 'lucide-react';
import socket from '../socket';
import type { RollVisibility } from '../types/effects';

const DICE: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
const ROLL_VISIBILITY_KEY = 'arcane_roll_visibility';
const VISIBILITY_OPTIONS: { value: RollVisibility; label: string; desc: string }[] = [
  { value: 'public', label: 'Public', desc: 'Visible to the table' },
  { value: 'private', label: 'Private', desc: 'You and DM see the result' },
  { value: 'secret', label: 'Secret', desc: 'DM sees result, you see a seal' },
  { value: 'super_secret', label: 'Super Secret', desc: 'Only DM sees the result' },
];

function getStoredVisibility(): RollVisibility {
  if (typeof window === 'undefined') return 'public';
  const stored = window.localStorage.getItem(ROLL_VISIBILITY_KEY) as RollVisibility | null;
  return stored && VISIBILITY_OPTIONS.some(option => option.value === stored) ? stored : 'public';
}

interface DiceRollerProps {
  onRoll?: (roll: DiceRoll) => void;
  compact?: boolean;
  characterName?: string;
  /** Show roll visibility controls. Kept for compatibility with the old DM private toggle prop. */
  showPrivateToggle?: boolean;
  showVisibilityControls?: boolean;
}

export const DiceRoller = React.memo(function DiceRoller({
  onRoll,
  compact = false,
  characterName,
  showPrivateToggle = false,
  showVisibilityControls = false,
}: DiceRollerProps) {
  const [selectedDie, setSelectedDie] = useState<DieType>('d20');
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [lastRoll, setLastRoll] = useState<DiceRoll | null>(null);
  const [lastMaskedRoll, setLastMaskedRoll] = useState<{ label: string; rollVisibility: RollVisibility } | null>(null);
  const [rolling, setRolling] = useState(false);
  const [rollVisibility, setRollVisibility] = useState<RollVisibility>(getStoredVisibility);
  const showRollVisibility = showPrivateToggle || showVisibilityControls;
  const isHiddenRoll = rollVisibility === 'secret' || rollVisibility === 'super_secret';

  const handleVisibilityChange = (value: RollVisibility) => {
    setRollVisibility(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ROLL_VISIBILITY_KEY, value);
    }
  };

  const handleRoll = () => {
    setRolling(true);
    setTimeout(() => {
      const label = `${count}${selectedDie}${modifier !== 0 ? (modifier > 0 ? `+${modifier}` : modifier) : ''}`;

      if (isHiddenRoll) {
        socket.emit('server_dice_roll', {
          actor: characterName || 'Someone',
          sides: parseInt(selectedDie.slice(1)),
          count,
          modifier,
          label,
          rollType: 'Roll',
          rollVisibility,
        });
        setLastRoll(null);
        setLastMaskedRoll(rollVisibility === 'secret' ? { label, rollVisibility } : null);
        setRolling(false);
        return;
      }

      const roll = rollDice(selectedDie, count, modifier);
      setLastRoll(roll);
      setLastMaskedRoll(null);
      setRolling(false);

      socket.emit('dice_roll', {
        actor: characterName || 'Someone',
        sides: parseInt(roll.die.slice(1)),
        count: roll.count,
        modifier: roll.modifier,
        total: roll.total,
        rolls: roll.results,
        label,
        rollType: 'Roll',
        isPrivate: rollVisibility === 'private',
        rollVisibility,
      });

      onRoll?.(roll);
    }, 600);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {DICE.map(die => (
          <Button
            key={die}
            size="sm"
            variant={selectedDie === die ? 'default' : 'secondary'}
            onClick={() => setSelectedDie(die)}
            className="font-display text-xs uppercase tracking-wider"
          >
            {die}
          </Button>
        ))}
      </div>

      {!compact && (
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">Count:</span>
            <Input
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 h-8 text-center"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">Mod:</span>
            <Input
              type="number"
              value={modifier}
              onChange={e => setModifier(parseInt(e.target.value) || 0)}
              className="w-16 h-8 text-center"
            />
          </div>
        </div>
      )}

      <Button onClick={handleRoll} disabled={rolling} className="w-full font-display tracking-wider">
        <Dices className={`mr-2 h-4 w-4 ${rolling ? 'animate-dice-roll' : ''}`} />
        Roll {count}{selectedDie}{modifier !== 0 ? (modifier > 0 ? `+${modifier}` : modifier) : ''}
      </Button>

      {showRollVisibility && (
        <div className={`flex items-center justify-between px-3 py-2 rounded border transition-colors ${
          rollVisibility !== 'public'
            ? 'border-fuchsia-700/50 bg-fuchsia-950/30'
            : 'border-border/40 bg-secondary/10'
        }`}>
          <div className="flex items-center gap-2 min-w-0">
            {rollVisibility === 'public'
              ? <Globe className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
              : rollVisibility === 'super_secret'
                ? <EyeOff className="h-3.5 w-3.5 text-fuchsia-400 shrink-0" />
                : <Lock className="h-3.5 w-3.5 text-fuchsia-400 shrink-0" />
            }
            <Label className="text-xs select-none truncate">
              {VISIBILITY_OPTIONS.find(option => option.value === rollVisibility)?.desc}
            </Label>
          </div>
          <Select value={rollVisibility} onValueChange={value => handleVisibilityChange(value as RollVisibility)}>
            <SelectTrigger className="h-7 w-32 text-xs bg-background/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISIBILITY_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value} className="text-xs">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {lastRoll && (
        <div className={`rounded-lg p-3 text-center border transition-colors ${
          rollVisibility === 'private'
            ? 'bg-fuchsia-950/30 border-fuchsia-800/40'
            : 'bg-secondary/50 border-border'
        }`}>
          <div className="text-xs text-muted-foreground mb-1">
            [{lastRoll.results.join(', ')}]{lastRoll.modifier !== 0 ? ` ${lastRoll.modifier > 0 ? '+' : ''}${lastRoll.modifier}` : ''}
            {rollVisibility === 'private' && <span className="ml-2 text-fuchsia-400/70 text-[9px]">private</span>}
          </div>
          <div className="text-3xl font-display font-bold text-primary">
            {lastRoll.total}
          </div>
        </div>
      )}

      {lastMaskedRoll && (
        <div className="rounded-lg p-3 text-center border bg-fuchsia-950/30 border-fuchsia-800/40">
          <div className="text-xs text-fuchsia-300/70 mb-1">{lastMaskedRoll.label}</div>
          <div className="text-xl font-display font-bold text-fuchsia-200">Fate Sealed</div>
          <p className="text-[10px] text-muted-foreground mt-1">The DM has the result.</p>
        </div>
      )}
    </div>
  );
});
