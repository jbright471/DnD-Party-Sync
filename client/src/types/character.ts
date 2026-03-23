export type AbilityScore = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

export interface AbilityScores {
  STR: number;
  DEX: number;
  CON: number;
  INT: number;
  WIS: number;
  CHA: number;
}

export type EquipmentSlot = 'head' | 'chest' | 'legs' | 'feet' | 'hands' | 'mainHand' | 'offHand' | 'ring1' | 'ring2' | 'amulet';

export interface StatModifier {
  stat: string;
  modifier: number;
  source: string;
}

export interface Equipment {
  id: string;
  name: string;
  slot?: EquipmentSlot;
  description: string;
  baseStats?: StatModifier[];
  stats?: any; // LLM parsed stats
  parsedBonuses?: StatModifier[];
  equipped: boolean;
  isHomebrew?: boolean;
}

export type DndClass = 'Barbarian' | 'Bard' | 'Cleric' | 'Druid' | 'Fighter' | 'Monk' | 'Paladin' | 'Ranger' | 'Rogue' | 'Sorcerer' | 'Warlock' | 'Wizard';

export interface Spell {
  name: string;
  level: number;
  school?: string;
  prepared?: boolean;
  isConcentration?: boolean;
}

export interface Ability {
  name: string;
  source: string;
  description?: string;
}

export interface SpellSlots {
  [level: number]: { max: number; used: number };
}

export interface ActiveBuff {
  id: string;
  name: string;
  stat: string;
  modifier: number;
  source: string;
}

export type DamageType =
  | 'Piercing' | 'Slashing' | 'Bludgeoning'
  | 'Fire' | 'Cold' | 'Lightning' | 'Thunder'
  | 'Acid' | 'Poison' | 'Necrotic' | 'Radiant'
  | 'Psychic' | 'Force';

export interface WeaponAttack {
  id: string;
  name: string;
  /** Total attack bonus already computed (prof + ability + magic) */
  attackBonus: number;
  /** Die face for damage, e.g. 'd8' */
  damageDice: DieType;
  /** Number of damage dice, e.g. 1 for "1d8" */
  damageCount: number;
  /** Flat damage modifier (ability mod + magic bonus) */
  damageBonus: number;
  damageType: DamageType;
  /** Display string, e.g. "150/600 ft" or "5 ft reach" */
  range?: string;
  /** Freeform property tags, e.g. "Heavy · Two-Handed · Ranged" */
  notes?: string;
  isMelee?: boolean;
}

export const DND_CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 
  'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned',
  'Prone', 'Restrained', 'Stunned', 'Unconscious', 'Exhaustion'
] as const;

export type DndCondition = typeof DND_CONDITIONS[number];

export interface Character {
  id: string;
  name: string;
  class: string;
  level: number;
  hp: { current: number; max: number; temp: number };
  ac: number;
  acBreakdown?: any[];
  abilityScores: AbilityScores;
  conditions: string[];
  equipment: Equipment[];
  homebrewInventory: Equipment[];
  spellSlots: SpellSlots;
  spells: Spell[];
  abilities: Ability[];
  proficiencyBonus: number;
  speed: number;
  initiative: number;
  activeBuffs: ActiveBuff[];
  concentratingOn?: string | null;
  raw_dndbeyond_json?: string;
  /** Structured attack actions — populated from DDB import or manual entry */
  attacks?: WeaponAttack[];
}

// ... rest of the file helpers remain the same
export type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

export interface DiceRoll {
  die: DieType;
  count: number;
  modifier: number;
  results: number[];
  total: number;
}

export interface ActionLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action_description: string;
}

export interface Combatant {
  characterId: string;
  name: string;
  initiative: number;
  dexterity: number;
}

export interface CombatState {
  active: boolean;
  combatants: Combatant[];
  currentTurnIndex: number;
  round: number;
}

export interface Party {
  code: string;
  name: string;
  members: Character[];
  actionLog: ActionLogEntry[];
  combat: CombatState | null;
}

export const DND_CLASSES: DndClass[] = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];

export const EQUIPMENT_SLOTS: { value: EquipmentSlot; label: string }[] = [
  { value: 'head', label: 'Head' },
  { value: 'chest', label: 'Chest' },
  { value: 'legs', label: 'Legs' },
  { value: 'feet', label: 'Feet' },
  { value: 'hands', label: 'Hands' },
  { value: 'mainHand', label: 'Main Hand' },
  { value: 'offHand', label: 'Off Hand' },
  { value: 'ring1', label: 'Ring 1' },
  { value: 'ring2', label: 'Ring 2' },
  { value: 'amulet', label: 'Amulet' },
];

export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollDice(die: DieType, count: number = 1, modifier: number = 0): DiceRoll {
  const sides = parseInt(die.slice(1));
  const results = Array.from({ length: count }, () => rollDie(sides));
  const total = results.reduce((sum, r) => sum + r, 0) + modifier;
  return { die, count, modifier, results, total };
}

export function createDefaultCharacter(id: string): Character {
  return {
    id,
    name: '',
    class: 'Fighter',
    level: 1,
    hp: { current: 10, max: 10, temp: 0 },
    ac: 10,
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    conditions: [],
    equipment: [],
    homebrewInventory: [],
    spellSlots: {},
    spells: [],
    abilities: [],
    proficiencyBonus: 2,
    speed: 30,
    initiative: 0,
    activeBuffs: [],
  };
}
