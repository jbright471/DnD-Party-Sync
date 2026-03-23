import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Sparkles } from 'lucide-react';
import socket from '../socket';

const PRESET_BUFFS = [
  { name: 'Bless', isConcentration: true, description: '+1d4 to attacks and saves' },
  { name: 'Haste', isConcentration: true, description: '+2 AC, Adv on DEX saves, extra action' },
  { name: 'Shield of Faith', isConcentration: true, description: '+2 AC' },
  { name: 'Mage Armor', isConcentration: false, description: 'AC becomes 13 + DEX' },
  { name: 'Bardic Inspiration', isConcentration: false, description: '+1d8 to one roll' },
  { name: 'Heroism', isConcentration: true, description: 'Immune to frightened, temp HP' },
  { name: 'Guidance', isConcentration: true, description: '+1d4 to one ability check' },
];

interface BuffManagerModalProps {
  open: boolean;
  onClose: () => void;
}

export function BuffManagerModal({ open, onClose }: BuffManagerModalProps) {
  const { state } = useGame();
  const party = state.characters;
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [selectedBuff, setSelectedBuff] = useState(PRESET_BUFFS[0]);
  const [customName, setCustomName] = useState('');
  const [isConcentration, setIsConcentration] = useState(true);

  const toggleTarget = (id: string) => {
    setSelectedTargets(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const handleApply = () => {
    if (selectedTargets.length === 0) return;
    const buffData = {
      name: customName || selectedBuff?.name,
      isConcentration,
      sourceName: 'DM',
      stat: 'ATK',
      modifier: 2,
      source: 'DM'
    };
    socket.emit('apply_buff', {
      characterIds: selectedTargets.map(id => parseInt(id)),
      buffData,
      actor: 'DM'
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-mana" /> Enchantment Console
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* 1. Select Buff */}
          <section className="space-y-3">
            <h4 className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">1. Select Magic Effect</h4>
            <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
              {PRESET_BUFFS.map(b => (
                <button
                  key={b.name}
                  onClick={() => { setSelectedBuff(b); setCustomName(''); setIsConcentration(b.isConcentration); }}
                  className={`p-3 text-left rounded-lg border transition-all ${
                    selectedBuff?.name === b.name && !customName
                      ? 'bg-mana/15 border-mana/50 shadow-sm'
                      : 'bg-secondary/20 border-border hover:border-mana/30'
                  }`}
                >
                  <div className="text-xs font-bold text-foreground">{b.name}</div>
                  <div className="text-[9px] text-muted-foreground truncate">{b.description}</div>
                </button>
              ))}
            </div>
            <Input
              placeholder="Or enter custom effect name..."
              value={customName}
              onChange={e => { setCustomName(e.target.value); if (e.target.value) setSelectedBuff(null as any); }}
              className="text-sm"
            />
          </section>

          {/* 2. Select Targets */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">2. Select Targets</h4>
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setSelectedTargets(party.map(p => p.id))}>
                Select All
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {party.map(char => (
                <button
                  key={char.id}
                  onClick={() => toggleTarget(char.id)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-bold transition-all ${
                    selectedTargets.includes(char.id)
                      ? 'bg-gold text-background border-gold'
                      : 'bg-secondary/20 text-muted-foreground border-border hover:border-gold/50'
                  }`}
                >
                  {char.name}
                </button>
              ))}
            </div>
          </section>

          {/* 3. Settings */}
          <div className="flex items-center gap-3 border-t border-border pt-4">
            <Checkbox
              id="concentration"
              checked={isConcentration}
              onCheckedChange={v => setIsConcentration(!!v)}
            />
            <Label htmlFor="concentration" className="text-xs uppercase tracking-tight cursor-pointer">
              Requires Concentration
            </Label>
          </div>

          <Button
            onClick={handleApply}
            disabled={selectedTargets.length === 0 || (!selectedBuff && !customName)}
            className="w-full font-display tracking-wider"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Apply Enchantment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
