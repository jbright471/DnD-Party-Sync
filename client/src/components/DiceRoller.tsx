import { useState } from 'react';
import { DieType, DiceRoll, rollDice } from '../types/character';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Dices, Lock, Globe } from 'lucide-react';
import socket from '../socket';

const DICE: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

interface DiceRollerProps {
  onRoll?: (roll: DiceRoll) => void;
  compact?: boolean;
  characterName?: string;
  /** Show the Private/Public toggle (DM dashboard only) */
  showPrivateToggle?: boolean;
}

export function DiceRoller({ onRoll, compact = false, characterName, showPrivateToggle = false }: DiceRollerProps) {
  const [selectedDie, setSelectedDie] = useState<DieType>('d20');
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [lastRoll, setLastRoll] = useState<DiceRoll | null>(null);
  const [rolling, setRolling] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);

  const handleRoll = () => {
    setRolling(true);
    setTimeout(() => {
      const roll = rollDice(selectedDie, count, modifier);
      setLastRoll(roll);
      setRolling(false);

      socket.emit('dice_roll', {
        actor: characterName || 'Someone',
        sides: parseInt(roll.die.slice(1)),
        count: roll.count,
        modifier: roll.modifier,
        total: roll.total,
        rolls: roll.results,
        label: `${count}${selectedDie}${modifier !== 0 ? (modifier > 0 ? `+${modifier}` : modifier) : ''}`,
        rollType: 'Roll',
        isPrivate,
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

      {showPrivateToggle && (
        <div className={`flex items-center justify-between px-3 py-2 rounded border transition-colors ${
          isPrivate
            ? 'border-fuchsia-700/50 bg-fuchsia-950/30'
            : 'border-border/40 bg-secondary/10'
        }`}>
          <div className="flex items-center gap-2">
            {isPrivate
              ? <Lock className="h-3.5 w-3.5 text-fuchsia-400" />
              : <Globe className="h-3.5 w-3.5 text-muted-foreground/60" />
            }
            <Label className="text-xs cursor-pointer select-none">
              {isPrivate ? 'Private — DM only' : 'Public — visible to players'}
            </Label>
          </div>
          <Switch
            checked={isPrivate}
            onCheckedChange={setIsPrivate}
          />
        </div>
      )}

      {lastRoll && (
        <div className={`rounded-lg p-3 text-center border transition-colors ${
          isPrivate
            ? 'bg-fuchsia-950/30 border-fuchsia-800/40'
            : 'bg-secondary/50 border-border'
        }`}>
          <div className="text-xs text-muted-foreground mb-1">
            [{lastRoll.results.join(', ')}]{lastRoll.modifier !== 0 ? ` ${lastRoll.modifier > 0 ? '+' : ''}${lastRoll.modifier}` : ''}
            {isPrivate && <span className="ml-2 text-fuchsia-400/70 text-[9px]">🔒 private</span>}
          </div>
          <div className="text-3xl font-display font-bold text-primary">
            {lastRoll.total}
          </div>
        </div>
      )}
    </div>
  );
}
