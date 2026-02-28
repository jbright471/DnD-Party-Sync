/**
 * Character Validation Logic
 * Catches common LLM extraction errors.
 */

function validateCharacter(c) {
    const errors = [];
    const warnings = [];

    // Identity
    if (!c.name || c.name.trim() === '') errors.push('name is empty');
    if (!c.species) errors.push('species is missing');
    if (!c.classes || c.classes.length === 0) errors.push('classes array is empty');

    // Level
    const totalLevel = (c.classes || []).reduce((sum, cls) => sum + (cls.level || 0), 0);
    if (totalLevel < 1 || totalLevel > 20) {
        errors.push(`Total level ${totalLevel} is outside valid range 1–20`);
    }

    // HP
    if (c.baseMaxHp <= 0) {
        errors.push(`baseMaxHp must be > 0 (got ${c.baseMaxHp})`);
    }

    // Ability Scores
    const ABILITY_SCORES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
    if (c.abilityScores) {
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
        }

        // Flag if all scores look like modifiers
        const values = Object.values(c.abilityScores);
        if (values.every(s => s >= -5 && s <= 10)) {
            warnings.push(
                'All ability scores are in the range -5 to +10. ' +
                'LLM may have extracted modifiers instead of base scores. ' +
                'Expected values like 8, 14, 18 — not -1, +2, +4.'
            );
        }
    } else {
        errors.push('abilityScores object is missing');
    }

    // Spell slots
    if (c.spellcasting && c.spellcasting.length > 0 && (!c.spellSlots || Object.keys(c.spellSlots).length === 0)) {
        warnings.push('Character has spellcasting entries but no spellSlots — spell slot data may not have been extracted');
    }

    if (c.spellSlots) {
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
    }

    // Hit dice
    const totalHitDice = Object.values(c.hitDice || {}).reduce((sum, n) => sum + n, 0);
    if (totalHitDice !== totalLevel) {
        warnings.push(
            `Total hit dice count ${totalHitDice} doesn't match total level ${totalLevel}. ` +
            `hitDice may be incomplete.`
        );
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

module.exports = {
    validateCharacter
};
