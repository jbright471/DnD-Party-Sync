export interface RollFeedEvent {
  id: number;
  actor: string;
  characterId: string | null;
  /** Short display name, e.g. "Giant Slayer Longbow" or "Stealth" */
  label: string;
  source: string | null;
  /** e.g. "Attack Roll", "Damage Roll", "Skill Check", "Saving Throw", "Roll" */
  rollType: string;
  sides: number;
  count: number;
  modifier: number;
  total: number;
  rolls: number[];
  damageType: string | null;
  isPrivate: boolean;
  timestamp: string;
}

export const ROLL_TYPE_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  'Attack Roll':     { label: 'ATK',  color: 'text-amber-300',  bg: 'bg-amber-950/50',  border: 'border-amber-700/40' },
  'Critical Damage': { label: 'CRIT', color: 'text-red-300',    bg: 'bg-red-950/60',    border: 'border-red-600/60' },
  'Damage Roll':     { label: 'DMG',  color: 'text-red-400',    bg: 'bg-red-950/40',    border: 'border-red-800/40' },
  'Skill Check':     { label: 'SKILL',color: 'text-blue-400',   bg: 'bg-blue-950/40',   border: 'border-blue-800/40' },
  'Saving Throw':    { label: 'SAVE', color: 'text-purple-400', bg: 'bg-purple-950/40', border: 'border-purple-800/40' },
  'Ability Check':   { label: 'ABIL', color: 'text-cyan-400',   bg: 'bg-cyan-950/40',   border: 'border-cyan-800/40' },
  'Initiative':      { label: 'INIT', color: 'text-yellow-400', bg: 'bg-yellow-950/40', border: 'border-yellow-800/40' },
  'Roll':            { label: 'ROLL', color: 'text-slate-400',  bg: 'bg-slate-900/40',  border: 'border-slate-700/40' },
  'HP Damage':       { label: 'DMG',  color: 'text-red-400',    bg: 'bg-red-950/40',    border: 'border-red-800/40' },
  'HP Heal':         { label: 'HEAL', color: 'text-green-400',  bg: 'bg-green-950/40',  border: 'border-green-800/40' },
  'Loot Claimed':    { label: 'LOOT', color: 'text-gold',      bg: 'bg-amber-950/40',  border: 'border-amber-700/40' },
};

export function getRollTypeMeta(rollType: string) {
  return ROLL_TYPE_META[rollType] ?? ROLL_TYPE_META['Roll'];
}

export interface EffectEvent {
  id: number;
  session_round: number;
  turn_index: number;
  phase: string;
  event_type: string;
  actor: string;
  target_id: number | null;
  target_type: string;
  target_name: string | null;
  payload_json: string;
  parent_event_id: number | null;
  source_preset_id: number | null;
  created_at: string;
}

export const EVENT_META: Record<string, { label: string; color: string; bg: string }> = {
  damage:               { label: 'DMG',    color: 'text-red-400',     bg: 'bg-red-950/40 border-red-800/40' },
  heal:                 { label: 'HEAL',   color: 'text-green-400',   bg: 'bg-green-950/40 border-green-800/40' },
  condition_applied:    { label: 'COND',   color: 'text-amber-400',   bg: 'bg-amber-950/40 border-amber-800/40' },
  condition_removed:    { label: '-COND',  color: 'text-slate-400',   bg: 'bg-slate-900/40 border-slate-700/40' },
  buff_applied:         { label: 'BUFF',   color: 'text-blue-400',    bg: 'bg-blue-950/40 border-blue-800/40' },
  buff_removed:         { label: '-BUFF',  color: 'text-slate-400',   bg: 'bg-slate-900/40 border-slate-700/40' },
  automation_trigger:   { label: 'AUTO',   color: 'text-orange-400',  bg: 'bg-orange-950/40 border-orange-800/40' },
  concentration_check:  { label: 'CON?',   color: 'text-blue-400',    bg: 'bg-blue-950/40 border-blue-800/40' },
  concentration_broken: { label: 'CON!',   color: 'text-red-300',     bg: 'bg-red-950/60 border-red-700/60' },
  unknown:              { label: '???',    color: 'text-muted-foreground', bg: 'bg-secondary/20 border-border/40' },
};

export function getEventSummary(event: EffectEvent): string {
  try {
    const p = JSON.parse(event.payload_json || '{}');
    switch (event.event_type) {
      case 'damage':
        return `${p.value ?? '?'} ${p.damageType || 'untyped'} dmg → ${event.target_name}`;
      case 'heal':
        return `+${p.value ?? '?'} HP → ${event.target_name}`;
      case 'condition_applied':
        return `${p.condition} → ${event.target_name}`;
      case 'condition_removed':
        return `${p.condition} removed from ${event.target_name}`;
      case 'buff_applied':
        return `${p.buffData?.name ?? p.name ?? 'Buff'} → ${event.target_name}`;
      case 'automation_trigger':
        return `Triggered: ${p.presetName ?? event.actor}`;
      case 'concentration_check':
        return `${event.target_name} CON save vs DC ${p.dc} — rolled ${p.total} (${p.passed ? 'PASS' : 'FAIL'})`;
      case 'concentration_broken':
        return `${event.target_name} lost concentration on ${p.spellName}`;
      default:
        return event.target_name ? `→ ${event.target_name}` : event.actor;
    }
  } catch {
    return event.actor;
  }
}

export function groupByRound(events: EffectEvent[]): Map<number, EffectEvent[]> {
  const map = new Map<number, EffectEvent[]>();
  for (const e of events) {
    const round = e.session_round || 0;
    if (!map.has(round)) map.set(round, []);
    map.get(round)!.push(e);
  }
  return map;
}
