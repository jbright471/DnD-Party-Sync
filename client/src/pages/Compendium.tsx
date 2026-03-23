import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ScrollText, Sparkles, Trash2, Wand2, Plus, Ghost, Flame } from 'lucide-react';
import { toast } from 'sonner';
import socket from '../socket';

export default function Compendium() {
  const { state } = useGame();
  const [name, setName] = useState('');
  const [type, setType] = useState('item');
  const [description, setDescription] = useState('');
  const [parsing, setParsing] = useState(false);
  const [entities, setEntities] = useState<any[]>([]);

  useEffect(() => {
    fetchEntities();
  }, []);

  const fetchEntities = async () => {
    try {
      const res = await fetch('/api/homebrew');
      const data = await res.json();
      setEntities(data);
    } catch (err) {
      console.error('Failed to fetch compendium:', err);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Name required');
      return;
    }

    try {
      setParsing(true);
      const res = await fetch('/api/homebrew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: type,
          name: name.trim(),
          description: description.trim(),
          stats_json: {}
        }),
      });

      if (!res.ok) throw new Error('Creation failed');
      
      toast.success(`${type} '${name}' added to compendium!`);
      setName('');
      setDescription('');
      fetchEntities();
    } catch (err) {
      toast.error('Failed to create entry');
    } finally {
      setParsing(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this entry?')) return;
    try {
      await fetch(`/api/homebrew/${id}`, { method: 'DELETE' });
      fetchEntities();
      toast.success('Entry removed');
    } catch (e) {
      toast.error('Delete failed');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <ScrollText className="h-7 w-7 text-primary" />
        <h1 className="text-3xl font-display tracking-wider">Compendium</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border-primary/20 bg-secondary/5 h-fit">
          <CardHeader>
            <CardTitle className="font-display text-lg">Create Entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="bg-secondary/20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="item">🛡️ Item</SelectItem>
                  <SelectItem value="monster">👹 Monster</SelectItem>
                  <SelectItem value="spell">🪄 Spell</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest">Name</Label>
              <Input 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="Name..." 
                className="bg-secondary/20"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest">Description</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe mechanics for AI parsing..."
                rows={6}
                className="bg-secondary/20 text-xs"
              />
            </div>

            <Button
              onClick={handleCreate}
              disabled={parsing || !name.trim()}
              className="w-full font-display"
            >
              {parsing ? <Sparkles className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Add to Compendium
            </Button>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {entities.map(entry => (
              <Card key={entry.id} className="bg-secondary/10 border-border/40">
                <CardContent className="p-4 flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {entry.entity_type === 'monster' ? <Ghost className="h-3 w-3 text-destructive" /> : 
                       entry.entity_type === 'spell' ? <Flame className="h-3 w-3 text-mana" /> : 
                       <Shield className="h-3 w-3 text-gold" />}
                      <span className="text-[10px] uppercase tracking-tighter text-muted-foreground">{entry.entity_type}</span>
                    </div>
                    <h3 className="font-display text-sm text-foreground">{entry.name}</h3>
                    <p className="text-[10px] text-muted-foreground line-clamp-3 mt-1">{entry.description}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => handleDelete(entry.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          {entities.length === 0 && (
            <div className="text-center py-20 bg-secondary/5 border border-dashed rounded-xl">
              <ScrollText className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-muted-foreground">Compendium is empty.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
