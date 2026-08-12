import { useEffect, useState } from 'react';
import { Crown, Plus, Settings2, SkipForward, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import socket from '../socket';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export interface BossPhase {
  name: string;
  maxHp: number;
  ac: number;
  hpMode: 'reset' | 'retain' | 'proportional';
  clearConditions: boolean;
  clearBuffs: boolean;
  stats?: Record<string, unknown> | null;
}

interface BossPhaseCombatant {
  id: number;
  entity_name: string;
  current_hp: number | null;
  max_hp: number | null;
  ac: number | null;
  boss_phases: BossPhase[];
  current_phase_index: number;
  phase_name: string | null;
}

function createDraftPhases(combatant: BossPhaseCombatant): BossPhase[] {
  if (combatant.boss_phases?.length >= 2) return combatant.boss_phases;
  return [
    {
      name: combatant.phase_name || 'Phase 1',
      maxHp: combatant.max_hp || 1,
      ac: combatant.ac || 10,
      hpMode: 'retain',
      clearConditions: false,
      clearBuffs: false,
    },
    {
      name: 'Phase 2',
      maxHp: combatant.max_hp || 1,
      ac: combatant.ac || 10,
      hpMode: 'reset',
      clearConditions: false,
      clearBuffs: false,
    },
  ];
}

export function BossPhaseControls({ combatant }: { combatant: BossPhaseCombatant }) {
  const [open, setOpen] = useState(false);
  const [phases, setPhases] = useState<BossPhase[]>(() => createDraftPhases(combatant));

  useEffect(() => {
    if (!open) setPhases(createDraftPhases(combatant));
  }, [combatant, open]);

  const updatePhase = (index: number, updates: Partial<BossPhase>) => {
    setPhases(current => current.map((phase, phaseIndex) => (
      phaseIndex === index ? { ...phase, ...updates } : phase
    )));
  };

  const save = () => {
    socket.emit('configure_boss_phases', { trackerId: combatant.id, phases });
    toast.success(`Saved ${phases.length} phases for ${combatant.entity_name}`);
    setOpen(false);
  };

  const currentIndex = combatant.current_phase_index || 0;
  const configured = combatant.boss_phases?.length >= 2;
  const canAdvance = configured && currentIndex < combatant.boss_phases.length - 1;

  return (
    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/20">
      <div className="min-w-0 flex items-center gap-1.5 text-[9px] text-muted-foreground">
        <Crown className="h-3 w-3 text-gold shrink-0" />
        <span className="truncate">
          {configured ? `Phase ${currentIndex + 1}: ${combatant.phase_name || combatant.boss_phases[currentIndex]?.name}` : 'Standard creature'}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {canAdvance && (
          <Button
            type="button"
            size="sm"
            className="h-6 px-2 text-[9px]"
            onClick={() => socket.emit('transition_boss_phase', { trackerId: combatant.id })}
            title={`Advance to ${combatant.boss_phases[currentIndex + 1]?.name}`}
          >
            <SkipForward className="h-3 w-3 mr-1" /> Next Phase
          </Button>
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" title="Configure boss phases">
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[420px] max-w-[calc(100vw-2rem)] p-3 space-y-3">
            <div>
              <div className="font-display text-sm text-primary">Boss Phases</div>
              <div className="text-[10px] text-muted-foreground">Effects carry forward unless a phase clears them.</div>
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {phases.map((phase, index) => (
                <div key={index} className="border border-border/40 rounded-md p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-12">Phase {index + 1}</span>
                    <Input
                      value={phase.name}
                      onChange={event => updatePhase(index, { name: event.target.value })}
                      className="h-7 text-xs flex-1"
                      aria-label={`Phase ${index + 1} name`}
                    />
                    {phases.length > 2 && (
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPhases(current => current.filter((_, phaseIndex) => phaseIndex !== index))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-[9px] text-muted-foreground">
                      Max HP
                      <Input type="number" min={1} value={phase.maxHp} onChange={event => updatePhase(index, { maxHp: Number(event.target.value) || 1 })} className="h-7 mt-1 text-xs" />
                    </label>
                    <label className="text-[9px] text-muted-foreground">
                      AC
                      <Input type="number" min={1} value={phase.ac} onChange={event => updatePhase(index, { ac: Number(event.target.value) || 1 })} className="h-7 mt-1 text-xs" />
                    </label>
                    <label className="text-[9px] text-muted-foreground">
                      HP transition
                      <select value={phase.hpMode} onChange={event => updatePhase(index, { hpMode: event.target.value as BossPhase['hpMode'] })} className="h-7 mt-1 w-full rounded-md border border-input bg-background px-2 text-xs">
                        <option value="reset">Reset</option>
                        <option value="retain">Retain</option>
                        <option value="proportional">Scale</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex gap-4 text-[10px] text-muted-foreground">
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={phase.clearConditions} onChange={event => updatePhase(index, { clearConditions: event.target.checked })} /> Clear conditions</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={phase.clearBuffs} onChange={event => updatePhase(index, { clearBuffs: event.target.checked })} /> Clear buffs</label>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setPhases(current => [...current, { name: `Phase ${current.length + 1}`, maxHp: combatant.max_hp || 1, ac: combatant.ac || 10, hpMode: 'reset', clearConditions: false, clearBuffs: false }])}>
                <Plus className="h-3 w-3 mr-1" /> Add Phase
              </Button>
              <Button type="button" size="sm" className="h-7 text-[10px]" onClick={save}>Save Phases</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
