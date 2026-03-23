import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Shield, Sparkles, Trash2, Wand2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import socket from '../socket';

export default function EquipmentManager() {
  const { state } = useGame();
  const [characterId, setCharacterId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parsing, setParsing] = useState(false);

  const handleEquip = async () => {
    if (!name.trim() || !characterId) {
      toast.error('Name and character selection required');
      return;
    }

    try {
      setParsing(true);
      const createRes = await fetch('/api/homebrew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'item',
          name: name.trim(),
          description: description.trim(),
          stats_json: {}
        }),
      });

      if (!createRes.ok) throw new Error('Creation failed');
      const newEntity = await createRes.json();

      const assignRes = await fetch('/api/homebrew/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: parseInt(characterId),
          entityId: newEntity.id
        }),
      });

      if (!assignRes.ok) throw new Error('Assignment failed');

      socket.emit('refresh_party');
      toast.success(`'${name}' equipped to character!`);
      setName('');
      setDescription('');
    } catch (err) {
      toast.error('Failed to equip item');
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-mana" />
        <h1 className="text-3xl font-display tracking-wider">Equipment Manager</h1>
      </div>

      <Card className="border-primary/20 bg-secondary/5">
        <CardHeader>
          <CardTitle className="font-display">Quick Equip Homebrew</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest">Adventurer</Label>
            <Select value={characterId} onValueChange={setCharacterId}>
              <SelectTrigger className="bg-secondary/20"><SelectValue placeholder="Select character..." /></SelectTrigger>
              <SelectContent>
                {state.characters.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest">Item Name</Label>
            <Input 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="e.g. Cloak of Protection" 
              className="bg-secondary/20"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest flex items-center gap-2">
              Description
              <Wand2 className="h-3 w-3 text-primary" />
            </Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Paste description for AI passive extraction..."
              rows={5}
              className="bg-secondary/20 text-xs"
            />
          </div>

          <Button
            onClick={handleEquip}
            disabled={parsing || !name.trim() || !characterId}
            className="w-full font-display"
          >
            {parsing ? <Sparkles className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            {parsing ? 'Forging...' : 'Equip Item'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
