import { useState } from 'react';
import { Character, DND_CONDITIONS, DndCondition } from '../types/character';
import { backend } from '../integrations/backend';
import { cn } from '../lib/utils';
import { Plus, X, Clock } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

// ── Condition data ─────────────────────────────────────────────────────────
// Icons use Unicode glyphs for a dark-arcane aesthetic — no emoji.

type Severity = 'deadly' | 'dangerous' | 'debilitating' | 'utility';

interface ConditionMeta {
  icon: string;
  severity: Severity;
  rules: string[];
}

const CONDITIONS: Record<DndCondition, ConditionMeta> = {
  Blinded: {
    icon: '◎',
    severity: 'debilitating',
    rules: [
      'Auto-fail any check requiring sight.',
      'Attack rolls against you have advantage.',
      'Your attack rolls have disadvantage.',
    ],
  },
  Charmed: {
    icon: '♡',
    severity: 'debilitating',
    rules: [
      "Can't attack or target the charmer with harmful abilities.",
      'The charmer has advantage on Charisma checks against you.',
    ],
  },
  Deafened: {
    icon: '⊗',
    severity: 'utility',
    rules: ["Auto-fail any check requiring hearing."],
  },
  Frightened: {
    icon: '⚠',
    severity: 'dangerous',
    rules: [
      'Disadvantage on attack rolls and ability checks while source is visible.',
      "Can't willingly move closer to the source of fear.",
    ],
  },
  Grappled: {
    icon: '⊕',
    severity: 'dangerous',
    rules: [
      'Speed becomes 0.',
      'Ends if grappler is incapacitated or you leave their reach.',
    ],
  },
  Incapacitated: {
    icon: '◌',
    severity: 'dangerous',
    rules: ["Can't take actions or reactions."],
  },
  Invisible: {
    icon: '◇',
    severity: 'utility',
    rules: [
      'Impossible to see without magic or a special sense.',
      'Your attack rolls have advantage; attacks against you have disadvantage.',
    ],
  },
  Paralyzed: {
    icon: '⚡',
    severity: 'deadly',
    rules: [
      "Incapacitated; can't move or speak.",
      'Auto-fail STR and DEX saving throws.',
      'Attacks have advantage; hits within 5 ft are critical hits.',
    ],
  },
  Petrified: {
    icon: '◈',
    severity: 'deadly',
    rules: [
      'Transformed to stone; incapacitated and unaware of surroundings.',
      'Resistance to all damage; immune to poison and disease.',
      'Auto-fail STR and DEX saving throws.',
    ],
  },
  Poisoned: {
    icon: '✦',
    severity: 'debilitating',
    rules: ['Disadvantage on attack rolls and ability checks.'],
  },
  Prone: {
    icon: '↓',
    severity: 'debilitating',
    rules: [
      'Only movement option is crawling (costs double movement).',
      'Disadvantage on your attack rolls.',
      'Attacks within 5 ft have advantage; beyond 5 ft have disadvantage.',
    ],
  },
  Restrained: {
    icon: '⛓',
    severity: 'dangerous',
    rules: [
      'Speed becomes 0.',
      'Attack rolls against you have advantage; yours have disadvantage.',
      'Disadvantage on DEX saving throws.',
    ],
  },
  Stunned: {
    icon: '✕',
    severity: 'deadly',
    rules: [
      "Incapacitated; can't move; can only speak falteringly.",
      'Auto-fail STR and DEX saving throws.',
      'Attack rolls against you have advantage.',
    ],
  },
  Unconscious: {
    icon: '☽',
    severity: 'deadly',
    rules: [
      "Incapacitated; drops held items; falls prone; unaware of surroundings.",
      'Auto-fail STR and DEX saving throws.',
      'Attacks have advantage; hits within 5 ft are critical hits.',
    ],
  },
  Exhaustion: {
    icon: '≋',
    severity: 'dangerous',
    rules: [
      'Level 1: Disadvantage on ability checks.',
      'Level 2: Speed halved.',
      'Level 3: Disadvantage on attacks and saving throws.',
      'Level 4: Hit point maximum halved.',
      'Level 5: Speed becomes 0.',
      'Level 6: Death.',
    ],
  },
};

// Tailwind class sets — must be complete strings (no dynamic construction)
const PILL: Record<Severity, string> = {
  deadly:
    'border-red-700/70 bg-red-950/60 text-red-300 hover:border-red-500/90 shadow-[0_0_8px_hsl(0_70%_35%/0.35)]',
  dangerous:
    'border-orange-700/70 bg-orange-950/60 text-orange-300 hover:border-orange-500/90',
  debilitating:
    'border-amber-700/70 bg-amber-950/60 text-amber-300 hover:border-amber-500/90',
  utility:
    'border-slate-600/70 bg-slate-800/60 text-slate-300 hover:border-slate-400/90',
};

const TOOLTIP_HEADER: Record<Severity, string> = {
  deadly:    'text-red-400    border-red-800/50',
  dangerous: 'text-orange-400 border-orange-800/50',
  debilitating: 'text-amber-400  border-amber-800/50',
  utility:   'text-slate-400  border-slate-700/50',
};

const MANAGE_ACTIVE: Record<Severity, string> = {
  deadly:    'bg-red-950/60 border-red-700/70 text-red-300',
  dangerous: 'bg-orange-950/60 border-orange-700/70 text-orange-300',
  debilitating: 'bg-amber-950/60 border-amber-700/70 text-amber-300',
  utility:   'bg-slate-800/60 border-slate-600/70 text-slate-300',
};

// ── Component ──────────────────────────────────────────────────────────────

interface ConditionBadgesProps {
  character: Character;
}

/**
 * Compact condition pills for the header.
 *
 * Each active condition renders as a colored pill badge. Hover reveals a
 * tooltip with the 5e rules text. The × button removes the condition.
 *
 * The + button opens a popover showing all 15 conditions as toggle tiles.
 */
export function ConditionBadges({ character }: ConditionBadgesProps) {
  const [durationInput, setDurationInput] = useState<Record<string, string>>({});

  // Safely cast — only show known conditions
  const active = character.conditions.filter(
    (c): c is DndCondition => DND_CONDITIONS.includes(c as DndCondition),
  );

  /** Get remaining duration for a condition (undefined = permanent) */
  const getDuration = (cond: string): number | undefined => {
    const key = cond.toLowerCase();
    return character.conditionDurations?.[key];
  };

  const toggle = (cond: DndCondition) => {
    if (active.includes(cond)) {
      backend.removeCondition(character.id, cond);
    } else {
      const durStr = durationInput[cond];
      const dur = durStr ? parseInt(durStr) : undefined;
      backend.applyCondition(character.id, cond, dur && dur > 0 ? dur : undefined);
      setDurationInput(prev => ({ ...prev, [cond]: '' }));
    }
  };

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex items-center gap-1.5 flex-wrap min-h-[22px]">

        {/* ── Active condition pills ───────────────────────────── */}
        {active.map(cond => {
          const meta = CONDITIONS[cond];
          if (!meta) return null;

          return (
            <Tooltip key={cond}>
              <TooltipTrigger asChild>
                {/* pill */}
                <div
                  className={cn(
                    'group inline-flex items-center gap-1 pl-1.5 pr-1 h-[22px] rounded-full border',
                    'text-[11px] font-display tracking-wide transition-all duration-150 cursor-default select-none',
                    PILL[meta.severity],
                  )}
                  role="status"
                  aria-label={`Active condition: ${cond}`}
                >
                  {/* glyph */}
                  <span className="font-mono text-[10px] leading-none opacity-75" aria-hidden>
                    {meta.icon}
                  </span>
                  {/* name + duration */}
                  <span className="leading-none">
                    {cond}
                    {getDuration(cond) != null && (
                      <span className="ml-0.5 opacity-70 text-[9px] tabular-nums">
                        ({getDuration(cond)} rd{getDuration(cond) !== 1 ? 's' : ''})
                      </span>
                    )}
                  </span>
                  {/* remove × — only visible on hover */}
                  <button
                    onClick={() => backend.removeCondition(character.id, cond)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full hover:bg-white/15 p-0.5 ml-0.5 focus-visible:outline-none focus-visible:opacity-100"
                    aria-label={`Remove ${cond}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              </TooltipTrigger>

              {/* ── Rules tooltip ─────────────────────────────── */}
              <TooltipContent
                side="bottom"
                sideOffset={6}
                className="p-0 max-w-[248px] border bg-card/95 backdrop-blur-sm shadow-2xl shadow-black/60 rounded-lg overflow-hidden"
              >
                {/* header stripe */}
                <div
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 border-b',
                    TOOLTIP_HEADER[meta.severity],
                  )}
                >
                  <span className="font-mono text-sm leading-none" aria-hidden>
                    {meta.icon}
                  </span>
                  <span className="font-display text-[11px] tracking-widest uppercase font-bold">
                    {cond}
                  </span>
                </div>
                {/* duration indicator */}
                {getDuration(cond) != null && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary/30 text-[10px] text-muted-foreground border-b border-border/30">
                    <Clock className="h-3 w-3 opacity-50" />
                    <span className="tabular-nums font-semibold">{getDuration(cond)} round{getDuration(cond) !== 1 ? 's' : ''} remaining</span>
                  </div>
                )}
                {/* rules list */}
                <ul className="px-3 py-2.5 space-y-1.5">
                  {meta.rules.map((rule, i) => (
                    <li key={i} className="flex gap-2 text-[11px] text-muted-foreground leading-snug">
                      <span className="text-[9px] mt-0.5 shrink-0 opacity-40 font-mono">▸</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* ── Empty state ──────────────────────────────────────── */}
        {active.length === 0 && (
          <span className="text-[11px] text-muted-foreground/30 italic font-display tracking-wide leading-none">
            none
          </span>
        )}

        {/* ── Manage conditions popover ────────────────────────── */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                'inline-flex items-center justify-center h-[22px] w-[22px] rounded-full shrink-0',
                'border border-dashed border-border/50 text-muted-foreground/50',
                'hover:border-primary/60 hover:text-primary hover:bg-primary/10',
                'transition-all duration-150 cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
              )}
              aria-label="Manage conditions"
              title="Add or remove conditions"
            >
              <Plus className="h-3 w-3" />
            </button>
          </PopoverTrigger>

          <PopoverContent
            className="w-[17rem] p-0 border-border/70 bg-card shadow-2xl shadow-black/70 rounded-lg overflow-hidden"
            align="start"
            side="bottom"
            sideOffset={8}
          >
            {/* popover header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
              <span className="font-display text-[10px] tracking-widest uppercase text-muted-foreground">
                Conditions
              </span>
              {active.length > 0 && (
                <span className="text-[10px] font-display text-destructive/70 tabular-nums">
                  {active.length} active
                </span>
              )}
            </div>

            {/* condition toggle grid — 3 columns */}
            <div className="p-1.5 grid grid-cols-3 gap-1">
              {DND_CONDITIONS.map(cond => {
                const meta = CONDITIONS[cond];
                const isActive = active.includes(cond);
                const dur = getDuration(cond);

                return (
                  <div key={cond} className="flex flex-col">
                    <button
                      onClick={() => toggle(cond)}
                      aria-pressed={isActive}
                      className={cn(
                        'flex flex-col items-center gap-0.5 px-1.5 py-2 rounded-md border',
                        'text-[10px] font-display tracking-wide text-center leading-tight',
                        'transition-all duration-150 cursor-pointer',
                        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                        isActive
                          ? cn(MANAGE_ACTIVE[meta.severity], 'font-bold')
                          : 'border-transparent text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary/50',
                      )}
                    >
                      <span className="font-mono text-[12px] leading-none" aria-hidden>
                        {meta.icon}
                      </span>
                      <span>{cond}</span>
                      {isActive && dur != null && (
                        <span className="text-[8px] opacity-60 tabular-nums">{dur} rd{dur !== 1 ? 's' : ''}</span>
                      )}
                    </button>
                    {/* Duration input — shown when condition is inactive */}
                    {!isActive && (
                      <input
                        type="number"
                        min="0"
                        placeholder="rds"
                        value={durationInput[cond] || ''}
                        onChange={e => setDurationInput(prev => ({ ...prev, [cond]: e.target.value }))}
                        onClick={e => e.stopPropagation()}
                        className="mt-0.5 w-full h-5 text-[9px] text-center bg-secondary/30 border border-border/30 rounded focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/30"
                        title="Duration in rounds (empty = permanent)"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* footer hint */}
            <div className="px-3 py-2 border-t border-border/30">
              <p className="text-[9px] text-muted-foreground/30 font-display tracking-wide text-center">
                CLICK TO TOGGLE · SET ROUNDS BEFORE APPLYING · HOVER PILL FOR RULES
              </p>
            </div>
          </PopoverContent>
        </Popover>

      </div>
    </TooltipProvider>
  );
}
