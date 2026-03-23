import { Character, AbilityScore, getAbilityModifier } from '../types/character';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { RollableStat } from './RollableStat';
import { Shield, BookOpen } from 'lucide-react';

// ── Data ────────────────────────────────────────────────────────────────────

const SKILLS: { label: string; ability: AbilityScore }[] = [
  { label: 'Acrobatics',     ability: 'DEX' },
  { label: 'Animal Handling', ability: 'WIS' },
  { label: 'Arcana',         ability: 'INT' },
  { label: 'Athletics',      ability: 'STR' },
  { label: 'Deception',      ability: 'CHA' },
  { label: 'History',        ability: 'INT' },
  { label: 'Insight',        ability: 'WIS' },
  { label: 'Intimidation',   ability: 'CHA' },
  { label: 'Investigation',  ability: 'INT' },
  { label: 'Medicine',       ability: 'WIS' },
  { label: 'Nature',         ability: 'INT' },
  { label: 'Perception',     ability: 'WIS' },
  { label: 'Performance',    ability: 'CHA' },
  { label: 'Persuasion',     ability: 'CHA' },
  { label: 'Religion',       ability: 'INT' },
  { label: 'Sleight of Hand', ability: 'DEX' },
  { label: 'Stealth',        ability: 'DEX' },
  { label: 'Survival',       ability: 'WIS' },
];

const SAVING_THROWS: { label: string; ability: AbilityScore }[] = [
  { label: 'Strength',     ability: 'STR' },
  { label: 'Dexterity',    ability: 'DEX' },
  { label: 'Constitution', ability: 'CON' },
  { label: 'Intelligence', ability: 'INT' },
  { label: 'Wisdom',       ability: 'WIS' },
  { label: 'Charisma',     ability: 'CHA' },
];

// ── Component ────────────────────────────────────────────────────────────────

interface StatChecksProps {
  character: Character;
}

/**
 * Renders clickable Saving Throw and Skill Check rows.
 *
 * Modifiers are computed from base ability scores (ability modifier only).
 * Per-skill proficiency is not yet tracked in the Character schema; the
 * proficiency dot is reserved for a future enhancement.
 */
export function StatChecks({ character }: StatChecksProps) {
  const { abilityScores, name } = character;

  return (
    <div className="space-y-4">
      {/* Saving Throws */}
      <Card>
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-mana" />
            Saving Throws
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3">
          {SAVING_THROWS.map(({ label, ability }) => (
            <RollableStat
              key={ability}
              label={label}
              sublabel={ability}
              modifier={getAbilityModifier(abilityScores[ability])}
              rollType="Saving Throw"
              characterName={name}
              variant="row"
            />
          ))}
        </CardContent>
      </Card>

      {/* Skills */}
      <Card>
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Skills
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3">
          {SKILLS.map(({ label, ability }) => (
            <RollableStat
              key={label}
              label={label}
              sublabel={ability}
              modifier={getAbilityModifier(abilityScores[ability])}
              rollType="Skill Check"
              characterName={name}
              variant="row"
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
