import { Character, WeaponAttack } from '../types/character';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { WeaponRow } from './WeaponRow';
import { Swords } from 'lucide-react';

// ── Mock data ─────────────────────────────────────────────────────────────────
// Shown when character.attacks is not populated. Mirrors the D&D Beyond example
// from the screenshot (Giant Slayer Longbow character).

const EXAMPLE_ATTACKS: WeaponAttack[] = [
  {
    id: 'example-longbow',
    name: 'Giant Slayer Longbow',
    attackBonus: 13,
    damageDice: 'd8',
    damageCount: 1,
    damageBonus: 8,
    damageType: 'Piercing',
    range: '150/600 ft',
    notes: 'Ranged · Heavy · Two-Handed · Slow · Mastery',
    isMelee: false,
  },
  {
    id: 'example-shortsword',
    name: 'Shortsword',
    attackBonus: 6,
    damageDice: 'd6',
    damageCount: 1,
    damageBonus: 4,
    damageType: 'Piercing',
    range: '5 ft reach',
    notes: 'Melee · Finesse · Light',
    isMelee: true,
  },
  {
    id: 'example-unarmed',
    name: 'Unarmed Strike',
    attackBonus: 2,
    damageDice: 'd4',
    damageCount: 1,
    damageBonus: 0,
    damageType: 'Bludgeoning',
    range: '5 ft reach',
    isMelee: true,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface ActionsPanelProps {
  character: Character;
}

/**
 * Renders the character's attack actions as a list of WeaponRow components.
 *
 * Uses character.attacks when populated (from DDB import or manual entry),
 * otherwise falls back to EXAMPLE_ATTACKS so the UI is never empty.
 *
 * Each WeaponRow exposes two independent click targets:
 *   - Attack badge  → 1d20 + attackBonus
 *   - Damage badge  → damageDice + damageBonus  (Shift+click = critical: 2× dice)
 */
export function ActionsPanel({ character }: ActionsPanelProps) {
  const attacks = character.attacks?.length ? character.attacks : EXAMPLE_ATTACKS;
  const isUsingExamples = !character.attacks?.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-display flex items-center gap-2">
          <Swords className="h-5 w-5 text-destructive" />
          Actions
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-1.5 pb-4">
        {/* Column headers */}
        <div className="flex items-center gap-2 sm:gap-3 px-3 pb-1">
          <div className="w-4 shrink-0" />
          <div className="flex-1 text-[10px] text-muted-foreground font-display tracking-wider uppercase">
            Weapon / Action
          </div>
          <div className="text-[10px] text-muted-foreground font-display tracking-wider uppercase hidden md:block w-20 text-right">
            Range
          </div>
          {/* Attack column header */}
          <div className="text-[10px] font-display tracking-wider uppercase text-primary/70 w-16 text-center">
            To Hit
          </div>
          {/* Damage column header — hints at shift-click for crit */}
          <div className="text-[10px] font-display tracking-wider uppercase text-destructive/70 w-28 text-center">
            Damage
            <span className="normal-case text-muted-foreground/60 ml-1">(⇧ crit)</span>
          </div>
        </div>

        {attacks.map(weapon => (
          <WeaponRow
            key={weapon.id}
            weapon={weapon}
            characterName={character.name}
          />
        ))}

        {isUsingExamples && (
          <p className="text-[10px] text-muted-foreground/40 text-center pt-2 italic">
            Example attacks shown — sync from D&amp;D Beyond to load your actual weapons
          </p>
        )}
      </CardContent>
    </Card>
  );
}
