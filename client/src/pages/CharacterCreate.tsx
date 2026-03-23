import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Slider } from '../components/ui/slider';
import { UserPlus, Save, FileJson } from 'lucide-react';
import { toast } from 'sonner';
import { DND_CLASSES, DndClass, AbilityScores } from '../types/character';
import socket from '../socket';

const ABILITY_KEYS: (keyof AbilityScores)[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const ABILITY_LABELS: Record<string, string> = {
  STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution',
  INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma',
};

export default function CharacterCreate() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [dndClass, setDndClass] = useState<DndClass>('Fighter');
  const [level, setLevel] = useState(1);
  const [maxHp, setMaxHp] = useState(10);
  const [ac, setAc] = useState(10);
  const [speed, setSpeed] = useState(30);
  const [abilities, setAbilities] = useState<AbilityScores>({
    STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10,
  });

  const setAbility = (key: keyof AbilityScores, val: number) => {
    setAbilities(prev => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Character needs a name!');
      return;
    }

    try {
      const res = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          class: dndClass,
          level,
          max_hp: maxHp,
          ac,
          stats: JSON.stringify(abilities),
          speed
        }),
      });

      if (!res.ok) throw new Error('Failed to create character');

      const data = await res.json();
      socket.emit('refresh_party');
      toast.success(`${data.name} has been created!`);
      navigate('/party');
    } catch (err) {
      toast.error('Error creating character');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserPlus className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-display tracking-wider">Create Character</h1>
        </div>
        <Button variant="outline" onClick={() => navigate('/character/import')}>
          <FileJson className="h-4 w-4 mr-2" /> Import from D&D Beyond
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="font-display">Character Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Enter character name..." className="text-lg" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="font-display">Class</Label>
              <Select value={dndClass} onValueChange={v => setDndClass(v as DndClass)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DND_CLASSES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-display">Level</Label>
              <Input type="number" min={1} max={20} value={level} onChange={e => setLevel(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="font-display">Max HP</Label>
              <Input type="number" min={1} value={maxHp} onChange={e => setMaxHp(Math.max(1, parseInt(e.target.value) || 1))} />
            </div>
            <div className="space-y-2">
              <Label className="font-display">AC</Label>
              <Input type="number" min={0} value={ac} onChange={e => setAc(Math.max(0, parseInt(e.target.value) || 0))} />
            </div>
            <div className="space-y-2">
              <Label className="font-display">Speed (ft)</Label>
              <Input type="number" min={0} step={5} value={speed} onChange={e => setSpeed(Math.max(0, parseInt(e.target.value) || 0))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Ability Scores</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {ABILITY_KEYS.map(key => (
            <div key={key} className="space-y-1">
              <div className="flex justify-between items-center">
                <Label className="font-display text-sm">{ABILITY_LABELS[key]}</Label>
                <span className="font-display text-lg font-bold text-primary w-8 text-center">{abilities[key]}</span>
              </div>
              <Slider
                value={[abilities[key]]}
                onValueChange={([v]) => setAbility(key, v)}
                min={1}
                max={30}
                step={1}
                className="w-full"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={handleSave} size="lg" className="w-full font-display tracking-wider text-lg h-12">
        <Save className="mr-2 h-5 w-5" />
        Create Character
      </Button>
    </div>
  );
}
