import { useState, useEffect, useCallback } from 'react';
import { Zap, Plus, Trash2, Play, ToggleLeft, ToggleRight, Flame, Wind, Shield, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from './ui/select';
import { toast } from 'sonner';
import { useGame } from '../context/GameContext';
import socket from '../socket';

const CONDITIONS = [
  'Blinded','Charmed','Deafened','Exhaustion','Frightened','Grappled',
  'Incapacitated','Invisible','Paralyzed','Petrified','Poisoned',
  'Prone','Restrained','Stunned','Unconscious',
];
const DAMAGE_TYPES = [
  'acid','bludgeoning','cold','fire','force','lightning',
  'necrotic','piercing','poison','psychic','radiant','slashing','thunder',
];
const TRIGGER_PHASES = [
  { value: 'start_of_turn', label: 'Start of every turn' },
  { value: 'end_of_turn',   label: 'End of every turn' },
];

interface EffectDef {
  type: 'damage' | 'heal' | 'condition' | 'remove_condition' | 'buff';
  value?: number;
  damageType?: string;
  condition?: string;
  buffData?: { name: string; duration: number };
}

interface AutomationPreset {
  id: number;
  name: string;
  preset_type: string;
  trigger_phase: string | null;
  trigger_entity_id: number | null;
  effects_json: string;
  targets_json: string;
  is_active: number;
  aura_radius: number | null;
  description: string;
}

interface Target {
  id: number;
  type: 'character' | 'monster';
  name: string;
}

interface DmAutomationPanelProps {
  open: boolean;
  onClose: () => void;
}

// ── Effect row builder ──────────────────────────────────────────────────────

function EffectRow({
  effect,
  onChange,
  onRemove,
}: {
  effect: EffectDef;
  onChange: (e: EffectDef) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-1.5 p-2 rounded border border-border/40 bg-secondary/10">
      <Select value={effect.type} onValueChange={v => onChange({ type: v as EffectDef['type'] })}>
        <SelectTrigger className="h-7 w-32 text-xs bg-background/50">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="damage" className="text-xs">Damage</SelectItem>
          <SelectItem value="heal" className="text-xs">Heal</SelectItem>
          <SelectItem value="condition" className="text-xs">Apply Condition</SelectItem>
          <SelectItem value="remove_condition" className="text-xs">Remove Condition</SelectItem>
          <SelectItem value="buff" className="text-xs">Apply Buff</SelectItem>
        </SelectContent>
      </Select>

      {(effect.type === 'damage' || effect.type === 'heal') && (
        <Input
          type="number"
          min={0}
          className="h-7 w-20 text-xs bg-background/50"
          placeholder="Amount"
          value={effect.value ?? ''}
          onChange={e => onChange({ ...effect, value: parseInt(e.target.value) || 0 })}
        />
      )}
      {effect.type === 'damage' && (
        <Select
          value={effect.damageType || 'force'}
          onValueChange={v => onChange({ ...effect, damageType: v })}
        >
          <SelectTrigger className="h-7 w-28 text-xs bg-background/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAMAGE_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs capitalize">{t}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {(effect.type === 'condition' || effect.type === 'remove_condition') && (
        <Select
          value={effect.condition || ''}
          onValueChange={v => onChange({ ...effect, condition: v })}
        >
          <SelectTrigger className="h-7 w-36 text-xs bg-background/50">
            <SelectValue placeholder="Condition" />
          </SelectTrigger>
          <SelectContent>
            {CONDITIONS.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {effect.type === 'buff' && (
        <>
          <Input
            className="h-7 w-28 text-xs bg-background/50"
            placeholder="Buff name"
            value={effect.buffData?.name || ''}
            onChange={e => onChange({ ...effect, buffData: { name: e.target.value, duration: effect.buffData?.duration ?? 1 } })}
          />
          <Input
            type="number"
            min={1}
            className="h-7 w-16 text-xs bg-background/50"
            placeholder="Rounds"
            value={effect.buffData?.duration ?? 1}
            onChange={e => onChange({ ...effect, buffData: { name: effect.buffData?.name ?? '', duration: parseInt(e.target.value) || 1 } })}
          />
        </>
      )}

      <button onClick={onRemove} className="ml-auto shrink-0 text-muted-foreground/40 hover:text-destructive transition-colors p-0.5">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function DmAutomationPanel({ open, onClose }: DmAutomationPanelProps) {
  const { state } = useGame();
  const party = state.characters;
  const enemies = state.initiativeState.filter(e => e.entity_type === 'monster');

  const [presets, setPresets] = useState<AutomationPreset[]>([]);

  // ── Group Strike state ──
  const [strikeEffects, setStrikeEffects] = useState<EffectDef[]>([{ type: 'damage', value: 10, damageType: 'fire' }]);
  const [strikeTargets, setStrikeTargets] = useState<Set<string>>(new Set());
  const [saveAsName, setSaveAsName] = useState('');

  // ── New preset form (Macros / Aura tabs) ──
  const [showNewForm, setShowNewForm] = useState(false);
  const [newPreset, setNewPreset] = useState<Partial<AutomationPreset & { effectDefs: EffectDef[]; targetMode: string }>>({
    name: '', preset_type: 'group_action', trigger_phase: null,
    effectDefs: [{ type: 'damage', value: 5, damageType: 'fire' }],
    targetMode: 'party', description: '', aura_radius: null,
  });

  const fetchPresets = useCallback(() => {
    fetch('/api/automation').then(r => r.json()).then(setPresets).catch(() => {});
  }, []);

  useEffect(() => { if (open) fetchPresets(); }, [open, fetchPresets]);

  // ── Target helpers ──

  const allTargets: Target[] = [
    ...party.map(c => ({ id: parseInt(c.id), type: 'character' as const, name: c.name })),
    ...enemies.map(e => ({ id: e.id, type: 'monster' as const, name: e.entity_name })),
  ];

  const toggleTarget = (key: string) => {
    setStrikeTargets(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const selectAll = (type: 'party' | 'enemies' | 'all') => {
    const keys = allTargets
      .filter(t => type === 'all' || (type === 'party' ? t.type === 'character' : t.type === 'monster'))
      .map(t => `${t.type}:${t.id}`);
    setStrikeTargets(new Set(keys));
  };

  const resolvedTargets = allTargets.filter(t => strikeTargets.has(`${t.type}:${t.id}`));

  // ── Fire Group Strike ──

  const handleFireStrike = () => {
    if (strikeEffects.length === 0) return toast.error('Add at least one effect.');
    if (resolvedTargets.length === 0) return toast.error('Select at least one target.');
    socket.emit('apply_party_effect', {
      effects: strikeEffects,
      targets: resolvedTargets.map(t => ({ id: t.id, type: t.type })),
      actor: 'DM',
    });
    toast.success(`Applied ${strikeEffects.length} effect(s) to ${resolvedTargets.length} target(s).`);
  };

  const handleSaveStrikeAsMacro = async () => {
    if (!saveAsName.trim()) return toast.error('Enter a name for the macro.');
    await fetch('/api/automation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: saveAsName,
        preset_type: 'group_action',
        effects_json: strikeEffects,
        targets_json: resolvedTargets.length > 0
          ? resolvedTargets.map(t => ({ id: t.id, type: t.type }))
          : 'party',
      }),
    });
    setSaveAsName('');
    fetchPresets();
    toast.success(`Macro "${saveAsName}" saved.`);
  };

  // ── Preset actions ──

  const handleTogglePreset = async (preset: AutomationPreset) => {
    await fetch(`/api/automation/${preset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: preset.is_active ? 0 : 1 }),
    });
    fetchPresets();
  };

  const handleDeletePreset = async (id: number) => {
    await fetch(`/api/automation/${id}`, { method: 'DELETE' });
    fetchPresets();
    toast.success('Preset deleted.');
  };

  const handleFirePreset = (preset: AutomationPreset) => {
    socket.emit('trigger_automation', { presetId: preset.id, actor: 'DM' });
    toast.success(`Fired: ${preset.name}`);
  };

  // ── Save new preset ──

  const handleSaveNewPreset = async () => {
    if (!newPreset.name?.trim()) return toast.error('Name required.');
    await fetch('/api/automation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newPreset.name,
        preset_type: newPreset.preset_type || 'group_action',
        trigger_phase: newPreset.trigger_phase || null,
        effects_json: newPreset.effectDefs || [],
        targets_json: newPreset.targetMode === 'party' ? 'party'
          : newPreset.targetMode === 'enemies' ? 'enemies'
          : newPreset.targets_json || 'party',
        aura_radius: newPreset.aura_radius || null,
        description: newPreset.description || '',
      }),
    });
    setShowNewForm(false);
    setNewPreset({
      name: '', preset_type: 'group_action', trigger_phase: null,
      effectDefs: [{ type: 'damage', value: 5, damageType: 'fire' }],
      targetMode: 'party', description: '', aura_radius: null,
    });
    fetchPresets();
    toast.success('Preset saved.');
  };

  const macros = presets.filter(p => p.preset_type === 'group_action' || p.preset_type === 'turn_trigger');
  const auras  = presets.filter(p => p.preset_type === 'aura');

  const presetTypeBadge = (type: string) => {
    if (type === 'turn_trigger') return <Badge variant="outline" className="text-[8px] text-orange-400 border-orange-400/30">AUTO</Badge>;
    if (type === 'aura')        return <Badge variant="outline" className="text-[8px] text-purple-400 border-purple-400/30">AURA</Badge>;
    return <Badge variant="outline" className="text-[8px] text-primary border-primary/30">MACRO</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl bg-background border-primary/20 h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/40 shrink-0">
          <DialogTitle className="font-display flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" /> DM Automation Panel
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="strike" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-6 mt-3 shrink-0">
            <TabsTrigger value="strike" className="flex-1 text-xs"><Flame className="h-3 w-3 mr-1" />Group Strike</TabsTrigger>
            <TabsTrigger value="macros" className="flex-1 text-xs"><Play className="h-3 w-3 mr-1" />Saved Macros</TabsTrigger>
            <TabsTrigger value="auras" className="flex-1 text-xs"><Wind className="h-3 w-3 mr-1" />Aura Manager</TabsTrigger>
          </TabsList>

          {/* ── Group Strike ──────────────────────────────────────────────── */}
          <TabsContent value="strike" className="flex-1 overflow-auto px-6 py-4 space-y-4">
            {/* Target selector */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Targets</Label>
                <div className="flex gap-1 ml-auto">
                  {(['party', 'enemies', 'all'] as const).map(g => (
                    <button key={g} onClick={() => selectAll(g)}
                      className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-border/40 hover:bg-secondary/30 transition-colors text-muted-foreground hover:text-foreground">
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allTargets.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No characters or monsters in combat.</p>
                ) : (
                  allTargets.map(t => {
                    const key = `${t.type}:${t.id}`;
                    const selected = strikeTargets.has(key);
                    return (
                      <button
                        key={key}
                        onClick={() => toggleTarget(key)}
                        className={`px-2 py-1 rounded-full border text-xs font-semibold transition-all ${
                          selected
                            ? t.type === 'character'
                              ? 'bg-primary/20 border-primary text-primary'
                              : 'bg-destructive/20 border-destructive text-destructive'
                            : 'border-border/40 text-muted-foreground hover:border-primary/50 hover:text-foreground'
                        }`}
                      >
                        {t.name}
                        {t.type === 'monster' && <span className="ml-1 text-[8px] opacity-60">M</span>}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Effect builder */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Effects</Label>
              {strikeEffects.map((eff, idx) => (
                <EffectRow
                  key={idx}
                  effect={eff}
                  onChange={updated => setStrikeEffects(prev => prev.map((e, i) => i === idx ? updated : e))}
                  onRemove={() => setStrikeEffects(prev => prev.filter((_, i) => i !== idx))}
                />
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs border-dashed"
                onClick={() => setStrikeEffects(prev => [...prev, { type: 'damage', value: 0, damageType: 'fire' }])}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Effect
              </Button>
            </div>

            {/* Fire + Save */}
            <div className="flex gap-2 pt-2 border-t border-border/40">
              <Button
                className="flex-1 font-display"
                onClick={handleFireStrike}
                disabled={strikeEffects.length === 0 || resolvedTargets.length === 0}
              >
                <Flame className="h-4 w-4 mr-1" /> Fire! ({resolvedTargets.length})
              </Button>
            </div>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="Save as macro name..."
                value={saveAsName}
                onChange={e => setSaveAsName(e.target.value)}
                className="h-7 text-xs bg-background/50 flex-1"
              />
              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={handleSaveStrikeAsMacro}>
                Save Macro
              </Button>
            </div>
          </TabsContent>

          {/* ── Saved Macros ──────────────────────────────────────────────── */}
          <TabsContent value="macros" className="flex-1 flex flex-col min-h-0 px-6 py-4 gap-3">
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs border-dashed shrink-0"
              onClick={() => { setNewPreset(p => ({ ...p, preset_type: 'group_action' })); setShowNewForm(true); }}
            >
              <Plus className="h-3 w-3 mr-1" /> New Macro or Turn Trigger
            </Button>

            {showNewForm && (
              <div className="border border-primary/20 rounded-lg p-3 bg-secondary/5 space-y-2 shrink-0">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">Name</Label>
                    <Input value={newPreset.name || ''} onChange={e => setNewPreset(p => ({ ...p, name: e.target.value }))}
                      className="h-7 text-xs mt-0.5 bg-background/50" placeholder="Fireball Damage" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Type</Label>
                    <Select value={newPreset.preset_type || 'group_action'} onValueChange={v => setNewPreset(p => ({ ...p, preset_type: v }))}>
                      <SelectTrigger className="h-7 text-xs mt-0.5 bg-background/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="group_action" className="text-xs">Manual Macro</SelectItem>
                        <SelectItem value="turn_trigger" className="text-xs">Turn Trigger (auto)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {newPreset.preset_type === 'turn_trigger' && (
                  <div>
                    <Label className="text-[10px]">Trigger Phase</Label>
                    <Select value={newPreset.trigger_phase || ''} onValueChange={v => setNewPreset(p => ({ ...p, trigger_phase: v }))}>
                      <SelectTrigger className="h-7 text-xs mt-0.5 bg-background/50"><SelectValue placeholder="Select phase..." /></SelectTrigger>
                      <SelectContent>
                        {TRIGGER_PHASES.map(t => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label className="text-[10px]">Targets</Label>
                  <Select value={newPreset.targetMode || 'party'} onValueChange={v => setNewPreset(p => ({ ...p, targetMode: v }))}>
                    <SelectTrigger className="h-7 text-xs mt-0.5 bg-background/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="party" className="text-xs">All Party</SelectItem>
                      <SelectItem value="enemies" className="text-xs">All Enemies</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Effects</Label>
                  {(newPreset.effectDefs || []).map((eff, idx) => (
                    <EffectRow
                      key={idx}
                      effect={eff}
                      onChange={updated => setNewPreset(p => ({ ...p, effectDefs: (p.effectDefs || []).map((e, i) => i === idx ? updated : e) }))}
                      onRemove={() => setNewPreset(p => ({ ...p, effectDefs: (p.effectDefs || []).filter((_, i) => i !== idx) }))}
                    />
                  ))}
                  <Button variant="outline" size="sm" className="w-full h-6 text-[10px] border-dashed"
                    onClick={() => setNewPreset(p => ({ ...p, effectDefs: [...(p.effectDefs || []), { type: 'damage', value: 0, damageType: 'fire' }] }))}>
                    <Plus className="h-2.5 w-2.5 mr-1" /> Add Effect
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleSaveNewPreset}>Save Preset</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowNewForm(false)}>Cancel</Button>
                </div>
              </div>
            )}

            <ScrollArea className="flex-1">
              {macros.length === 0 ? (
                <p className="text-xs text-muted-foreground/40 italic text-center py-8">No macros saved yet.</p>
              ) : (
                <div className="space-y-1.5 pr-2">
                  {macros.map(preset => (
                    <div key={preset.id} className={`flex items-center gap-2 p-2.5 rounded border transition-colors ${preset.is_active ? 'border-border/40 bg-secondary/10' : 'border-border/20 bg-secondary/5 opacity-50'}`}>
                      {presetTypeBadge(preset.preset_type)}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">{preset.name}</div>
                        {preset.trigger_phase && (
                          <div className="text-[9px] text-orange-400/70">{preset.trigger_phase.replace('_', ' ')}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleTogglePreset(preset)} title={preset.is_active ? 'Disable' : 'Enable'}
                          className="text-muted-foreground hover:text-primary transition-colors">
                          {preset.is_active ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4" />}
                        </button>
                        {preset.preset_type === 'group_action' && (
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[9px]" onClick={() => handleFirePreset(preset)}>
                            <Play className="h-2.5 w-2.5 mr-0.5" /> Fire
                          </Button>
                        )}
                        <button onClick={() => handleDeletePreset(preset.id)} className="text-muted-foreground/40 hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* ── Aura Manager ─────────────────────────────────────────────── */}
          <TabsContent value="auras" className="flex-1 flex flex-col min-h-0 px-6 py-4 gap-3">
            <div className="flex items-start gap-2 p-2 rounded border border-muted/30 bg-muted/5 text-[10px] text-muted-foreground shrink-0">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              Auras fire automatically at the start of every turn. Set targets to Party or Enemies. Spatial proximity auto-calculation is Phase 12.
            </div>

            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs border-dashed shrink-0"
              onClick={() => { setNewPreset(p => ({ ...p, preset_type: 'aura' })); setShowNewForm(true); }}
            >
              <Plus className="h-3 w-3 mr-1" /> New Aura
            </Button>

            {showNewForm && newPreset.preset_type === 'aura' && (
              <div className="border border-primary/20 rounded-lg p-3 bg-secondary/5 space-y-2 shrink-0">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">Aura Name</Label>
                    <Input value={newPreset.name || ''} onChange={e => setNewPreset(p => ({ ...p, name: e.target.value }))}
                      className="h-7 text-xs mt-0.5 bg-background/50" placeholder="Lich Fear Aura" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Trigger Phase</Label>
                    <Select value={newPreset.trigger_phase || 'start_of_turn'} onValueChange={v => setNewPreset(p => ({ ...p, trigger_phase: v }))}>
                      <SelectTrigger className="h-7 text-xs mt-0.5 bg-background/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRIGGER_PHASES.map(t => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">Affects</Label>
                    <Select value={newPreset.targetMode || 'party'} onValueChange={v => setNewPreset(p => ({ ...p, targetMode: v }))}>
                      <SelectTrigger className="h-7 text-xs mt-0.5 bg-background/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="party" className="text-xs">All Party</SelectItem>
                        <SelectItem value="enemies" className="text-xs">All Enemies</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px]">Radius (squares)</Label>
                    <Input type="number" min={1} value={newPreset.aura_radius || ''}
                      onChange={e => setNewPreset(p => ({ ...p, aura_radius: parseInt(e.target.value) || null }))}
                      className="h-7 text-xs mt-0.5 bg-background/50" placeholder="e.g. 3" />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px]">Description (optional)</Label>
                  <Textarea value={newPreset.description || ''} onChange={e => setNewPreset(p => ({ ...p, description: e.target.value }))}
                    className="text-xs mt-0.5 bg-background/50 resize-none" rows={2} placeholder="Frightened on failed DC 15 WIS save..." />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Effects (applied each trigger)</Label>
                  {(newPreset.effectDefs || []).map((eff, idx) => (
                    <EffectRow
                      key={idx}
                      effect={eff}
                      onChange={updated => setNewPreset(p => ({ ...p, effectDefs: (p.effectDefs || []).map((e, i) => i === idx ? updated : e) }))}
                      onRemove={() => setNewPreset(p => ({ ...p, effectDefs: (p.effectDefs || []).filter((_, i) => i !== idx) }))}
                    />
                  ))}
                  <Button variant="outline" size="sm" className="w-full h-6 text-[10px] border-dashed"
                    onClick={() => setNewPreset(p => ({ ...p, effectDefs: [...(p.effectDefs || []), { type: 'condition', condition: 'Frightened' }] }))}>
                    <Plus className="h-2.5 w-2.5 mr-1" /> Add Effect
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleSaveNewPreset}>Save Aura</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowNewForm(false)}>Cancel</Button>
                </div>
              </div>
            )}

            <ScrollArea className="flex-1">
              {auras.length === 0 ? (
                <p className="text-xs text-muted-foreground/40 italic text-center py-8">No auras defined yet.</p>
              ) : (
                <div className="space-y-1.5 pr-2">
                  {auras.map(aura => {
                    let effects: EffectDef[] = [];
                    try { effects = JSON.parse(aura.effects_json); } catch {}
                    return (
                      <div key={aura.id} className={`p-2.5 rounded border transition-colors ${aura.is_active ? 'border-purple-800/40 bg-purple-950/10' : 'border-border/20 bg-secondary/5 opacity-50'}`}>
                        <div className="flex items-center gap-2">
                          <Wind className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate">{aura.name}</div>
                            <div className="text-[9px] text-muted-foreground">
                              {aura.trigger_phase?.replace('_', ' ')}
                              {aura.aura_radius ? ` · ${aura.aura_radius} sq radius` : ''}
                              {' · '}{effects.length} effect{effects.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                          <button onClick={() => handleTogglePreset(aura)} title={aura.is_active ? 'Disable' : 'Enable'}
                            className="text-muted-foreground hover:text-primary transition-colors">
                            {aura.is_active ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4" />}
                          </button>
                          <button onClick={() => handleDeletePreset(aura.id)} className="text-muted-foreground/40 hover:text-destructive transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {aura.description && (
                          <p className="text-[9px] text-muted-foreground/60 italic mt-1 pl-5">{aura.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
