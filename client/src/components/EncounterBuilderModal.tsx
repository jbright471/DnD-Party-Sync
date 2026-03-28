import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { Swords, Plus, Trash2, ArrowLeft, Play, Copy, ClipboardPaste } from 'lucide-react';
import { toast } from 'sonner';

interface Monster {
  name: string;
  hp: number;
  ac: number;
  initiative_mod: number;
  count: number;
}

interface Encounter {
  id: number;
  name: string;
  monsters: Monster[];
}

const EMPTY_MONSTER: Monster = { name: '', hp: 20, ac: 12, initiative_mod: 0, count: 1 };

interface EncounterBuilderProps {
  open: boolean;
  onClose: () => void;
  onStartEncounter: (id: number) => void;
}

export function EncounterBuilderModal({ open, onClose, onStartEncounter }: EncounterBuilderProps) {
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newEncounter, setNewEncounter] = useState<{ name: string; monsters: Monster[] }>({ name: '', monsters: [] });
  const [monsterForm, setMonsterForm] = useState<Monster>(EMPTY_MONSTER);

  useEffect(() => {
    if (open) fetchEncounters();
  }, [open]);

  const fetchEncounters = async () => {
    const res = await fetch('/api/encounters');
    const data = await res.json();
    setEncounters(Array.isArray(data) ? data : []);
  };

  const addMonster = () => {
    if (!monsterForm.name) return;
    setNewEncounter(prev => ({ ...prev, monsters: [...prev.monsters, { ...monsterForm }] }));
    setMonsterForm(EMPTY_MONSTER);
  };

  const removeMonster = (idx: number) => {
    setNewEncounter(prev => ({ ...prev, monsters: prev.monsters.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    if (!newEncounter.name || newEncounter.monsters.length === 0) return;
    const res = await fetch('/api/encounters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newEncounter)
    });
    if (res.ok) {
      setIsCreating(false);
      setNewEncounter({ name: '', monsters: [] });
      fetchEncounters();
    }
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/encounters/${id}`, { method: 'DELETE' });
    fetchEncounters();
  };

  const handleCopy = (enc: Encounter) => {
    navigator.clipboard.writeText(JSON.stringify({ name: enc.name, monsters: enc.monsters }, null, 2));
    toast.success(`"${enc.name}" copied to clipboard.`);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const data = JSON.parse(text);
      if (!data.name || !Array.isArray(data.monsters)) throw new Error();
      setNewEncounter({ name: data.name, monsters: data.monsters });
      setIsCreating(true);
      toast.success('Encounter pasted — review and save.');
    } catch {
      toast.error('Clipboard does not contain a valid encounter.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-4 border-b border-border shrink-0">
          <DialogTitle className="font-display flex items-center gap-2">
            <Swords className="h-5 w-5 text-primary" /> Encounter Library
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="p-4">
            {isCreating ? (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-wider text-gold">Encounter Name</Label>
                  <Input
                    value={newEncounter.name}
                    onChange={e => setNewEncounter({ ...newEncounter, name: e.target.value })}
                    placeholder="e.g. Ambush at the Old Oak"
                    className="text-sm"
                  />
                </div>

                <div className="bg-secondary/20 border border-border/60 p-4 rounded-lg space-y-3">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Add Monster</h4>
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <Input placeholder="Name" value={monsterForm.name} onChange={e => setMonsterForm({ ...monsterForm, name: e.target.value })} className="text-xs h-8" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" placeholder="HP" value={monsterForm.hp} onChange={e => setMonsterForm({ ...monsterForm, hp: parseInt(e.target.value) || 20 })} className="text-xs h-8" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" placeholder="AC" value={monsterForm.ac} onChange={e => setMonsterForm({ ...monsterForm, ac: parseInt(e.target.value) || 12 })} className="text-xs h-8" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" placeholder="Qty" value={monsterForm.count} onChange={e => setMonsterForm({ ...monsterForm, count: parseInt(e.target.value) || 1 })} className="text-xs h-8" />
                    </div>
                    <div className="col-span-1">
                      <Button size="icon" className="h-8 w-8" onClick={addMonster}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {newEncounter.monsters.map((m, i) => (
                      <div key={i} className="flex items-center justify-between bg-secondary/30 rounded p-2 text-xs">
                        <span className="font-bold">{m.count}x {m.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground">HP: {m.hp} | AC: {m.ac}</span>
                          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => removeMonster(i)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setIsCreating(false)} className="flex-1">
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!newEncounter.name || newEncounter.monsters.length === 0}
                    className="flex-1 font-display"
                  >
                    Save Encounter
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsCreating(true)}
                    className="flex-1 border-2 border-dashed border-border rounded-lg p-4 text-muted-foreground hover:text-primary hover:border-primary/50 transition-all font-bold uppercase tracking-widest text-xs"
                  >
                    + Create New Encounter
                  </button>
                  <button
                    onClick={handlePaste}
                    title="Paste encounter from clipboard"
                    className="border-2 border-dashed border-border rounded-lg px-4 text-muted-foreground hover:text-primary hover:border-primary/50 transition-all flex items-center gap-1.5 text-xs font-bold"
                  >
                    <ClipboardPaste className="h-4 w-4" /> Paste
                  </button>
                </div>

                {encounters.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground italic opacity-40 text-sm">
                    No encounters saved yet.
                  </div>
                ) : (
                  encounters.map(enc => (
                    <div
                      key={enc.id}
                      className="bg-secondary/20 border border-border rounded-lg p-4 flex items-center justify-between hover:border-primary/30 transition-colors"
                    >
                      <div>
                        <h4 className="font-display text-base font-bold text-foreground">{enc.name}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {(enc.monsters || []).map(m => `${m.count}x ${m.name}`).join(', ')}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => { onStartEncounter(enc.id); onClose(); }}
                          className="font-display text-xs"
                        >
                          <Play className="h-3 w-3 mr-1" /> Start
                        </Button>
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground" onClick={() => handleCopy(enc)} title="Copy encounter">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => handleDelete(enc.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
