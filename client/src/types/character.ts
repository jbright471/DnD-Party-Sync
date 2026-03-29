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

/** An item sitting in the shared party loot pool, waiting to be claimed. */
export interface SharedLootItem {
  id: number;
  name: string;
  description: string;
  category: string;
  rarity: string;
  stats: Record<string, unknown>;
  droppedBy: string;
  createdAt: string;
}

export type DndClass = 'Barbarian' | 'Bard' | 'Cleric' | 'Druid' | 'Fighter' | 'Monk' | 'Paladin' | 'Ranger' | 'Rogue' | 'Sorcerer' | 'Warlock' | 'Wizard';

export type SpellSchool =
  | 'Abjuration' | 'Conjuration' | 'Divination' | 'Enchantment'
  | 'Evocation' | 'Illusion' | 'Necromancy' | 'Transmutation';

export interface Spell {
  name: string;
  /** 0 = cantrip, 1–9 = leveled */
  level: number;
  school?: SpellSchool | string;
  prepared?: boolean;
  isConcentration?: boolean;
  castingTime?: string;
  range?: string;
  components?: string;
  duration?: string;
  description?: string;
  damageDice?: string;
  damageType?: DamageType | string;
  saveAbility?: AbilityScore;
  isRitual?: boolean;
  source?: string;
  alwaysPrepared?: boolean;
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

// ── Manual Item Form Schema ───────────────────────────────────────────────────

export type ItemCategory =
  | 'Weapon' | 'Armor' | 'Gear' | 'Magic Item'
  | 'Potion' | 'Wondrous Item' | 'Ammunition' | 'Tool';

export type ItemRarity =
  | 'Common' | 'Uncommon' | 'Rare' | 'Very Rare' | 'Legendary' | 'Artifact';

export type WeaponProperty =
  | 'Ammunition' | 'Finesse' | 'Heavy' | 'Light' | 'Loading'
  | 'Reach' | 'Thrown' | 'Two-Handed' | 'Versatile'
  | 'Silvered' | 'Adamantine' | 'Special';

export type WeaponMastery =
  | '' | 'Cleave' | 'Graze' | 'Nick' | 'Push' | 'Sap' | 'Slow' | 'Topple' | 'Vex';

export type ArmorCategory = 'Light' | 'Medium' | 'Heavy' | 'Shield';

export interface ManualItemFormData {
  // Base Details
  name: string;
  category: ItemCategory;
  rarity: ItemRarity;
  weight: string;
  cost: string;
  requiresAttunement: boolean;
  attunementNote: string;
  description: string;

  // Weapon Specifics (shown when category === 'Weapon')
  attackType: 'Melee' | 'Ranged';
  isProficient: boolean;
  proficiencyBonus: number;
  abilityMod: number;
  magicBonus: number;
  attackBonusOverride: number | null; // null = auto-compute
  damageDice: DieType;
  damageCount: number;
  damageBonus: number;
  damageType: DamageType;
  range: string;
  properties: WeaponProperty[];
  mastery: WeaponMastery;

  // Armor Specifics (shown when category === 'Armor')
  armorCategory: ArmorCategory;
  baseAc: number;
  plusBonus: number;
  maxDexMod: number | null;   // null = no cap
  stealthDisadvantage: boolean;
  strengthRequirement: number;

  // Magic Item Specifics (shown when category === 'Magic Item' or requiresAttunement)
  charges: number | null;
  rechargeOn: '' | 'Dawn' | 'Dusk' | 'Short Rest' | 'Long Rest';
}

export const ITEM_CATEGORIES: ItemCategory[] = [
  'Weapon', 'Armor', 'Gear', 'Magic Item', 'Potion', 'Wondrous Item', 'Ammunition', 'Tool',
];

export const ITEM_RARITIES: ItemRarity[] = [
  'Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact',
];

export const WEAPON_PROPERTIES: WeaponProperty[] = [
  'Ammunition', 'Finesse', 'Heavy', 'Light', 'Loading',
  'Reach', 'Thrown', 'Two-Handed', 'Versatile',
  'Silvered', 'Adamantine', 'Special',
];

export const WEAPON_MASTERIES: { value: WeaponMastery; description: string }[] = [
  { value: '',       description: 'None' },
  { value: 'Cleave', description: 'Cleave — hit another creature within reach' },
  { value: 'Graze',  description: 'Graze — deal ability mod damage on a miss' },
  { value: 'Nick',   description: 'Nick — extra attack with the Light property' },
  { value: 'Push',   description: 'Push — push target 10 ft on hit' },
  { value: 'Sap',    description: 'Sap — target has Disadvantage on next attack' },
  { value: 'Slow',   description: 'Slow — reduce target Speed by 10 ft' },
  { value: 'Topple', description: 'Topple — target must save or fall Prone' },
  { value: 'Vex',    description: 'Vex — gain Advantage on your next attack' },
];

export const MANUAL_ITEM_DEFAULTS: ManualItemFormData = {
  name: '',
  category: 'Weapon',
  rarity: 'Common',
  weight: '',
  cost: '',
  requiresAttunement: false,
  attunementNote: '',
  description: '',
  attackType: 'Melee',
  isProficient: true,
  proficiencyBonus: 2,
  abilityMod: 3,
  magicBonus: 0,
  attackBonusOverride: null,
  damageDice: 'd8',
  damageCount: 1,
  damageBonus: 0,
  damageType: 'Slashing',
  range: '5 ft reach',
  properties: [],
  mastery: '',
  armorCategory: 'Medium',
  baseAc: 14,
  plusBonus: 0,
  maxDexMod: 2,
  stealthDisadvantage: false,
  strengthRequirement: 0,
  charges: null,
  rechargeOn: '',
};

// ─────────────────────────────────────────────────────────────────────────────

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
  /** Maps lowercase condition name → remaining rounds. Missing = permanent. */
  conditionDurations: Record<string, number>;
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
  /** Total hit dice by type, e.g. { "d10": 8 } */
  hitDice: Record<string, number>;
  /** Hit dice spent this rest cycle, e.g. { "d10": 2 } */
  hitDiceUsed: Record<string, number>;
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
    conditionDurations: {},
    hitDice: {},
    hitDiceUsed: {},
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
