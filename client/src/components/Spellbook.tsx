import { useState, useMemo } from 'react';
import { Character, Spell, SpellSlots } from '../types/character';
import { backend } from '../integrations/backend';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { Sparkles, Flame, BookOpen, Clock, Target, Eye, ChevronUp } from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────

const LEVEL_LABELS: Record<number, string> = {
  0: 'Cantrips',
  1: '1st Level',
  2: '2nd Level',
  3: '3rd Level',
  4: '4th Level',
  5: '5th Level',
  6: '6th Level',
  7: '7th Level',
  8: '8th Level',
  9: '9th Level',
};

const LEVEL_ORDINAL: Record<number, string> = {
  1: '1st', 2: '2nd', 3: '3rd', 4: '4th',
  5: '5th', 6: '6th', 7: '7th', 8: '8th', 9: '9th',
};

const SCHOOL_COLORS: Record<string, string> = {
  Abjuration:    'text-blue-400',
  Conjuration:   'text-yellow-400',
  Divination:    'text-cyan-400',
  Enchantment:   'text-pink-400',
  Evocation:     'text-red-400',
  Illusion:      'text-purple-400',
  Necromancy:    'text-emerald-400',
  Transmutation: 'text-amber-400',
};

// ── Slot Tracker ───────────────────────────────────────────────────────────

function SlotTracker({ level, slots }: { level: number; slots: { max: number; used: number } }) {
  const remaining = slots.max - slots.used;
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] font-display tracking-wider uppercase text-muted-foreground/50 mr-1">
        SLOTS
      </span>
      {Array.from({ length: slots.max }, (_, i) => {
        const filled = i < remaining;
        return (
          <div
            key={i}
            className={cn(
              'h-3.5 w-3.5 rounded-sm border transition-all duration-200',
              filled
                ? 'bg-violet-500/70 border-violet-400/60 shadow-[0_0_4px_hsl(270_70%_50%/0.3)]'
                : 'bg-secondary/30 border-border/40',
            )}
            aria-label={filled ? 'Available slot' : 'Used slot'}
          />
        );
      })}
      <span className="text-[9px] text-muted-foreground/40 ml-1 tabular-nums">
        {remaining}/{slots.max}
      </span>
    </div>
  );
}

// ── Spell Row ──────────────────────────────────────────────────────────────

interface SpellRowProps {
  spell: Spell;
  character: Character;
  onCast: (spell: Spell, castAtLevel: number) => void;
}

function SpellRow({ spell, character, onCast }: SpellRowProps) {
  const [showUpcast, setShowUpcast] = useState(false);
  const isCantrip = spell.level === 0;

  // Determine if we have an available slot at the spell's native level
  const nativeSlot = character.spellSlots[spell.level];
  const hasNativeSlot = isCantrip || (nativeSlot && nativeSlot.max - nativeSlot.used > 0);

  // Find all valid upcast levels (spell.level+1 through 9 with available slots)
  const upcastLevels = useMemo(() => {
    if (isCantrip) return [];
    const levels: number[] = [];
    for (let lvl = spell.level + 1; lvl <= 9; lvl++) {
      const slot = character.spellSlots[lvl];
      if (slot && slot.max - slot.used > 0) {
        levels.push(lvl);
      }
    }
    return levels;
  }, [spell.level, character.spellSlots, isCantrip]);

  const canCastAtAnyLevel = isCantrip || hasNativeSlot || upcastLevels.length > 0;
  const schoolColor = SCHOOL_COLORS[spell.school || ''] || 'text-muted-foreground';

  const handleCast = () => {
    if (isCantrip) {
      onCast(spell, 0);
      return;
    }
    if (hasNativeSlot) {
      onCast(spell, spell.level);
    } else if (upcastLevels.length > 0) {
      setShowUpcast(true);
    }
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-2.5 px-3 py-2 rounded-md border transition-all duration-150',
        canCastAtAnyLevel
          ? 'border-border/30 hover:border-primary/40 hover:bg-primary/5 cursor-pointer'
          : 'border-border/20 opacity-50',
      )}
    >
      {/* Concentration indicator */}
      <div className="w-3 shrink-0 flex justify-center">
        {spell.isConcentration && (
          <Eye className="h-3 w-3 text-blue-400/60" aria-label="Concentration" />
        )}
      </div>

      {/* Spell info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-display truncate">{spell.name}</span>
          {spell.isRitual && (
            <span className="text-[8px] border border-cyan-700/40 text-cyan-400/70 rounded px-1 py-px font-display tracking-wider">
              R
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
          {spell.school && <span className={schoolColor}>{spell.school}</span>}
          {spell.castingTime && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />{spell.castingTime}
            </span>
          )}
          {spell.range && (
            <span className="flex items-center gap-0.5">
              <Target className="h-2.5 w-2.5" />{spell.range}
            </span>
          )}
        </div>
      </div>

      {/* Damage indicator */}
      {spell.damageDice && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[10px] text-destructive/70 font-display tabular-nums shrink-0">
                {spell.damageDice} {spell.damageType || ''}
              </span>
            </TooltipTrigger>
            {spell.description && (
              <TooltipContent side="left" className="max-w-[260px] text-xs">
                {spell.description}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Cast / Upcast buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Main cast button */}
        <button
          onClick={handleCast}
          disabled={!canCastAtAnyLevel}
          className={cn(
            'h-7 px-2.5 rounded text-[11px] font-display tracking-wide transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
            canCastAtAnyLevel
              ? isCantrip
                ? 'bg-emerald-950/40 border border-emerald-700/50 text-emerald-300 hover:bg-emerald-900/50 hover:border-emerald-500/60'
                : 'bg-violet-950/40 border border-violet-700/50 text-violet-300 hover:bg-violet-900/50 hover:border-violet-500/60'
              : 'bg-secondary/20 border border-border/20 text-muted-foreground/30 cursor-not-allowed',
          )}
          aria-label={`Cast ${spell.name}`}
        >
          {isCantrip ? 'Cast' : hasNativeSlot ? 'Cast' : `${LEVEL_ORDINAL[upcastLevels[0]]}+`}
        </button>

        {/* Upcast popover — only for leveled spells with higher slot options */}
        {!isCantrip && upcastLevels.length > 0 && (
          <Popover open={showUpcast} onOpenChange={setShowUpcast}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'h-7 w-7 rounded flex items-center justify-center border transition-all duration-150',
                  'bg-secondary/20 border-border/30 text-muted-foreground/50',
                  'hover:border-violet-500/50 hover:text-violet-300 hover:bg-violet-950/30',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                )}
                aria-label="Cast at higher level"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-40 p-1.5 border-border/60 bg-card shadow-2xl shadow-black/70"
              align="end"
              side="top"
              sideOffset={4}
            >
              <div className="text-[9px] font-display tracking-widest uppercase text-muted-foreground/50 px-2 py-1">
                Cast At Level
              </div>
              {/* Native level option */}
              {hasNativeSlot && (
                <UpcastOption
                  level={spell.level}
                  slots={character.spellSlots[spell.level]}
                  isNative
                  onClick={() => { onCast(spell, spell.level); setShowUpcast(false); }}
                />
              )}
              {upcastLevels.map(lvl => (
                <UpcastOption
                  key={lvl}
                  level={lvl}
                  slots={character.spellSlots[lvl]}
                  onClick={() => { onCast(spell, lvl); setShowUpcast(false); }}
                />
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}

function UpcastOption({ level, slots, isNative, onClick }: {
  level: number;
  slots: { max: number; used: number };
  isNative?: boolean;
  onClick: () => void;
}) {
  const remaining = slots.max - slots.used;
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between px-2 py-1.5 rounded text-xs',
        'transition-colors hover:bg-violet-950/40 hover:text-violet-300 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
      )}
    >
      <span className="font-display">
        {LEVEL_ORDINAL[level]} Level
        {isNative && <span className="text-muted-foreground/40 ml-1">(native)</span>}
      </span>
      <span className="text-[10px] text-muted-foreground/50 tabular-nums">
        {remaining}/{slots.max}
      </span>
    </button>
  );
}

// ── Spellbook ──────────────────────────────────────────────────────────────

interface SpellbookProps {
  character: Character;
}

export function Spellbook({ character }: SpellbookProps) {
  // Group spells by level
  const spellsByLevel = useMemo(() => {
    const groups = new Map<number, Spell[]>();
    const sorted = [...(character.spells || [])].sort((a, b) => a.name.localeCompare(b.name));
    for (const spell of sorted) {
      const lvl = spell.level ?? 0;
      if (!groups.has(lvl)) groups.set(lvl, []);
      groups.get(lvl)!.push(spell);
    }
    return groups;
  }, [character.spells]);

  // Determine which levels exist
  const levels = useMemo(() => {
    const set = new Set<number>();
    for (const spell of character.spells || []) set.add(spell.level ?? 0);
    // Also add levels that have spell slots even if no spells assigned
    for (const [lvl, slot] of Object.entries(character.spellSlots || {})) {
      if ((slot as any).max > 0) set.add(Number(lvl));
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [character.spells, character.spellSlots]);

  const handleCast = (spell: Spell, castAtLevel: number) => {
    const isCantrip = castAtLevel === 0;

    // Check slot availability for leveled spells
    if (!isCantrip) {
      const slot = character.spellSlots[castAtLevel];
      if (!slot || slot.max - slot.used <= 0) {
        toast.error(`No ${LEVEL_ORDINAL[castAtLevel]}-level slots remaining`);
        return;
      }
    }

    backend.castSpell(character.id, {
      spellName: spell.name,
      spellLevel: spell.level,
      castAtLevel,
      isConcentration: spell.isConcentration,
      damageDice: spell.damageDice,
      damageType: spell.damageType,
    });

    const levelLabel = isCantrip ? 'cantrip' : `${LEVEL_ORDINAL[castAtLevel]} level`;
    const upcastNote = castAtLevel > spell.level ? ` (upcast from ${LEVEL_ORDINAL[spell.level]})` : '';
    toast(`${spell.name}`, {
      description: `Cast at ${levelLabel}${upcastNote}`,
    });
  };

  if (levels.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-violet-400" />
            Spellbook
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-xs text-muted-foreground/40 italic text-center py-4">
            No spells known. Sync from D&D Beyond to populate your spellbook.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Default open: cantrips + first leveled group
  const defaultOpen = levels.slice(0, 2).map(l => `level-${l}`);

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-violet-400" />
            Spellbook
          </CardTitle>
          <span className="text-[10px] text-muted-foreground/40 font-display tabular-nums">
            {(character.spells || []).length} spells known
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <Accordion type="multiple" defaultValue={defaultOpen} className="space-y-1">
          {levels.map(level => {
            const spells = spellsByLevel.get(level) || [];
            const slot = character.spellSlots[level];
            const isCantrip = level === 0;

            return (
              <AccordionItem
                key={level}
                value={`level-${level}`}
                className="border border-border/30 rounded-lg overflow-hidden"
              >
                <AccordionTrigger
                  className={cn(
                    'px-3 py-2.5 hover:no-underline',
                    'data-[state=open]:bg-secondary/20',
                  )}
                >
                  <div className="flex items-center justify-between w-full pr-2">
                    <div className="flex items-center gap-2">
                      {isCantrip ? (
                        <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Flame className="h-3.5 w-3.5 text-violet-400" />
                      )}
                      <span className="font-display text-xs tracking-wide">
                        {LEVEL_LABELS[level] || `Level ${level}`}
                      </span>
                      <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                        ({spells.length})
                      </span>
                    </div>
                    {/* Slot tracker for leveled spells */}
                    {!isCantrip && slot && (
                      <SlotTracker level={level} slots={slot} />
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-2 pt-1">
                  <div className="space-y-1">
                    {spells.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground/30 italic text-center py-2">
                        No spells at this level
                      </p>
                    ) : (
                      spells.map(spell => (
                        <SpellRow
                          key={spell.name}
                          spell={spell}
                          character={character}
                          onCast={handleCast}
                        />
                      ))
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
