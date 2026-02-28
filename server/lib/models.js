/**
 * Core Models for the DnD Party Sync Pivot
 * Based on the "dnd stuff.docx" specifications.
 */

/**
 * @typedef {Object} Character
 * @property {string} id - App-side UUID
 * @property {string} name
 * @property {string} species
 * @property {string} background
 * @property {Array<{name: string, level: number}>} classes
 * @property {number} baseMaxHp
 * @property {number} baseAc
 * @property {number} initiativeBonus
 * @property {number} speed
 * @property {number} proficiencyBonus
 * @property {Object.<string, number>} abilityScores - STR, DEX, CON, INT, WIS, CHA
 * @property {Object.<string, number>} savingThrows
 * @property {Object.<string, number>} skills - camelCase keys
 * @property {{perception: number, insight: number, investigation: number}} passives
 * @property {Object.<number, number>} spellSlots - { 1: 4, 2: 2 }
 * @property {Object.<string, number>} hitDice - { "d10": 8 }
 * @property {Array<{name: string, attackBonus: number, damage: string, properties: string[]}>} weapons
 * @property {Array<{name: string, quantity: number, isAttuned: boolean, grantsSpell: string|null}>} inventory
 * @property {Object} proficiencies - { armor: string[], weapons: string[], tools: string[], languages: string[] }
 * @property {Array<{classSource: string, ability: string, saveDC: number, attackBonus: number}>} spellcasting
 * @property {Array<{name: string, level: number, isConcentration: boolean, alwaysPrepared: boolean, source: string}>} spells
 * @property {Array<{name: string, description: string, resourceType: string|null, maxUses: number|null}>} features
 */

/**
 * @typedef {Object} SessionState
 * @property {string} characterId
 * @property {string} sessionId
 * @property {number} currentHp
 * @property {number} tempHp
 * @property {{successes: number, failures: number}} deathSaves
 * @property {string[]} activeConditions
 * @property {Array<ActiveBuff>} activeBuffs
 * @property {string|null} concentratingOn
 * @property {Object.<number, number>} spellSlotsUsed
 * @property {Object.<string, number>} hitDiceUsed
 * @property {Object.<string, number>} featureUses
 * @property {string[]} activeFeatures
 */

/**
 * @typedef {Object} ActiveBuff
 * @property {string} id
 * @property {string} sourceName
 * @property {string} statAffected
 * @property {string} modifierType - flatBonus | diceBonus | advantage | disadvantage | setAC
 * @property {string} modifierValue
 * @property {number} [durationRounds]
 * @property {boolean} isConcentration
 * @property {string} [casterCharacterId]
 * @property {string[]} targetCharacterIds
 */

/**
 * Creates an initial session state for a character.
 * @param {Character} character 
 * @param {string} sessionId 
 * @returns {SessionState}
 */
function createInitialSessionState(character, sessionId) {
    const featureUses = {};
    (character.features || []).forEach(f => {
        if (f.maxUses !== null && f.maxUses !== undefined) {
            featureUses[f.name] = 0;
        }
    });

    const hitDiceUsed = {};
    Object.keys(character.hitDice || {}).forEach(dieType => {
        hitDiceUsed[dieType] = 0;
    });

    return {
        characterId: character.id,
        sessionId,
        currentHp: character.baseMaxHp,
        tempHp: 0,
        deathSaves: { successes: 0, failures: 0 },
        activeConditions: [],
        activeBuffs: [],
        concentratingOn: null,
        spellSlotsUsed: {},
        hitDiceUsed,
        featureUses,
        activeFeatures: []
    };
}

module.exports = {
    createInitialSessionState
};
