import { useState, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { Character, DiceRoll, rollDice, DieType, ActiveBuff, DND_CONDITIONS } from '../types/character';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { Heart, Swords, Sparkles, Zap, Shield, ChevronUp, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { backend } from '../integrations/backend';
import socket from '../socket';

type EffectType = 'heal' | 'damage' | 'temp_hp' | 'buff' | 'condition';

interface SpellAction {
  name: string;
  type: EffectType;
  die?: DieType;
  dieCount?: number;
  modifier?: number;
  description: string;
  multiTarget?: boolean;
  buffStat?: string;
  buffAmount?: number;
  tempHpAmount?: number;
  condition?: string;
  isCharacterSpell?: boolean;
  spellLevel?: number;
}

const PRESET_SPELL_ACTIONS: SpellAction[] = [
  { name: 'Cure Wounds', type: 'heal', die: 'd8', dieCount: 1, modifier: 0, description: 'Heal 1d8 + modifier', spellLevel: 1 },
  { name: 'Healing Word', type: 'heal', die: 'd4', dieCount: 1, modifier: 0, description: 'Heal 1d4 + modifier', spellLevel: 1 },
  { name: 'Mass Cure Wounds', type: 'heal', die: 'd8', dieCount: 3, modifier: 0, description: 'Heal 3d8 to up to 6 creatures', multiTarget: true, spellLevel: 5 },
  { name: 'Mass Healing Word', type: 'heal', die: 'd4', dieCount: 1, modifier: 0, description: 'Heal 1d4 to up to 6 creatures', multiTarget: true, spellLevel: 3 },
  { name: 'Fire Bolt', type: 'damage', die: 'd10', dieCount: 1, modifier: 0, description: 'Deal 1d10 fire damage', spellLevel: 0 },
  { name: 'Guiding Bolt', type: 'damage', die: 'd6', dieCount: 4, modifier: 0, description: 'Deal 4d6 radiant damage', spellLevel: 1 },
  { name: 'Eldritch Blast', type: 'damage', die: 'd10', dieCount: 1, modifier: 0, description: 'Deal 1d10 force damage', spellLevel: 0 },
  { name: 'Fireball', type: 'damage', die: 'd6', dieCount: 8, modifier: 0, description: 'Deal 8d6 fire damage to multiple targets', multiTarget: true, spellLevel: 3 },
  { name: 'Aid', type: 'temp_hp', description: 'Grant 5 temporary HP to up to 3 creatures', multiTarget: true, tempHpAmount: 5, spellLevel: 2 },
  { name: 'False Life', type: 'temp_hp', description: 'Grant 1d4+4 temporary HP', die: 'd4', dieCount: 1, modifier: 4, spellLevel: 1 },
  { name: 'Bless', type: 'buff', description: '+1d4 to attacks & saves for up to 3 creatures', multiTarget: true, buffStat: 'ATK', buffAmount: 2, spellLevel: 1 },
  { name: 'Shield of Faith', type: 'buff', description: '+2 AC to one creature', buffStat: 'AC', buffAmount: 2, spellLevel: 1 },
  { name: 'Haste', type: 'buff', description: '+2 AC, doubled speed', buffStat: 'AC', buffAmount: 2, spellLevel: 3 },
  { name: 'Bless (Save)', type: 'buff', description: '+1d4 to saving throws', buffStat: 'Saves', buffAmount: 2, multiTarget: true, spellLevel: 1 },
  { name: 'Heroism', type: 'temp_hp', description: 'Grant temp HP equal to spellcasting modifier', tempHpAmount: 3, multiTarget: true, spellLevel: 1 },
];

const CONDITION_ACTIONS: SpellAction[] = DND_CONDITIONS.map(cond => ({
  name: `Apply ${cond}`,
  type: 'condition' as EffectType,
  description: `Apply the ${cond} condition`,
  condition: cond,
  multiTarget: true,
}));

const EFFECT_ICONS: Record<EffectType, typeof Heart> = {
  heal: Heart,
  damage: Swords,
  temp_hp: Shield,
  buff: ChevronUp,
  condition: AlertTriangle,
};

const EFFECT_LABELS: Record<EffectType, string> = {
  heal: '💚 Heal',
  damage: '⚔️ Damage',
  temp_hp: '🛡️ Temp HP',
  buff: '✨ Buff',
  condition: '⚠️ Condition',
};

export function ActionPanel() {
  const { state } = useGame();
  const [actorId, setActorId] = useState<string>('');
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [selectedSpell, setSelectedSpell] = useState<string>('');
  const [customAmount, setCustomAmount] = useState('');
  const [lastResult, setLastResult] = useState<{ roll?: DiceRoll; spell: SpellAction; targets: string[] } | null>(null);
  const [effectFilter, setEffectFilter] = useState<EffectType | 'all'>('all');
  const [manualConCheck, setManualConCheck] = useState(false);

  const members = state.characters || [];
  const actor = members.find(m => m.id === actorId);

  const availableSpells = useMemo(() => {
    const spells: SpellAction[] = [...PRESET_SPELL_ACTIONS, ...CONDITION_ACTIONS];
    if (actor?.spells && actor.spells.length > 0) {
      const characterSpells: SpellAction[] = actor.spells
        .filter(s => !spells.some(preset => preset.name.toLowerCase() === s.name.toLowerCase()))
        .map(s => {
          let type: EffectType = 'damage';
          const lowerName = s.name.toLowerCase();
          if (lowerName.includes('heal') || lowerName.includes('cure') || lowerName.includes('restore')) {
            type = 'heal';
          } else if (lowerName.includes('shield') || lowerName.includes('aid') || lowerName.includes('armor')) {
            type = 'buff';
          }
          return {
            name: s.name,
            type,
            description: `Spell - Level ${s.level}`,
            isCharacterSpell: true,
            spellLevel: s.level,
            die: type === 'damage' ? 'd6' : type === 'heal' ? 'd8' : undefined,
            dieCount: type === 'damage' || type === 'heal' ? Math.max(1, s.level) : undefined,
            modifier: 0,
          } as SpellAction;
        });
      spells.push(...characterSpells);
    }
    return spells;
  }, [actor?.spells]);

  const filteredSpells = useMemo(() => {
    if (effectFilter === 'all') return availableSpells;
    return availableSpells.filter(s => s.type === effectFilter);
  }, [availableSpells, effectFilter]);

  const spell = availableSpells.find(s => s.name === selectedSpell);

  const toggleTarget = (id: string) => {
    if (!spell?.multiTarget) {
      setSelectedTargetIds([id]);
      return;
    }
    setSelectedTargetIds(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const selectAllTargets = () => {
    if (selectedTargetIds.length === members.length) {
      setSelectedTargetIds([]);
    } else {
      setSelectedTargetIds(members.map(m => m.id));
    }
  };

  const handleCast = () => {
    if (!actorId || selectedTargetIds.length === 0 || !spell) return;
    const actorChar = members.find(m => m.id === actorId);
    if (!actorChar) return;

    const targetNames = selectedTargetIds.map(id => members.find(m => m.id === id)?.name ?? 'Unknown');
    let roll: DiceRoll | undefined;
    let finalVal = 0;

    if (spell.die && spell.dieCount !== undefined) {
      roll = rollDice(spell.die, spell.dieCount, spell.modifier ?? 0);
      finalVal = roll.total;
    } else {
      finalVal = parseInt(customAmount) || spell.tempHpAmount || spell.buffAmount || 0;
    }

    selectedTargetIds.forEach(targetId => {
      if (spell.type === 'heal') backend.updateHp(targetId, finalVal);
      if (spell.type === 'damage') backend.updateHp(targetId, -finalVal, undefined, manualConCheck);
      if (spell.type === 'temp_hp') backend.setTempHp(targetId, finalVal);
      if (spell.type === 'condition' && spell.condition) backend.applyCondition(targetId, spell.condition);
      if (spell.type === 'buff') {
        socket.emit('apply_buff', { 
          characterIds: [parseInt(targetId)], 
          buffData: {
            name: spell.name,
            stat: spell.buffStat || 'AC',
            modifier: finalVal,
            source: actorChar.name
          }
        });
      }
    });

    const actionText = `${spell.type === 'condition' ? 'applied' : 'cast'} ${spell.name} on ${targetNames.join(', ')} (${finalVal})`;
    socket.emit('log_action', { actor: actorChar.name, description: actionText });

    setLastResult({ roll, spell, targets: targetNames });
    toast.success(`Action applied: ${spell.name}`);
    setCustomAmount('');
  };

  if (members.length < 1) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-lg">Add party members to use actions</p>
        </CardContent>
      </Card>
    );
  }

  const EffectIcon = spell ? EFFECT_ICONS[spell.type] : Zap;

  return (
    <Card className="border-primary/20 bg-secondary/5">
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-display uppercase tracking-widest">Caster</label>
            <Select value={actorId} onValueChange={(v) => { setActorId(v); setSelectedSpell(''); }}>
              <SelectTrigger className="bg-secondary/20"><SelectValue placeholder="Select caster" /></SelectTrigger>
              <SelectContent>
                {members.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-display uppercase tracking-widest">Filter</label>
            <Select value={effectFilter} onValueChange={(v) => { setEffectFilter(v as EffectType | 'all'); setSelectedSpell(''); }}>
              <SelectTrigger className="bg-secondary/20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="heal">💚 Heals</SelectItem>
                <SelectItem value="damage">⚔️ Damage</SelectItem>
                <SelectItem value="temp_hp">🛡️ Temp HP</SelectItem>
                <SelectItem value="buff">✨ Buffs</SelectItem>
                <SelectItem value="condition">⚠️ Conditions</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-display uppercase tracking-widest">Spell / Action</label>
          <Select value={selectedSpell} onValueChange={(v) => { setSelectedSpell(v); setSelectedTargetIds([]); }}>
            <SelectTrigger className="bg-secondary/20"><SelectValue placeholder="Select action" /></SelectTrigger>
            <SelectContent className="max-h-80">
              {filteredSpells.map(s => (
                <SelectItem key={s.name} value={s.name}>
                  {EFFECT_LABELS[s.type].split(' ')[0]} {s.name} {s.multiTarget ? '(multi)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {spell && (
          <div className="text-xs text-muted-foreground bg-secondary/30 rounded p-2.5 border border-border/50">
            <div className="flex items-center gap-2 mb-1">
              <EffectIcon className="h-3 w-3" />
              <span className="font-bold uppercase tracking-tight">{spell.name}</span>
            </div>
            {spell.description}
            {spell.die && ` — ${spell.dieCount}${spell.die}${(spell.modifier ?? 0) > 0 ? `+${spell.modifier}` : ''}`}
          </div>
        )}

        {spell && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground font-display uppercase tracking-widest">Targets</label>
              {spell.multiTarget && (
                <Button variant="ghost" size="sm" onClick={selectAllTargets} className="text-[10px] h-6 uppercase">
                  {selectedTargetIds.length === members.length ? 'Deselect All' : 'Select All'}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {members.map(m => {
                const isSelected = selectedTargetIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleTarget(m.id)}
                    className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                        : 'border-border/50 bg-secondary/10 hover:bg-secondary/20'
                    }`}
                  >
                    <Checkbox checked={isSelected} className="pointer-events-none h-3 w-3" />
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-[11px] truncate">{m.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {m.hp.current}/{m.hp.max} HP
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {spell && (spell.type === 'buff' || spell.type === 'temp_hp') && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-display uppercase tracking-widest">Custom Amount</label>
            <Input
              type="number"
              placeholder="Override..."
              value={customAmount}
              onChange={e => setCustomAmount(e.target.value)}
              className="h-8 bg-secondary/20"
            />
          </div>
        )}

        {spell?.type === 'damage' && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="manual-con"
              checked={manualConCheck}
              onCheckedChange={v => setManualConCheck(!!v)}
              className="h-3 w-3"
            />
            <label htmlFor="manual-con" className="text-[11px] text-muted-foreground cursor-pointer select-none">
              Manual concentration saves
            </label>
          </div>
        )}

        <Button
          onClick={handleCast}
          disabled={!actorId || selectedTargetIds.length === 0 || !spell}
          className="w-full font-display tracking-wider"
          size="sm"
        >
          <EffectIcon className="mr-2 h-4 w-4" />
          {spell ? (spell.type === 'condition' ? `Apply ${spell.condition}` : `Execute ${spell.name}`) : 'Select Action'}
        </Button>

        {lastResult && (
          <div className="bg-secondary/30 rounded p-3 text-center border border-primary/10 animate-in fade-in zoom-in duration-300">
            <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-tighter">
              {lastResult.spell.name} → {lastResult.targets.join(', ')}
            </div>
            <div className={`text-2xl font-display font-bold ${
              lastResult.spell.type === 'heal' ? 'text-health'
              : lastResult.spell.type === 'damage' ? 'text-destructive'
              : lastResult.spell.type === 'temp_hp' ? 'text-mana'
              : lastResult.spell.type === 'condition' ? 'text-gold'
              : 'text-primary'
            }`}>
              {lastResult.roll?.total ?? (lastResult.spell.tempHpAmount ?? lastResult.spell.buffAmount ?? '✓')}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
