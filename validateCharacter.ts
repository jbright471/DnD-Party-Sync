// lib/validateCharacter.ts
//
// Runs sanity checks on a parsed Character object BEFORE it gets saved to your DB.
// Catches the most common LLM extraction mistakes so they fail loudly at import
// time rather than silently corrupting your rules engine during a session.

import type { Character } from './character';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateCharacter(c: Character): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Required identity fields ---
  if (!c.name || c.name.trim() === '') errors.push('name is empty');
  if (!c.species) errors.push('species is missing');
  if (!c.classes || c.classes.length === 0) errors.push('classes array is empty');

  // --- Level sanity ---
  const totalLevel = c.classes.reduce((sum, cls) => sum + cls.level, 0);
  if (totalLevel < 1 || totalLevel > 20) {
    errors.push(`Total level ${totalLevel} is outside valid range 1–20`);
  }

  // --- HP sanity ---
  if (c.baseMaxHp <= 0) {
    errors.push(`baseMaxHp must be > 0 (got ${c.baseMaxHp})`);
  }
  // Minimum possible HP for a level 1 character is 1
  if (c.baseMaxHp > totalLevel * 20 + 200) {
    warnings.push(`baseMaxHp ${c.baseMaxHp} seems unusually high for level ${totalLevel}`);
  }

  // --- AC sanity ---
  if (c.baseAc < 10 || c.baseAc > 30) {
    warnings.push(`baseAc ${c.baseAc} is outside the typical range 10–30`);
  }

  // --- Ability scores: LLM commonly confuses scores with modifiers ---
  const ABILITY_SCORES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
  for (const ability of ABILITY_SCORES) {
    const score = c.abilityScores[ability];
    if (score === undefined || score === null) {
      errors.push(`abilityScores.${ability} is missing`);
    } else if (score < 1 || score > 30) {
      errors.push(
        `abilityScores.${ability} = ${score} is outside valid range 1–30. ` +
        `LLM may have extracted the modifier instead of the score.`
      );
    }
    // Flag if all scores look like modifiers (all between -5 and +10)
    // This is the #1 LLM mistake on character sheets
    if (score >= -5 && score <= 10 && Object.values(c.abilityScores).every(s => s >= -5 && s <= 10)) {
      warnings.push(
        'All ability scores are in the range -5 to +10. ' +
        'LLM may have extracted modifiers instead of base scores. ' +
        'Expected values like 8, 14, 18 — not -1, +2, +4.'
      );
      break;
    }
  }

  // --- Proficiency bonus: tied to total level ---
  const expectedProfBonus = Math.ceil(totalLevel / 4) + 1;
  if (c.proficiencyBonus !== expectedProfBonus) {
    warnings.push(
      `proficiencyBonus is ${c.proficiencyBonus} but level ${totalLevel} should give +${expectedProfBonus}`
    );
  }

  // --- Spell slots: only relevant for spellcasters ---
  const hasCasting = c.spellcasting.length > 0;
  if (hasCasting && Object.keys(c.spellSlots).length === 0) {
    warnings.push('Character has spellcasting entries but no spellSlots — spell slot data may not have been extracted');
  }

  // Check slot counts look reasonable (no level can have > 4 slots in 5e)
  for (const [level, count] of Object.entries(c.spellSlots)) {
    if (count > 4) {
      warnings.push(
        `spellSlots[${level}] = ${count} — 5e caps slots per level at 4 for most classes. ` +
        `LLM may have miscounted the bubble characters.`
      );
    }
    if (count < 0) {
      errors.push(`spellSlots[${level}] cannot be negative (got ${count})`);
    }
  }

  // --- Concentration: warn if multiple concentration spells are always-prepared ---
  // (not a hard error, just a flag — some features bend this rule)
  const alwaysPreparedConc = c.spells.filter(s => s.alwaysPrepared && s.isConcentration);
  if (alwaysPreparedConc.length > 1) {
    warnings.push(
      `${alwaysPreparedConc.length} always-prepared concentration spells detected ` +
      `(${alwaysPreparedConc.map(s => s.name).join(', ')}). ` +
      `Only one can be active at a time — this is expected but worth reviewing.`
    );
  }

  // --- Item-granted spells: check they exist in the spell list ---
  for (const item of c.inventory) {
    if (item.grantsSpell) {
      const spellExists = c.spells.some(
        s => s.name.toLowerCase() === item.grantsSpell!.toLowerCase()
      );
      if (!spellExists) {
        warnings.push(
          `Item "${item.name}" has grantsSpell: "${item.grantsSpell}" ` +
          `but no matching spell was found in the spells array. ` +
          `The spell may have been missed during extraction.`
        );
      }
    }
  }

  // --- Hit dice: total should match total level ---
  const totalHitDice = Object.values(c.hitDice).reduce((sum, n) => sum + n, 0);
  if (totalHitDice !== totalLevel) {
    warnings.push(
      `Total hit dice count ${totalHitDice} doesn't match total level ${totalLevel}. ` +
      `hitDice may be incomplete.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Usage in your import route:
//
//   const character = await parsePdfToCharacter(buffer, { callLLM });
//   const validation = validateCharacter(character);
//
//   if (!validation.valid) {
//     return reply.status(422).send({ 
//       error: 'Character data failed validation',
//       errors: validation.errors,
//       warnings: validation.warnings
//     });
//   }
//
//   if (validation.warnings.length > 0) {
//     console.warn('Import warnings for', character.name, validation.warnings);
//     // Save anyway, but log warnings so you can inspect them
//   }
//
//   await prisma.character.create({ data: character });
// ---------------------------------------------------------------------------
