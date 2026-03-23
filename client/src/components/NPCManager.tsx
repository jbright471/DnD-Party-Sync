import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { Plus, Pencil, Trash2, MapPin, Briefcase, AlertTriangle } from 'lucide-react';

interface NPC {
  id: number;
  name: string;
  race: string;
  description: string;
  occupation: string;
  location: string;
  secrets: string;
  notes: string;
}

const EMPTY_FORM = { name: '', race: '', description: '', occupation: '', location: '', secrets: '', notes: '' };

interface NPCManagerProps {
  open: boolean;
  onClose: () => void;
  isDm?: boolean;
}

export function NPCManager({ open, onClose, isDm = true }: NPCManagerProps) {
  const [npcs, setNpcs] = useState<NPC[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<NPC | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);

  useEffect(() => {
    if (open) fetchNpcs();
  }, [open]);

  const fetchNpcs = async () => {
    try {
      const res = await fetch('/api/npcs');
      setNpcs(await res.json());
    } catch (e) {}
  };

  const handleSave = async () => {
    if (!form.name) return;
    const method = selected?.id ? 'PATCH' : 'POST';
    const url = selected?.id ? `/api/npcs/${selected.id}` : '/api/npcs';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    if (res.ok) {
      fetchNpcs();
      setIsEditing(false);
      if (!selected?.id) setForm(EMPTY_FORM);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this NPC permanently?')) return;
    const res = await fetch(`/api/npcs/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setNpcs(npcs.filter(n => n.id !== id));
      setSelected(null);
    }
  };

  const filtered = npcs.filter(n =>
    n.name.toLowerCase().includes(search.toLowerCase()) ||
    (n.occupation || '').toLowerCase().includes(search.toLowerCase()) ||
    (n.location || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 flex flex-col gap-0">
        <DialogHeader className="p-4 border-b border-border shrink-0">
          <DialogTitle className="font-display text-xl">NPC Archive</DialogTitle>
        </DialogHeader>
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 border-r border-border flex flex-col shrink-0 bg-secondary/10">
            <div className="p-3 border-b border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Roster</span>
                {isDm && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => { setSelected(null); setForm(EMPTY_FORM); setIsEditing(true); }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <Input
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
            <ScrollArea className="flex-1">
              {filtered.map(n => (
                <button
                  key={n.id}
                  onClick={() => { setSelected(n); setForm(n); setIsEditing(false); }}
                  className={`w-full p-3 text-left border-b border-border/30 transition-all hover:bg-secondary/20 ${
                    selected?.id === n.id ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                  }`}
                >
                  <div className="text-sm font-bold text-foreground">{n.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{n.occupation || 'Wanderer'} · {n.location || 'Unknown'}</div>
                </button>
              ))}
            </ScrollArea>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-hidden">
            {!selected && !isEditing ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-30 italic">
                <span className="text-6xl mb-4">📜</span>
                <p>Select an NPC or create a new one.</p>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="p-6">
                  {isEditing ? (
                    <div className="max-w-2xl space-y-4">
                      <h2 className="font-display text-2xl text-primary">{selected ? 'Edit NPC' : 'Register New NPC'}</h2>
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          { key: 'name', label: 'Full Name' },
                          { key: 'race', label: 'Race / Ancestry' },
                          { key: 'occupation', label: 'Occupation' },
                          { key: 'location', label: 'Current Location' },
                        ].map(({ key, label }) => (
                          <div key={key} className="space-y-1">
                            <Label className="text-[10px] uppercase tracking-wider">{label}</Label>
                            <Input
                              value={(form as any)[key]}
                              onChange={e => setForm({ ...form, [key]: e.target.value })}
                              className="text-sm"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wider">Public Description</Label>
                        <Textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                      </div>
                      {isDm && (
                        <>
                          <div className="space-y-1 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                            <Label className="text-[10px] uppercase tracking-wider text-destructive flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> DM Secrets
                            </Label>
                            <Textarea rows={3} value={form.secrets} onChange={e => setForm({ ...form, secrets: e.target.value })} placeholder="Hidden motives, true identity..." className="bg-background/50" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase tracking-wider">Campaign Notes</Label>
                            <Textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Interactions, current mood..." />
                          </div>
                        </>
                      )}
                      <div className="flex gap-3 pt-2">
                        <Button onClick={handleSave} className="font-display">Save</Button>
                        <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                      </div>
                    </div>
                  ) : selected && (
                    <div className="max-w-3xl space-y-6">
                      <div className="flex items-start justify-between">
                        <div>
                          <h1 className="font-display text-4xl text-foreground">{selected.name}</h1>
                          <div className="flex gap-3 mt-2">
                            <span className="text-gold text-xs font-bold uppercase tracking-wider">{selected.race}</span>
                            <span className="text-muted-foreground text-xs">|</span>
                            <span className="text-mana text-xs font-bold uppercase tracking-wider">{selected.occupation}</span>
                          </div>
                        </div>
                        {isDm && (
                          <div className="flex gap-2">
                            <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setIsEditing(true)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="destructive" className="h-9 w-9" onClick={() => handleDelete(selected.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-2 space-y-6">
                          <section>
                            <h4 className="text-[10px] text-gold uppercase font-bold tracking-widest mb-3 border-b border-gold/20 pb-1">Description</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap font-serif italic">{selected.description || 'No description provided.'}</p>
                          </section>
                          {isDm && selected.secrets && (
                            <section className="bg-destructive/5 border-l-4 border-destructive/40 p-4 rounded">
                              <h4 className="text-[10px] text-destructive uppercase font-bold tracking-widest mb-2">⚠️ DM Secrets</h4>
                              <p className="text-sm text-foreground/80 italic leading-relaxed whitespace-pre-wrap">{selected.secrets}</p>
                            </section>
                          )}
                          {isDm && selected.notes && (
                            <section>
                              <h4 className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-2 border-b border-border pb-1">Notes</h4>
                              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{selected.notes}</p>
                            </section>
                          )}
                        </div>
                        <aside className="space-y-4">
                          <div className="bg-secondary/30 border border-border rounded-lg p-4 text-center">
                            <MapPin className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Location</div>
                            <div className="font-display text-sm">{selected.location || 'Unknown'}</div>
                          </div>
                          <div className="bg-secondary/30 border border-border rounded-lg p-4 text-center">
                            <Briefcase className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Role</div>
                            <div className="font-display text-sm">{selected.occupation || 'Civilian'}</div>
                          </div>
                        </aside>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
