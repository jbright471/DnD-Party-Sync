// types/character.ts

export type AbilityScore = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

export type ModifierType = 'flatBonus' | 'diceBonus' | 'advantage' | 'disadvantage' | 'setAC';

export interface Character {
  id: string; // your app's UUID, assigned at import time
  name: string;
  species: string;
  background: string;
  classes: Array<{ name: string; level: number }>;

  // Base defensive & utility stats
  baseMaxHp: number;
  baseAc: number;
  initiativeBonus: number;
  speed: number;
  proficiencyBonus: number;

  // Core stats
  abilityScores: Record<AbilityScore, number>;
  savingThrows: Record<AbilityScore, number>;
  skills: Record<string, number>; // full 18 skills, camelCase keys

  passives: {
    perception: number;
    insight: number;
    investigation: number;
  };

  // Spell resources — extracted from bubble notation in PDF (e.g. "4 Slots OOOO")
  spellSlots: Record<number, number>; // { 1: 4, 2: 2, 3: 1 }

  // Combat & Equipment
  weapons: Array<{
    name: string;
    attackBonus: number;
    damage: string; // e.g. "1d8+8 Piercing"
    properties: string[];
  }>;

  inventory: Array<{
    name: string;
    quantity: number;
    isAttuned: boolean;
    grantsSpell?: string; // e.g. "Water Walk" for Ring of Water Walking
  }>;

  proficiencies: {
    armor: string[];
    weapons: string[];
    tools: string[];
    languages: string[];
  };

  // Spellcasting — array to support multiclass (each class entry separate)
  spellcasting: Array<{
    classSource: string;
    ability: AbilityScore;
    saveDC: number;
    attackBonus: number;
  }>;

  spells: Array<{
    name: string;
    level: number;
    isConcentration: boolean;
    alwaysPrepared: boolean;
    source: string; // e.g. "Monster Slayer Magic", "Ring of Water Walking"
  }>;

  // Class features and limited-use abilities
  features: Array<{
    name: string;
    description?: string;
    resourceType?: 'shortRest' | 'longRest' | 'perDay' | 'toggle'; // undefined = passive
    maxUses?: number; // undefined for toggles and passives
  }>;

  // Hit dice by die type (multiclass can have mixed, e.g. d10 + d8)
  hitDice: Record<string, number>; // { "d10": 8 } for J (5+3 levels, all d10)
}

// types/session.ts

export interface ActiveBuff {
  id: string; // UUID for removal targeting
  sourceName: string; // e.g. "Bless", "Shield of Faith"
  statAffected: string; // e.g. "attackRoll", "savingThrow", "AC"
  modifierType: ModifierType;
  modifierValue: string; // e.g. "+1d4", "+2", "18"
  durationRounds?: number; // undefined = indefinite (until removed manually)
  isConcentration: boolean;
  casterCharacterId?: string; // who is concentrating — dropping this removes the buff
  targetCharacterIds: string[]; // all affected characters (for auras: whole party)
}

export interface SessionState {
  characterId: string;
  sessionId: string;

  // Volatile HP
  currentHp: number;
  tempHp: number;
  deathSaves: { successes: number; failures: number };

  // Active modifiers
  activeConditions: string[]; // e.g. ['poisoned', 'prone', 'blessed']
  activeBuffs: ActiveBuff[];

  // Spellcasting resources
  concentratingOn: string | null; // spell name, or null
  spellSlotsUsed: Record<number, number>; // { 1: 3, 2: 1 }

  // Physical recovery resources
  hitDiceUsed: Record<string, number>; // { "d10": 2 }

  // Feature resources: counted uses (e.g. Hunter's Sense: 1 of 3 used)
  featureUses: Record<string, number>;

  // Feature toggles: on/off state (e.g. Crimson Rite: active or not)
  activeFeatures: string[]; // feature names currently toggled ON
}
