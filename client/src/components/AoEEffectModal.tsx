import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Plus, Trash2, Zap, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { generateRequestId } from '../lib/requestId';
import { DND_CONDITIONS } from '../types/character';
import { createCommandEnvelope } from '../socket';

const DAMAGE_TYPES = [
  'bludgeoning', 'piercing', 'slashing',
  'fire', 'cold', 'lightning', 'thunder',
  'acid', 'poison', 'psychic', 'radiant', 'necrotic', 'force',
] as const;

export interface AoETarget {
  trackerId: number;
  name: string;
  entityType: 'pc' | 'monster' | 'npc';
  characterId: number | null;
}

interface EffectEntry {
  _key: string;
  type: 'damage' | 'heal' | 'condition' | 'remove_condition';
  value: number;
  damageType: string;
  condition: string;
}

interface AoERecord {
  targetId: number;
  targetName: string;
  eventType: string;
  logMessage: string;
  success: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  targets: AoETarget[];
}

function newEffect(): EffectEntry {
  return {
    _key: generateRequestId(),
    type: 'damage',
    value: 10,
    damageType: 'fire',
    condition: 'Prone',
  };
}

export function AoEEffectModal({ open, onClose, targets }: Props) {
  const { state } = useGame();
  const { dmToken } = state;
  const [effects, setEffects] = useState<EffectEntry[]>([newEffect()]);
  const [results, setResults] = useState<AoERecord[] | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (open) {
      setEffects([newEffect()]);
      setResults(null);
      setIsPending(false);
    }
  }, [open]);

  const updateEffect = (key: string, patch: Partial<EffectEntry>) => {
    setEffects(prev => prev.map(e => e._key === key ? { ...e, ...patch } : e));
  };

  const removeEffect = (key: string) => {
    setEffects(prev => prev.filter(e => e._key !== key));
  };

  const handleSubmit = () => {
    if (targets.length === 0 || effects.length === 0) return;

    const serverTargets = targets.map(t =>
      t.entityType === 'pc' && t.characterId != null
        ? { id: t.characterId, type: 'character' as const }
        : { id: t.trackerId, type: 'monster' as const }
    );

    const serverEffects = effects.map(e => {
      if (e.type === 'damage')           return { type: 'damage', value: e.value, damageType: e.damageType };
      if (e.type === 'heal')             return { type: 'heal', value: e.value };
      if (e.type === 'condition')        return { type: 'condition', condition: e.condition };
      /* remove_condition */             return { type: 'remove_condition', condition: e.condition };
    });

    setIsPending(true);
    fetch('/api/v1/effects/bulk-apply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dmToken || ''}`,
      },
      body: JSON.stringify(createCommandEnvelope(
        'effect.party.apply',
        { targets: serverTargets, effects: serverEffects, actor: 'DM' },
        serverTargets.map(target => target.type === 'monster'
          ? `initiative:${target.id}`
          : `character:${target.id}`),
        { type: 'dm', id: 'DM' },
      )),
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data.success) {
          setResults(data.records);
        } else {
          throw new Error(data.error || 'Failed to apply effects');
        }
      })
      .catch(err => {
        console.error('Error applying bulk effect:', err);
        setResults(targets.map(t => ({
          targetId: t.trackerId,
          targetName: t.name,
          eventType: 'error',
          logMessage: err.message,
          success: false
        })));
      })
      .finally(() => {
        setIsPending(false);
      });
  };

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg bg-background border-primary/20">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2 text-primary">
            <Zap className="h-4 w-4" />
            Area Effect
            <Badge variant="outline" className="text-[10px] font-mono ml-1">
              {targets.length} target{targets.length !== 1 ? 's' : ''}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Target chips */}
        <div className="flex flex-wrap gap-1.5 pb-3 border-b border-border/20">
          {targets.map(t => (
            <span
              key={t.trackerId}
              className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                t.entityType === 'pc'
                  ? 'bg-blue-950/40 border-blue-700/40 text-blue-300'
                  : 'bg-red-950/40 border-red-700/40 text-red-300'
              }`}
            >
              {t.name}
            </span>
          ))}
        </div>

        {/* Results view */}
        {results ? (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-bold">Results</p>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {results.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 rounded-md p-2 text-xs border ${
                    r.success
                      ? 'bg-green-950/20 border-green-800/30'
                      : 'bg-red-950/20 border-red-800/30'
                  }`}
                >
                  {r.success
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0 mt-px" />
                    : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-px" />
                  }
                  <span className={r.success ? 'text-foreground/80' : 'text-red-300'}>
                    {r.logMessage}
                  </span>
                </div>
              ))}
            </div>
            <Button onClick={onClose} size="sm" className="w-full mt-1">Close</Button>
          </div>
        ) : (
          <>
            {/* Effect rows */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-bold">Effects</p>

              {effects.map(eff => (
                <div
                  key={eff._key}
                  className="flex items-center gap-1.5 rounded-md p-1.5 bg-secondary/10 border border-border/20"
                >
                  {/* Type selector */}
                  <Select
                    value={eff.type}
                    onValueChange={v => updateEffect(eff._key, { type: v as EffectEntry['type'] })}
                  >
                    <SelectTrigger className="h-7 w-[140px] text-xs shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="damage">Damage</SelectItem>
                      <SelectItem value="heal">Heal</SelectItem>
                      <SelectItem value="condition">Add Condition</SelectItem>
                      <SelectItem value="remove_condition">Remove Condition</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Value input (damage / heal) */}
                  {(eff.type === 'damage' || eff.type === 'heal') && (
                    <Input
                      type="number"
                      min={1}
                      value={eff.value}
                      onChange={e => updateEffect(eff._key, { value: parseInt(e.target.value) || 1 })}
                      className="h-7 w-14 text-xs text-center shrink-0"
                    />
                  )}

                  {/* Damage type selector */}
                  {eff.type === 'damage' && (
                    <Select value={eff.damageType} onValueChange={v => updateEffect(eff._key, { damageType: v })}>
                      <SelectTrigger className="h-7 flex-1 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAMAGE_TYPES.map(dt => (
                          <SelectItem key={dt} value={dt}>{capitalize(dt)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Condition selector */}
                  {(eff.type === 'condition' || eff.type === 'remove_condition') && (
                    <Select value={eff.condition} onValueChange={v => updateEffect(eff._key, { condition: v })}>
                      <SelectTrigger className="h-7 flex-1 text-xs">
                        <SelectValue placeholder="Condition…" />
                      </SelectTrigger>
                      <SelectContent>
                        {DND_CONDITIONS.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Spacer for heal (no secondary selector) */}
                  {eff.type === 'heal' && <div className="flex-1" />}

                  {/* Remove row */}
                  <button
                    onClick={() => removeEffect(eff._key)}
                    className="h-7 w-7 flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
                    title="Remove effect"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEffects(prev => [...prev, newEffect()])}
                className="w-full h-7 text-xs border border-dashed border-border/30 text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3 mr-1" /> Add Effect
              </Button>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-[2] font-display"
                disabled={isPending || effects.length === 0 || targets.length === 0}
                onClick={handleSubmit}
              >
                {isPending
                  ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Applying…</>
                  : <><Zap className="h-3 w-3 mr-1.5" /> Apply to {targets.length} Target{targets.length !== 1 ? 's' : ''}</>
                }
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
