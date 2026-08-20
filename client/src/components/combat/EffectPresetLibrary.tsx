import { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../ui/sheet';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { ScrollArea } from '../ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Sparkles, Trash2, Search, Plus, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface EffectPresetLibraryProps {
  open: boolean;
  onClose: () => void;
}

interface EffectPreset {
  id: number;
  name: string;
  category: 'spell' | 'condition' | 'aura' | 'item' | 'environmental';
  effects: any[];
  description: string;
  is_locked: number;
}

export function EffectPresetLibrary({ open, onClose }: EffectPresetLibraryProps) {
  const { state, socket } = useGame();
  const [presets, setPresets] = useState<EffectPreset[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedPreset, setSelectedPreset] = useState<EffectPreset | null>(null);
  
  // Selection of targets
  const [selectedTargets, setSelectedTargets] = useState<Record<string, boolean>>({});

  // Creator state
  const [isCreating, setIsCreating] = useState(false);
  const [newPreset, setNewPreset] = useState({
    name: '',
    category: 'spell' as any,
    description: '',
    effectType: 'condition', // 'condition' | 'buff'
    condition: 'Poisoned',
    buffName: '',
    buffStat: 'ac',
    buffVal: '2',
    isConcentration: true,
  });

  const categories = [
    { value: 'all', label: 'All Categories' },
    { value: 'spell', label: 'Spells' },
    { value: 'condition', label: 'Conditions' },
    { value: 'aura', label: 'Auras' },
    { value: 'item', label: 'Magic Items' },
    { value: 'environmental', label: 'Environmental' },
  ];

  const standardConditions = [
    'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled',
    'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified',
    'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
  ];

  const statsList = [
    { value: 'ac', label: 'Armor Class (AC)' },
    { value: 'speed', label: 'Speed' },
    { value: 'all saves', label: 'All Saving Throws' },
    { value: 'str save', label: 'Strength Save' },
    { value: 'dex save', label: 'Dexterity Save' },
    { value: 'con save', label: 'Constitution Save' },
    { value: 'int save', label: 'Intelligence Save' },
    { value: 'wis save', label: 'Wisdom Save' },
    { value: 'cha save', label: 'Charisma Save' },
  ];

  // Fetch presets on open
  const fetchPresets = async () => {
    try {
      const res = await fetch('/api/effect-presets');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setPresets(data);
    } catch {
      toast.error('Could not load effect presets.');
    }
  };

  useEffect(() => {
    if (open) {
      fetchPresets();
      setSelectedPreset(null);
      setSelectedTargets({});
      setIsCreating(false);
    }
  }, [open]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPreset.name.trim()) return;

    let effects: any[] = [];
    if (newPreset.effectType === 'condition') {
      effects = [{ type: 'condition', condition: newPreset.condition }];
    } else {
      effects = [
        {
          type: 'buff',
          buffData: {
            name: newPreset.buffName || newPreset.name,
            modifierType: 'flatBonus',
            statAffected: newPreset.buffStat,
            modifierValue: newPreset.buffVal,
            isConcentration: newPreset.isConcentration,
            sourceName: newPreset.buffName || newPreset.name,
          },
        },
      ];
    }

    try {
      const res = await fetch('/api/effect-presets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newPreset.name,
          category: newPreset.category,
          description: newPreset.description,
          effects_json: JSON.stringify(effects),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create');
      }

      toast.success(`Preset "${newPreset.name}" created!`);
      setIsCreating(false);
      setNewPreset({
        name: '',
        category: 'spell',
        description: '',
        effectType: 'condition',
        condition: 'Poisoned',
        buffName: '',
        buffStat: 'ac',
        buffVal: '2',
        isConcentration: true,
      });
      fetchPresets();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete preset "${name}"?`)) return;
    try {
      const res = await fetch(`/api/effect-presets/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete');
      }

      toast.success('Preset deleted.');
      if (selectedPreset?.id === id) setSelectedPreset(null);
      fetchPresets();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleApply = () => {
    if (!selectedPreset || !socket) return;
    const targetIds = Object.entries(selectedTargets)
      .filter(([, selected]) => selected)
      .map(([key]) => {
        const [type, idStr] = key.split('-');
        return { id: parseInt(idStr, 10), type };
      });

    if (targetIds.length === 0) {
      toast.warning('Please select at least one target.');
      return;
    }

    socket.emit('apply_effect_preset', {
      presetId: selectedPreset.id,
      targetIds,
    });

    toast.success(`Applied ${selectedPreset.name} preset to ${targetIds.length} target(s).`);
    setSelectedTargets({});
  };

  const filteredPresets = presets.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const combatants = state.initiativeState || [];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md border-l border-primary/20 bg-card/95 backdrop-blur-md text-foreground flex flex-col p-6 overflow-hidden">
        <SheetHeader className="shrink-0 border-b border-border/40 pb-4">
          <SheetTitle className="text-xl font-display tracking-wider text-primary flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold" /> Effect Presets
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Apply pre-configured buffs and conditions to initiative combatants.
          </SheetDescription>
        </SheetHeader>

        {isCreating ? (
          /* PRESET CREATOR FORM */
          <form onSubmit={handleCreate} className="flex-1 flex flex-col gap-4 overflow-y-auto pt-4 pr-1">
            <div className="flex items-center gap-2 mb-2">
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={() => setIsCreating(false)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <h3 className="font-display text-sm text-gold">Create Preset</h3>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider">Preset Name</Label>
              <Input required placeholder="Bless, Shield of Faith, etc." value={newPreset.name} onChange={(e) => setNewPreset({ ...newPreset, name: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider">Category</Label>
                <Select value={newPreset.category} onValueChange={(v) => setNewPreset({ ...newPreset, category: v as any })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spell">Spell</SelectItem>
                    <SelectItem value="condition">Condition</SelectItem>
                    <SelectItem value="aura">Aura</SelectItem>
                    <SelectItem value="item">Item</SelectItem>
                    <SelectItem value="environmental">Environmental</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider">Effect Type</Label>
                <Select value={newPreset.effectType} onValueChange={(v) => setNewPreset({ ...newPreset, effectType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="condition">Condition</SelectItem>
                    <SelectItem value="buff">Stat Buff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {newPreset.effectType === 'condition' ? (
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider">Standard Condition</Label>
                <Select value={newPreset.condition} onValueChange={(v) => setNewPreset({ ...newPreset, condition: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {standardConditions.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-3 p-3 border border-border/30 bg-secondary/15 rounded-lg">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Buff Label</Label>
                  <Input placeholder="Name of spell/effect" value={newPreset.buffName} onChange={(e) => setNewPreset({ ...newPreset, buffName: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Stat Affected</Label>
                    <Select value={newPreset.buffStat} onValueChange={(v) => setNewPreset({ ...newPreset, buffStat: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statsList.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Flat Bonus Value</Label>
                    <Input placeholder="e.g. 2, 2.5, 1d4" value={newPreset.buffVal} onChange={(e) => setNewPreset({ ...newPreset, buffVal: e.target.value })} />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Switch checked={newPreset.isConcentration} onCheckedChange={(v) => setNewPreset({ ...newPreset, isConcentration: v })} />
                  <Label className="text-xs cursor-pointer">Requires Concentration</Label>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider">Description</Label>
              <Textarea placeholder="Flavour text or notes..." rows={3} value={newPreset.description} onChange={(e) => setNewPreset({ ...newPreset, description: e.target.value })} />
            </div>

            <Button type="submit" className="w-full mt-auto font-display bg-primary hover:bg-primary/95 text-primary-foreground">
              Save Preset
            </Button>
          </form>
        ) : selectedPreset ? (
          /* QUICK APPLY INTERFACE */
          <div className="flex-1 flex flex-col gap-4 overflow-hidden pt-4">
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={() => setSelectedPreset(null)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <h3 className="font-display text-sm text-gold">Apply Preset</h3>
            </div>

            <div className="p-3.5 border border-border/40 bg-secondary/15 rounded-lg shrink-0">
              <div className="flex justify-between items-start">
                <span className="text-sm font-bold font-display text-foreground">{selectedPreset.name}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-gold border border-primary/20 uppercase">
                  {selectedPreset.category}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{selectedPreset.description || 'No description provided.'}</p>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden min-h-[160px]">
              <span className="text-[9px] uppercase font-display text-muted-foreground tracking-wider mb-2 block">
                Select Targets in Combat
              </span>
              {combatants.length === 0 ? (
                <div className="flex-1 border border-dashed border-border/50 rounded-lg flex items-center justify-center text-xs text-muted-foreground/60 italic p-6 text-center">
                  Combat tracker is empty. Open encounter or spawn entities.
                </div>
              ) : (
                <ScrollArea className="flex-1 border border-border/30 bg-secondary/5 rounded-lg p-2">
                  <div className="space-y-1.5">
                    {combatants.map((c) => {
                      const isPc = c.entity_type === 'pc';
                      const targetKey = isPc ? `character-${c.character_id}` : `monster-${c.id}`;

                      return (
                        <div
                          key={c.id}
                          className="flex items-center justify-between p-2 rounded hover:bg-secondary/20 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`cb-${c.id}`}
                              checked={!!selectedTargets[targetKey]}
                              onCheckedChange={(val) =>
                                setSelectedTargets({
                                  ...selectedTargets,
                                  [targetKey]: !!val,
                                })
                              }
                            />
                            <label htmlFor={`cb-${c.id}`} className="text-xs font-medium cursor-pointer block text-foreground">
                              {c.entity_name}
                              <span className="text-[9px] text-muted-foreground ml-1.5 font-mono">
                                (HP: {c.current_hp}/{c.max_hp} · AC: {c.ac})
                              </span>
                            </label>
                          </div>
                          {isPc ? (
                            <span className="text-[8px] font-bold px-1 rounded bg-mana/10 text-mana border border-mana/20 uppercase">PC</span>
                          ) : (
                            <span className="text-[8px] font-bold px-1 rounded bg-rose-500/15 text-rose-400 border border-rose-500/20 uppercase">MOB</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>

            <Button
              onClick={handleApply}
              disabled={Object.values(selectedTargets).filter(Boolean).length === 0}
              className="w-full shrink-0 font-display bg-primary hover:bg-primary/95 text-primary-foreground"
            >
              Apply Preset Effect
            </Button>
          </div>
        ) : (
          /* MAIN SEARCHABLE PRESET LIST */
          <div className="flex-1 flex flex-col overflow-hidden pt-4 gap-4">
            <div className="flex gap-2 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/50" />
                <Input
                  placeholder="Search presets..."
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button size="icon" onClick={() => setIsCreating(true)} className="bg-primary hover:bg-primary/95 text-primary-foreground" title="Create Custom Preset">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Category tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1 shrink-0 scrollbar-none">
              {categories.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCategoryFilter(c.value)}
                  className={`px-2.5 py-1 text-[10px] rounded-full border shrink-0 font-display transition-all ${
                    categoryFilter === c.value
                      ? 'bg-primary/15 border-primary/40 text-gold'
                      : 'border-border/50 hover:bg-secondary/40 text-muted-foreground'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Preset Cards Scroll List */}
            <ScrollArea className="flex-1 pr-1">
              {filteredPresets.length === 0 ? (
                <div className="text-center py-12 text-xs text-muted-foreground italic">
                  No effect presets match your filters.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredPresets.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPreset(p)}
                      className="p-3 border border-border/50 bg-secondary/15 rounded-lg hover:border-primary/30 transition-all cursor-pointer flex justify-between items-start gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold font-display text-foreground block truncate">{p.name}</span>
                          <span className="text-[8px] font-bold px-1 rounded bg-secondary text-muted-foreground border border-border/40 uppercase">
                            {p.category}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{p.description || 'No description.'}</p>
                      </div>

                      {p.is_locked === 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(p.id, p.name);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
