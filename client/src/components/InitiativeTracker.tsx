import { useState, useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import {
  Swords, SkipForward, SkipBack, StopCircle, Shield, Skull,
  Plus, ChevronUp, ChevronDown, Eye, EyeOff, Zap, Loader2, Settings2, History,
  Pin, Users, Radio, Save,
} from 'lucide-react';
import { toast } from 'sonner';
import socket from '../socket';
import { CombatReportModal } from './CombatReportModal';
import { AoEEffectModal, type AoETarget } from './AoEEffectModal';
import { CombatantSidebar } from './CombatantSidebar';
import { CombatRecoveryModal } from './CombatRecoveryModal';
import { SidebarSheetMini } from './combat/SidebarSheetMini';
import { BossPhaseControls, type BossPhase } from './BossPhaseControls';

// ─── Sorting Utility ─────────────────────────────────────────────────────────

export interface Combatant {
  id: number;
  entity_name: string;
  entity_type: 'pc' | 'monster' | 'npc';
  initiative: number;
  current_hp: number | null;
  max_hp: number | null;
  ac: number | null;
  is_active: number;
  is_hidden: number;
  sort_order: number;
  character_id: number | null;
  instance_id: string | null;
  conditions: string[];
  concentrating_on: string | null;
  hp_status: string;
  stats_json: Record<string, any> | null;
  buffs: Array<Record<string, unknown>>;
  boss_phases: BossPhase[];
  current_phase_index: number;
  phase_name: string | null;
}

/**
 * Sort combatants descending by initiative score.
 * Ties preserve existing sort_order (stable sort) so DM can manually reorder.
 */
export function sortInitiative(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    return a.sort_order - b.sort_order; // tie-break by current order
  });
}

// ─── Inline Add Monster Form ─────────────────────────────────────────────────

function InlineSpawner({ onSpawn }: { onSpawn: (data: { name: string; hp: number; ac: number; initiative_mod: number; is_hidden: boolean }) => void }) {
  const [name, setName] = useState('');
  const [hp, setHp] = useState(10);
  const [ac, setAc] = useState(10);
  const [initMod, setInitMod] = useState(0);
  const [isHidden, setIsHidden] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSpawn({ name: name.trim(), hp, ac, initiative_mod: initMod, is_hidden: isHidden });
    setName('');
    setHp(10);
    setAc(10);
    setInitMod(0);
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-1.5 p-2 rounded-lg bg-secondary/20 border border-border/30">
      <div className="flex-1 min-w-0 space-y-0.5">
        <label className="text-[8px] uppercase tracking-wider text-muted-foreground/60 font-bold">Name</label>
        <Input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Goblin..."
          className="h-7 text-xs"
          required
        />
      </div>
      <div className="w-14 space-y-0.5">
        <label className="text-[8px] uppercase tracking-wider text-muted-foreground/60 font-bold">HP</label>
        <Input type="number" value={hp} onChange={e => setHp(parseInt(e.target.value) || 0)} className="h-7 text-xs text-center" />
      </div>
      <div className="w-12 space-y-0.5">
        <label className="text-[8px] uppercase tracking-wider text-muted-foreground/60 font-bold">AC</label>
        <Input type="number" value={ac} onChange={e => setAc(parseInt(e.target.value) || 0)} className="h-7 text-xs text-center" />
      </div>
      <div className="w-12 space-y-0.5">
        <label className="text-[8px] uppercase tracking-wider text-muted-foreground/60 font-bold">Init</label>
        <Input type="number" value={initMod} onChange={e => setInitMod(parseInt(e.target.value) || 0)} className="h-7 text-xs text-center" />
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setIsHidden(!isHidden)}
            className={`h-7 w-7 flex items-center justify-center rounded border shrink-0 transition-colors ${
              isHidden ? 'bg-violet-500/20 border-violet-500/40 text-violet-400' : 'bg-secondary/30 border-border/30 text-muted-foreground/40'
            }`}
          >
            {isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[10px]">
          {isHidden ? 'Hidden from players' : 'Visible to players'}
        </TooltipContent>
      </Tooltip>
      <Button type="submit" size="sm" className="h-7 px-2 shrink-0">
        <Plus className="h-3 w-3" />
      </Button>
    </form>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function InitiativeTracker() {
  const { state } = useGame();
  const tracker = (state.initiativeState || []) as Combatant[];
  const members = state.characters || [];
  const roundNumber = state.roundNumber || 1;
  const isDm = state.isDm;
  const [showSpawner, setShowSpawner] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showAoE, setShowAoE] = useState(false);
  const [sidebarCombatant, setSidebarCombatant] = useState<Combatant | null>(null);
  const [reportData, setReportData] = useState<{
    report: string | null;
    events: Array<{ round: number; actor: string; action: string; target: string; detail: string }>;
    survivors: Array<{ name: string; type: string; hp: number; maxHp: number; conditions: string[] }>;
    totalRounds: number;
  } | null>(null);
  const [showReport, setShowReport] = useState(false);
  const activeRef = useRef<HTMLDivElement>(null);

  // Aura-Sync & Smart Pins State
  const [activeAuras, setActiveAuras] = useState<any[]>([]);
  const [smartPins, setSmartPins] = useState<any[]>([]);
  const [showAuraPanel, setShowAuraPanel] = useState(false);
  const [showAuraSpawner, setShowAuraSpawner] = useState(false);
  const [showMiniatures, setShowMiniatures] = useState(false);
  const [newAuraName, setNewAuraName] = useState('');
  const [newAuraCaster, setNewAuraCaster] = useState('');
  const [newAuraRadius, setNewAuraRadius] = useState(30);
  const [newAuraType, setNewAuraType] = useState('bless');
  const [newAuraValue, setNewAuraValue] = useState(2);

  // Sync active auras and smart pins from WebSocket
  useEffect(() => {
    socket.on('active_auras_sync', (auras: any[]) => {
      setActiveAuras(auras);
    });

    socket.on('combat_smart_pins_sync', (pins: any[]) => {
      setSmartPins(pins);
    });

    socket.emit('refresh_party');

    return () => {
      socket.off('active_auras_sync');
      socket.off('combat_smart_pins_sync');
    };
  }, []);

  const handleSaveAura = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAuraName.trim()) return;

    let buffData: any = {};
    if (newAuraType === 'bless') {
      buffData = { name: 'Bless', modifierType: 'flatBonus', statAffected: 'all saves', modifierValue: 2.5 };
    } else if (newAuraType === 'bane') {
      buffData = { name: 'Bane', modifierType: 'flatBonus', statAffected: 'all saves', modifierValue: -2.5 };
    } else if (newAuraType === 'custom_saves') {
      buffData = { name: newAuraName, modifierType: 'flatBonus', statAffected: 'all saves', modifierValue: newAuraValue };
    } else if (newAuraType === 'custom_ac') {
      buffData = { name: newAuraName, modifierType: 'flatBonus', statAffected: 'ac', modifierValue: newAuraValue };
    }

    const caster = tracker.find(ent => String(ent.id) === String(newAuraCaster) || ent.instance_id === newAuraCaster);

    const aura = {
      id: newAuraName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
      name: newAuraName,
      casterId: caster?.character_id || null,
      casterName: caster?.entity_name || 'System',
      radius: newAuraRadius,
      active: true,
      buffData,
      targets: tracker.filter(ent => ent.entity_type === 'pc').map(ent => ent.character_id).filter(Boolean)
    };

    socket.emit('save_aura', aura);
    setNewAuraName('');
    setShowAuraSpawner(false);
    toast.success(`Created aura: ${newAuraName}`);
  };

  const handleToggleAuraTarget = (auraId: string, targetId: number) => {
    const aura = activeAuras.find(a => a.id === auraId);
    if (!aura) return;
    const currentTargets = [...(aura.targets || [])];
    const idx = currentTargets.indexOf(targetId);
    if (idx >= 0) {
      currentTargets.splice(idx, 1);
    } else {
      currentTargets.push(targetId);
    }
    socket.emit('update_aura_targets', { auraId, targets: currentTargets });
  };

  // Auto-scroll to active combatant when turn changes
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [tracker.find(e => e.is_active)?.id]);

  const isCombatActive = tracker.length > 0;
  const activeEntity = tracker.find(e => e.is_active);
  const activeIndex = tracker.findIndex(e => e.is_active);

  const handleStartCombat = () => socket.emit('start_encounter', { encounterId: 1 });
  const handleEndCombat = () => {
    if (!confirm('End combat? An AI battle report will be generated.')) return;
    setIsEnding(true);
    socket.emit('end_encounter', (res: { success: boolean; error?: string; report?: string | null; events?: any[]; survivors?: any[]; totalRounds?: number }) => {
      setIsEnding(false);
      if (res.success) {
        setReportData({
          report: res.report ?? null,
          events: res.events ?? [],
          survivors: res.survivors ?? [],
          totalRounds: res.totalRounds ?? 0,
        });
        setShowReport(true);
        toast.success('Combat ended — report ready!');
      } else {
        toast.error('Error ending combat: ' + (res.error || 'Unknown'));
      }
    });
  };
  const handleNextTurn = () => socket.emit('next_turn');
  const handlePrevTurn = () => socket.emit('prev_turn');
  const handleSetInitiative = (trackerId: number, val: number) => socket.emit('set_initiative', { trackerId, initiative: val });
  const handleReorder = (trackerId: number, direction: 'up' | 'down') => socket.emit('reorder_initiative', { trackerId, direction });

  const handleSpawn = (data: { name: string; hp: number; ac: number; initiative_mod: number; is_hidden: boolean }) => {
    socket.emit('spawn_monster', data);
  };

  const handleAutoRoll = () => {
    socket.emit('auto_roll_initiative');
  };

  const handleDismissDead = () => {
    socket.emit('dismiss_dead');
    socket.once('dismiss_dead_result', ({ dismissed }: { dismissed: number }) => {
      toast.success(dismissed > 0 ? `Dismissed ${dismissed} dead combatant${dismissed !== 1 ? 's' : ''}.` : 'No dead combatants to dismiss.');
    });
  };

  const handleClearConditions = () => {
    socket.emit('clear_all_conditions');
    socket.once('clear_conditions_result', ({ cleared }: { cleared: number }) => {
      toast.success(cleared > 0 ? `Cleared conditions from ${cleared} character${cleared !== 1 ? 's' : ''}.` : 'No conditions to clear.');
    });
  };

  useEffect(() => {
    const handler = ({ rolls }: { rolls: Array<{ name: string; initiative: number }> }) => {
      const summary = rolls.map(r => `${r.name}: ${r.initiative}`).join(', ');
      toast.success(`Initiative rolled — ${summary}`);
    };
    socket.on('auto_roll_result', handler);
    return () => { socket.off('auto_roll_result', handler); };
  }, []);

  const handleHpDelta = (trackerId: number, delta: number) => {
    socket.emit('update_initiative_hp', { trackerId, delta });
  };

  const toggleSelected = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedAoETargets: AoETarget[] = tracker
    .filter(ent => selectedIds.has(ent.id))
    .map(ent => ({
      trackerId: ent.id,
      name: ent.entity_name,
      entityType: ent.entity_type,
      characterId: ent.character_id,
    }));

  // ── Empty State ──
  if (!isCombatActive) {
    return (
      <>
      <Card className="border-primary/20 bg-secondary/5">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Swords className="h-5 w-5 text-primary" />
              <span className="font-display text-lg">Combat Tracker</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button onClick={() => setShowMiniatures(true)} variant="outline" size="sm" className="h-8 text-xs font-display">
                <Users className="h-3.5 w-3.5 mr-1" /> Miniatures
              </Button>
              {isDm && (
                <Button onClick={() => setShowRecovery(true)} variant="outline" size="sm" className="h-8 text-xs font-display">
                  <History className="h-3.5 w-3.5 mr-1" /> Snapshots
                </Button>
              )}
              <Button onClick={handleStartCombat} size="sm" className="font-display h-8">
                <Swords className="h-4 w-4 mr-1" /> Start Combat
              </Button>
            </div>
          </div>
          {/* Allow pre-spawning monsters before combat starts */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSpawner(v => !v)}
            className="w-full text-xs text-muted-foreground"
          >
            <Plus className="h-3 w-3 mr-1" /> Add Monster / NPC
          </Button>
          {showSpawner && <InlineSpawner onSpawn={handleSpawn} />}
        </CardContent>
      </Card>
      <CombatReportModal
        open={showReport}
        onClose={() => setShowReport(false)}
        data={reportData}
      />
      <AoEEffectModal
        open={showAoE}
        onClose={() => { setShowAoE(false); setSelectedIds(new Set()); }}
        targets={selectedAoETargets}
      />
      <CombatRecoveryModal
        open={showRecovery}
        onOpenChange={setShowRecovery}
      />
      <SidebarSheetMini
        open={showMiniatures}
        onClose={() => setShowMiniatures(false)}
      />
      </>
    );
  }

  // ── Active Combat ──
  return (
    <Card className="border-primary/20 bg-secondary/5 overflow-hidden">
      {/* Header */}
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display flex items-center gap-2 text-primary">
            <Swords className="h-5 w-5" />
            Initiative
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-[9px] font-mono">
                R{roundNumber}
              </Badge>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="p-0.5 rounded text-muted-foreground/40 hover:text-primary transition-colors shrink-0 animate-pulse-glow" title="Round notes">
                    <Pin className="h-3 w-3 rotate-45" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="center" className="w-64 p-3 bg-popover/95 backdrop-blur border-primary/20 space-y-2 font-body text-xs relative z-50">
                  <div className="flex items-center justify-between border-b border-border/30 pb-1">
                    <span className="font-display font-bold text-primary flex items-center gap-1 text-[11px]">
                      <Pin className="h-3 w-3 rotate-45" /> Round {roundNumber} Notes
                    </span>
                  </div>
                  <RoundNoteEditor
                    round={roundNumber}
                    pins={smartPins}
                    isDm={isDm}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMiniatures(true)}
              className="h-7 px-2 text-[10px] text-muted-foreground hover:text-primary"
              title="Player Miniatures Drawer"
            >
              <Users className="h-3 w-3 mr-1" /> Miniatures
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAuraPanel(v => !v)}
              className={`h-7 px-2 text-[10px] ${showAuraPanel ? 'bg-primary/20 text-primary border border-primary/30' : 'text-muted-foreground'}`}
              title="Aura-Sync Panel"
            >
              <Zap className="h-3 w-3 mr-1" /> Auras
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSpawner(v => !v)}
              className="h-7 px-2 text-[10px]"
              title="Add Monster/NPC"
            >
              <Plus className="h-3 w-3" />
            </Button>
            {isDm && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAutoRoll}
                    className="h-7 px-2 text-[10px] text-muted-foreground hover:text-primary"
                    title="Auto-roll initiative for all combatants"
                  >
                    <Swords className="h-3 w-3 mr-1" />
                    Roll
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">
                  Re-roll initiative for all combatants (d20 + DEX mod)
                </TooltipContent>
              </Tooltip>
            )}
            {isDm && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRecovery(true)}
                    className="h-7 px-2 text-[10px] text-muted-foreground hover:text-primary"
                    title="Snapshots & Rollbacks"
                  >
                    <History className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">
                  Encounter Snapshots & Rollbacks
                </TooltipContent>
              </Tooltip>
            )}
            {isDm && (
              <Popover open={showQuickActions} onOpenChange={setShowQuickActions}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[10px] text-muted-foreground hover:text-primary"
                    title="Quick combat actions"
                  >
                    <Settings2 className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="end" className="w-44 p-1.5 space-y-0.5">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 font-bold px-2 pb-1">Quick Actions</p>
                  <button
                    onClick={() => { handleDismissDead(); setShowQuickActions(false); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-secondary/50 text-left transition-colors"
                  >
                    <Skull className="h-3 w-3 text-muted-foreground/60" />
                    Dismiss Dead
                  </button>
                  <button
                    onClick={() => { handleClearConditions(); setShowQuickActions(false); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-secondary/50 text-left transition-colors"
                  >
                    <Shield className="h-3 w-3 text-muted-foreground/60" />
                    Clear All Conditions
                  </button>
                  <button
                    onClick={() => { setShowRecovery(true); setShowQuickActions(false); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-secondary/50 text-left transition-colors"
                  >
                    <History className="h-3 w-3 text-muted-foreground/60" />
                    Snapshots & Rollbacks
                  </button>
                  <button
                    onClick={() => {
                      socket.emit('save_pins_to_template', { encounterId: 1 });
                      setShowQuickActions(false);
                      toast.success('Encounter notes saved to template!');
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-secondary/50 text-left transition-colors"
                  >
                    <Save className="h-3 w-3 text-muted-foreground/60" />
                    Save Notes to Template
                  </button>
                </PopoverContent>
              </Popover>
            )}
            {isDm && selectedIds.size > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    onClick={() => setShowAoE(true)}
                    className="h-7 px-2 text-[10px] bg-orange-600/80 hover:bg-orange-600 text-white border-orange-500/40 uppercase tracking-wider"
                  >
                    <Zap className="h-3 w-3 mr-1" />
                    AoE
                    <Badge className="ml-1 h-3.5 min-w-[1rem] px-1 text-[8px] bg-white/20 text-white">
                      {selectedIds.size}
                    </Badge>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">
                  Apply area effect to {selectedIds.size} selected target{selectedIds.size !== 1 ? 's' : ''}
                </TooltipContent>
              </Tooltip>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={handleEndCombat}
              disabled={isEnding}
              className="h-7 text-[10px] uppercase tracking-wider"
            >
              {isEnding
                ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Ending...</>
                : <><StopCircle className="h-3 w-3 mr-1" /> End</>
              }
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-1 pt-0">
        {/* Aura Panel Collapsible Section */}
        {showAuraPanel && (
          <div className="p-3 bg-secondary/15 border border-border/30 rounded-lg space-y-3 mb-2 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-wider text-primary font-bold font-display flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-400" /> Aura-Sync Panel
              </h3>
              {isDm && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAuraSpawner(!showAuraSpawner)}
                  className="h-6 text-[10px]"
                >
                  {showAuraSpawner ? 'Cancel' : '+ Add Aura'}
                </Button>
              )}
            </div>

            {showAuraSpawner && (
              <form onSubmit={handleSaveAura} className="space-y-2.5 p-2 bg-secondary/20 border border-border/30 rounded">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-bold">Aura Name</label>
                    <Input
                      value={newAuraName}
                      onChange={e => setNewAuraName(e.target.value)}
                      placeholder="Bless, Bane, Custom..."
                      className="h-8 text-xs bg-popover"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-bold">Preset Type</label>
                    <select
                      value={newAuraType}
                      onChange={e => {
                        setNewAuraType(e.target.value);
                        if (e.target.value === 'bless') setNewAuraName('Bless');
                        else if (e.target.value === 'bane') setNewAuraName('Bane');
                      }}
                      className="w-full h-8 bg-popover border border-input text-xs rounded px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="bless">Bless (+1d4 saves/attacks)</option>
                      <option value="bane">Bane (-1d4 saves/attacks)</option>
                      <option value="custom_saves">Custom saves bonus</option>
                      <option value="custom_ac">Custom AC bonus</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-bold">Caster</label>
                    <select
                      value={newAuraCaster}
                      onChange={e => setNewAuraCaster(e.target.value)}
                      className="w-full h-8 bg-popover border border-input text-xs rounded px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">None</option>
                      {tracker.map(ent => (
                        <option key={ent.id} value={ent.id}>{ent.entity_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-bold">Radius (ft)</label>
                    <Input
                      type="number"
                      value={newAuraRadius}
                      onChange={e => setNewAuraRadius(parseInt(e.target.value) || 10)}
                      className="h-8 text-xs bg-popover"
                    />
                  </div>
                  {newAuraType.startsWith('custom') && (
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-bold">Value</label>
                      <Input
                        type="number"
                        value={newAuraValue}
                        onChange={e => setNewAuraValue(parseInt(e.target.value) || 0)}
                        className="h-8 text-xs bg-popover"
                      />
                    </div>
                  )}
                </div>

                <Button type="submit" size="sm" className="w-full h-8 font-display uppercase tracking-wider text-[10px]">
                  Activate Aura
                </Button>
              </form>
            )}

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {activeAuras.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/60 italic text-center py-2">No active spell or paladin auras.</p>
              ) : (
                activeAuras.map(aura => {
                  const casterName = aura.casterName || 'System';
                  const isActive = !!aura.active;

                  return (
                    <div key={aura.id} className={`flex items-center justify-between p-2 rounded bg-secondary/30 border border-border/30 transition-all ${isActive ? 'border-l-2 border-l-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.05)]' : 'opacity-55'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold font-display ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>{aura.name}</span>
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1 font-mono">{aura.radius} ft</Badge>
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">
                          Caster: <span className="text-primary/70">{casterName}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-muted-foreground hover:text-primary transition-colors">
                              <Users className="h-3 w-3 mr-1" /> Targets ({aura.targets?.length || 0})
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent side="bottom" className="w-48 p-2 space-y-1.5 border-primary/20 bg-popover/95 backdrop-blur z-50">
                            <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 font-bold px-1">Affected Targets</p>
                            <div className="max-h-40 overflow-y-auto space-y-0.5">
                              {tracker.filter(ent => ent.character_id).map(ent => {
                                const targetId = ent.character_id!;
                                const isAffected = aura.targets?.includes(targetId);
                                return (
                                  <label key={ent.id} className="flex items-center gap-2 p-1 rounded hover:bg-secondary/40 text-xs cursor-pointer transition-colors">
                                    <input
                                      type="checkbox"
                                      checked={isAffected}
                                      onChange={() => handleToggleAuraTarget(aura.id, targetId)}
                                      className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
                                    />
                                    <span className={isAffected ? 'text-primary font-semibold' : 'text-foreground/70'}>{ent.entity_name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </PopoverContent>
                        </Popover>

                        <button
                          onClick={() => socket.emit('toggle_aura', { auraId: aura.id, active: !isActive })}
                          className={`w-7 h-4 rounded-full relative transition-colors ${isActive ? 'bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'bg-muted-foreground/30'}`}
                          title="Toggle activation"
                        >
                          <div className={`w-3 h-3 rounded-full bg-white absolute top-[2px] transition-all ${isActive ? 'left-[12px]' : 'left-[2px]'}`} />
                        </button>

                        {isDm && (
                          <button
                            onClick={() => socket.emit('delete_aura', { id: aura.id })}
                            className="text-destructive/60 hover:text-destructive p-1 rounded hover:bg-destructive/10 transition-colors"
                            title="Delete aura"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Inline spawner */}
        {showSpawner && <InlineSpawner onSpawn={handleSpawn} />}

        {/* Combatant List */}
        <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
          {tracker.map((ent, i) => {
            const char = members.find(m => m.id === ent.character_id?.toString());
            const hasExactHp = ent.entity_type === 'pc' || (ent.current_hp !== null && ent.max_hp !== null);
            const hp = ent.current_hp ?? char?.hp.current ?? 0;
            const maxHp = ent.max_hp ?? char?.hp.max ?? 1;
            const statusPercent = ent.hp_status === 'Dead' ? 0 : ent.hp_status === 'Critical' ? 20 : ent.hp_status === 'Bloodied' ? 45 : 100;
            const hpPercent = hasExactHp ? Math.max(0, (hp / maxHp) * 100) : statusPercent;
            const isDead = hasExactHp ? hp <= 0 : ent.hp_status === 'Dead';
            const conditions: string[] = ent.conditions ?? char?.conditions ?? [];
            const isActive = ent.is_active === 1;
            const isHidden = ent.is_hidden === 1;
            const isPC = ent.entity_type === 'pc';

            const hpColor = isDead
              ? 'text-muted-foreground'
              : hpPercent > 50 ? 'text-health' : hpPercent > 25 ? 'text-gold' : 'text-destructive';
            const barColor = isDead
              ? 'bg-muted-foreground/40'
              : hpPercent > 50 ? 'bg-health' : hpPercent > 25 ? 'bg-gold' : 'bg-destructive';

            const hasAuraBuff = char?.activeBuffs?.some((b: any) => b.isAura && (b.name.toLowerCase() === 'bless' || Number(b.modifierValue) > 0));
            const hasAuraDebuff = char?.activeBuffs?.some((b: any) => b.isAura && (b.name.toLowerCase() === 'bane' || Number(b.modifierValue) < 0));
            const targetKey = ent.instance_id || ent.character_id;
            const hasSmartPin = smartPins.some(p => p.targetId === targetKey || String(p.targetId) === String(targetKey));
            const pin = smartPins.find(p => p.targetId === targetKey || String(p.targetId) === String(targetKey));

            return (
              <div
                key={ent.id}
                ref={isActive ? activeRef : undefined}
                className={`
                  group rounded-lg p-2 transition-all duration-300 border space-y-1.5 relative
                  ${isActive
                    ? 'bg-primary/15 border-primary/50 shadow-[0_0_20px_rgba(var(--primary),0.15)] scale-[1.01] ring-1 ring-primary/20'
                    : isDead
                      ? 'bg-secondary/5 border-transparent opacity-50'
                      : 'bg-secondary/10 border-transparent hover:border-border/30'
                  }
                  ${isHidden ? 'border-l-2 border-l-violet-500/50' : ''}
                  ${hasAuraBuff ? 'border-emerald-500/35 shadow-[0_0_12px_rgba(16,185,129,0.08)] bg-emerald-950/5' : ''}
                  ${hasAuraDebuff ? 'border-purple-500/35 shadow-[0_0_12px_rgba(168,85,247,0.08)] bg-purple-950/5' : ''}
                `}
              >
                {/* Active turn indicator pulse */}
                {isActive && (
                  <div className="absolute inset-0 rounded-lg border-2 border-primary/30 animate-pulse pointer-events-none" />
                )}

                {/* Top row: position, initiative, name, badges, HP, AC */}
                <div className="flex items-center gap-2 relative z-10">
                  {/* DM target checkbox */}
                  {isDm && (
                    <button
                      onClick={() => toggleSelected(ent.id)}
                      className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
                        selectedIds.has(ent.id)
                          ? 'bg-orange-500/80 border-orange-400 text-white'
                          : 'bg-secondary/20 border-border/40 text-transparent hover:border-orange-500/50'
                      }`}
                      title={selectedIds.has(ent.id) ? 'Deselect target' : 'Select for AoE'}
                    >
                      <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}

                  {/* Turn number */}
                  <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors ${
                    isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-muted-foreground'
                  }`}>
                    {isDead ? <Skull className="h-3 w-3" /> : i + 1}
                  </div>

                  {/* Initiative score (editable) */}
                  <div className="w-10 text-center">
                    <input
                      type="number"
                      value={ent.initiative}
                      onChange={e => handleSetInitiative(ent.id, parseInt(e.target.value) || 0)}
                      className={`w-full bg-transparent text-center text-xs font-bold focus:outline-none focus:ring-1 focus:ring-primary/30 rounded transition-colors ${
                        isActive ? 'text-primary' : 'text-foreground/70'
                      }`}
                      title="Initiative score"
                    />
                  </div>

                  {/* Smart Pin note popover */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className={`p-1 rounded transition-all shrink-0 ${
                          hasSmartPin
                            ? 'text-primary bg-primary/10 border border-primary/20'
                            : 'text-muted-foreground/35 hover:text-muted-foreground/70 group-hover:opacity-100 opacity-0'
                        }`}
                        title="View encounter note"
                      >
                        <Pin className="h-3.5 w-3.5 rotate-45" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="bottom" align="start" className="w-64 p-3 bg-popover/95 backdrop-blur border-primary/20 space-y-2 font-body text-xs relative z-50">
                      <div className="flex items-center justify-between border-b border-border/30 pb-1">
                        <span className="font-display font-bold text-primary flex items-center gap-1 text-[11px]">
                          <Pin className="h-3 w-3 rotate-45" /> Note: {ent.entity_name}
                        </span>
                        {isDm && pin && (
                          <button
                            onClick={() => {
                              const activePin = smartPins.find(p => p.targetId === targetKey || String(p.targetId) === String(targetKey));
                              if (activePin) socket.emit('delete_smart_pin', { id: activePin.id });
                            }}
                            className="text-destructive/60 hover:text-destructive transition-colors"
                            title="Delete note"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <NoteEditor
                        combatant={ent}
                        pins={smartPins}
                        isDm={isDm}
                      />
                    </PopoverContent>
                  </Popover>

                  {/* Name + type badge + conditions */}
                  <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`font-display text-sm truncate transition-colors cursor-pointer hover:underline decoration-primary/40 underline-offset-2 ${
                        isActive ? 'text-primary font-semibold' : isDead ? 'line-through text-muted-foreground/50' : ''
                      } ${hasAuraBuff ? 'text-emerald-400 font-semibold' : hasAuraDebuff ? 'text-purple-400 font-semibold' : ''}`}
                      onClick={() => setSidebarCombatant(prev => prev?.id === ent.id ? null : ent)}
                      title="View stat block"
                    >
                      {ent.entity_name}
                    </span>
                    {!isPC && (
                      <Badge variant="outline" className="text-[7px] h-3 px-1 border-red-500/30 text-red-400">
                        {ent.entity_type === 'monster' ? 'MON' : 'NPC'}
                      </Badge>
                    )}
                    {isHidden && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <EyeOff className="h-3 w-3 text-violet-400/60" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[10px]">Hidden from players</TooltipContent>
                      </Tooltip>
                    )}
                    {ent.concentrating_on && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-violet-500/20 text-violet-400 border border-violet-500/30 leading-none cursor-default">
                            <Zap className="h-2 w-2 inline -mt-px mr-0.5" />
                            {ent.concentrating_on.length > 8 ? ent.concentrating_on.slice(0, 8) + '...' : ent.concentrating_on}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">Concentrating: {ent.concentrating_on}</TooltipContent>
                      </Tooltip>
                    )}
                    {conditions.map(cond => (
                      <Tooltip key={cond}>
                        <TooltipTrigger asChild>
                          <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 leading-none cursor-default">
                            {cond.slice(0, 3).toUpperCase()}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">{cond}</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>

                  {/* HP + AC */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[10px] font-bold tabular-nums ${hpColor}`}>
                      {hasExactHp ? <>{hp}<span className="text-muted-foreground/50 font-normal">/{maxHp}</span></> : ent.hp_status}
                    </span>
                    <span className={`flex items-center gap-0.5 text-[10px] rounded px-1 transition-all ${
                      hasAuraBuff ? 'text-emerald-400 border border-emerald-500/40 aura-highlight-buff bg-emerald-950/20' : 
                      hasAuraDebuff ? 'text-purple-400 border border-purple-500/40 aura-highlight-debuff bg-purple-950/20' : 'text-muted-foreground'
                    }`}>
                      <Shield className="h-2.5 w-2.5 text-mana" />{ent.ac ?? char?.ac ?? '?'}
                    </span>
                  </div>

                  {/* Reorder buttons (visible on hover) */}
                  <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => handleReorder(ent.id, 'up')}
                      className="h-3 w-4 flex items-center justify-center text-muted-foreground/40 hover:text-foreground transition-colors"
                      title="Move up (tie-break)"
                      disabled={i === 0}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleReorder(ent.id, 'down')}
                      className="h-3 w-4 flex items-center justify-center text-muted-foreground/40 hover:text-foreground transition-colors"
                      title="Move down (tie-break)"
                      disabled={i === tracker.length - 1}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* HP bar + quick damage/heal (monsters/NPCs) */}
                <div className="flex items-center gap-1.5 relative z-10">
                  <div className="flex-1 h-1.5 rounded-full bg-secondary/30 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
                      style={{ width: `${Math.max(0, hpPercent)}%` }}
                    />
                  </div>
                  {!isPC && (
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleHpDelta(ent.id, -1)}
                        className="w-5 h-4 flex items-center justify-center text-[8px] font-bold text-destructive bg-destructive/10 border border-destructive/20 rounded hover:bg-destructive/20 transition-colors"
                      >
                        -1
                      </button>
                      <button
                        onClick={() => handleHpDelta(ent.id, -5)}
                        className="w-5 h-4 flex items-center justify-center text-[8px] font-bold text-destructive bg-destructive/10 border border-destructive/20 rounded hover:bg-destructive/20 transition-colors"
                      >
                        -5
                      </button>
                      <button
                        onClick={() => handleHpDelta(ent.id, 5)}
                        className="w-5 h-4 flex items-center justify-center text-[8px] font-bold text-health bg-health/10 border border-health/20 rounded hover:bg-health/20 transition-colors"
                      >
                        +5
                      </button>
                    </div>
                  )}
                </div>
                {!isPC && isDm && <BossPhaseControls combatant={ent} />}
              </div>
            );
          })}
        </div>

        {/* Turn Controls */}
        <div className="pt-3 flex gap-2">
          <Button
            onClick={handlePrevTurn}
            variant="outline"
            className="flex-1 font-display h-9 border-primary/20 text-primary/70 hover:text-primary"
            size="sm"
          >
            <SkipBack className="h-4 w-4 mr-1" />
            Prev
          </Button>
          <Button
            onClick={handleNextTurn}
            className="flex-[2] font-display h-9"
            size="sm"
          >
            <SkipForward className="h-4 w-4 mr-2" />
            Next Turn
          </Button>
        </div>

        {/* Active entity callout */}
        {activeEntity && (
          <div className="text-center text-[10px] text-muted-foreground/50 pt-1">
            <span className="text-primary/70 font-semibold">{activeEntity.entity_name}</span>'s turn
            {activeIndex >= 0 && <span className="ml-1">({activeIndex + 1}/{tracker.length})</span>}
          </div>
        )}

        {/* Combat Report Modal */}
        <CombatReportModal
          open={showReport}
          onClose={() => setShowReport(false)}
          data={reportData}
        />
        <AoEEffectModal
          open={showAoE}
          onClose={() => { setShowAoE(false); setSelectedIds(new Set()); }}
          targets={selectedAoETargets}
        />
        <CombatantSidebar
          combatant={sidebarCombatant}
          onClose={() => setSidebarCombatant(null)}
        />
        <CombatRecoveryModal
          open={showRecovery}
          onOpenChange={setShowRecovery}
        />
        <SidebarSheetMini
          open={showMiniatures}
          onClose={() => setShowMiniatures(false)}
        />
      </CardContent>
    </Card>
  );
}

function NoteEditor({ combatant, pins, isDm }: { combatant: Combatant; pins: any[]; isDm: boolean }) {
  const targetKey = combatant.instance_id || combatant.character_id;
  const pin = pins.find(p => p.targetId === targetKey || String(p.targetId) === String(targetKey));
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(pin?.content || '');

  useEffect(() => {
    setContent(pin?.content || '');
  }, [pin?.content]);

  const handleSave = () => {
    if (!content.trim()) {
      if (pin) socket.emit('delete_smart_pin', { id: pin.id });
    } else {
      socket.emit('save_smart_pin', {
        id: pin?.id,
        targetType: 'combatant',
        targetId: targetKey,
        content: content.trim()
      });
    }
    setIsEditing(false);
  };

  const handleAction = (type: string, val: string) => {
    if (type === 'roll') {
      const formula = val.replace(/\s+/g, '');
      const match = formula.match(/^(?:(\d+))?d(\d+)(?:([+-]\d+))?$/i);
      const count = match ? parseInt(match[1] || '1', 10) : 1;
      const sides = match ? parseInt(match[2], 10) : 20;
      const modifier = match && match[3] ? parseInt(match[3], 10) : 0;
      
      const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
      const total = rolls.reduce((a, b) => a + b, 0) + modifier;

      socket.emit('dice_roll', {
        actor: 'Smart Pin Shortcut',
        sides,
        count,
        modifier,
        total,
        rolls,
        isPrivate: false,
        rollType: 'Pin Shortcut',
        label: `Shortcut: ${val}`,
      });
      toast.success(`Rolled ${formula}: ${total}`);
    } else if (type === 'damage') {
      const amount = parseInt(val, 10);
      if (!isNaN(amount)) {
        socket.emit('update_initiative_hp', { trackerId: combatant.id, delta: -amount });
        toast.success(`Dealt ${amount} damage`);
      }
    } else if (type === 'heal') {
      const amount = parseInt(val, 10);
      if (!isNaN(amount)) {
        socket.emit('update_initiative_hp', { trackerId: combatant.id, delta: amount });
        toast.success(`Healed ${amount} HP`);
      }
    } else if (type === 'aura') {
      socket.emit('toggle_aura', { auraId: val, active: true });
      toast.success(`Activated aura ${val}`);
    }
  };

  const parseActions = (text: string) => {
    const regex = /\[([^\]]+)\]\(([^:]+):([^)]+)\)/g;
    const elements = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const textBefore = text.substring(lastIndex, match.index);
      if (textBefore) elements.push(<span key={`t-${lastIndex}`}>{textBefore}</span>);

      const label = match[1];
      const type = match[2];
      const val = match[3];

      elements.push(
        <button
          key={`btn-${match.index}`}
          onClick={() => handleAction(type, val)}
          className="inline-flex items-center px-1.5 py-0.5 mx-0.5 text-[9px] font-bold rounded bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition-colors shrink-0 font-mono shadow-sm"
        >
          {label}
        </button>
      );
      lastIndex = regex.lastIndex;
    }

    elements.push(<span key="t-end">{text.substring(lastIndex)}</span>);
    return elements;
  };

  if (isEditing && isDm) {
    return (
      <div className="space-y-2">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Enter markdown note... e.g. [Attack](roll:d20+5) or [5 damage](damage:5)"
          className="w-full h-24 bg-secondary/30 border border-input rounded p-1.5 text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="h-6 text-[10px]">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} className="h-6 text-[10px]">
            <Save className="h-3 w-3 mr-1" /> Save Note
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {pin ? (
        <div className="text-foreground/90 whitespace-pre-wrap leading-relaxed select-text font-serif max-h-40 overflow-y-auto pr-1">
          {parseActions(pin.content)}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground italic">No active note pinned.</p>
      )}

      {isDm && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsEditing(true)}
          className="w-full h-6 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors"
        >
          {pin ? 'Edit Note' : '+ Add Note'}
        </Button>
      )}
    </div>
  );
}

function RoundNoteEditor({ round, pins, isDm }: { round: number; pins: any[]; isDm: boolean }) {
  const targetKey = `round-${round}`;
  const pin = pins.find(p => p.targetId === targetKey);
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(pin?.content || '');

  useEffect(() => {
    setContent(pin?.content || '');
  }, [pin?.content]);

  const handleSave = () => {
    if (!content.trim()) {
      if (pin) socket.emit('delete_smart_pin', { id: pin.id });
    } else {
      socket.emit('save_smart_pin', {
        id: pin?.id,
        targetType: 'round',
        targetId: targetKey,
        content: content.trim()
      });
    }
    setIsEditing(false);
  };

  if (isEditing && isDm) {
    return (
      <div className="space-y-2">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Enter round notes... e.g. Round effects, spells ticking down..."
          className="w-full h-20 bg-secondary/30 border border-input rounded p-1.5 text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="h-6 text-[10px]">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} className="h-6 text-[10px]">
            <Save className="h-3 w-3 mr-1" /> Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {pin ? (
        <div className="text-foreground/95 whitespace-pre-wrap leading-relaxed select-text font-serif">
          {pin.content}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground italic">No round notes.</p>
      )}

      {isDm && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsEditing(true)}
          className="w-full h-6 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors"
        >
          {pin ? 'Edit Note' : '+ Add Note'}
        </Button>
      )}
    </div>
  );
}
