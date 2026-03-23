import { useState } from 'react';
import { DieType, DiceRoll, rollDice } from '../types/character';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dices } from 'lucide-react';
import socket from '../socket';

const DICE: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

interface DiceRollerProps {
  onRoll?: (roll: DiceRoll) => void;
  compact?: boolean;
  characterName?: string;
}

export function DiceRoller({ onRoll, compact = false, characterName }: DiceRollerProps) {
  const [selectedDie, setSelectedDie] = useState<DieType>('d20');
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [lastRoll, setLastRoll] = useState<DiceRoll | null>(null);
  const [rolling, setRolling] = useState(false);

  const handleRoll = () => {
    setRolling(true);
    setTimeout(() => {
      const roll = rollDice(selectedDie, count, modifier);
      setLastRoll(roll);
      setRolling(false);
      
      // Broadcast to party
      socket.emit('dice_roll', {
        actor: characterName || 'Someone',
        sides: parseInt(roll.die.slice(1)),
        count: roll.count,
        modifier: roll.modifier,
        total: roll.total,
        rolls: roll.results
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

      {lastRoll && (
        <div className="bg-secondary/50 rounded-lg p-3 text-center border border-border">
          <div className="text-xs text-muted-foreground mb-1">
            [{lastRoll.results.join(', ')}]{lastRoll.modifier !== 0 ? ` ${lastRoll.modifier > 0 ? '+' : ''}${lastRoll.modifier}` : ''}
          </div>
          <div className="text-3xl font-display font-bold text-primary">
            {lastRoll.total}
          </div>
        </div>
      )}
    </div>
  );
}
