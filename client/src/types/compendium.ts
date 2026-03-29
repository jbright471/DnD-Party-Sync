// ── Entity Types ───────────────────────────────────────────────────────────

export type EntityType = 'monster' | 'spell' | 'item';

export interface CompendiumEntity {
  id: number;
  entity_type: EntityType;
  name: string;
  description: string;
  stats_json: MonsterStats | SpellStats | ItemStats;
  created_at: string;
}

// ── Monster ────────────────────────────────────────────────────────────────

export interface MonsterAction {
  name: string;
  description: string;
}

export interface MonsterStats {
  hp: number;
  ac: number;
  speed: string;
  STR: number;
  DEX: number;
  CON: number;
  INT: number;
  WIS: number;
  CHA: number;
  challenge_rating: string;
  type: string;
  size: 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan';
  abilities: MonsterAction[];
  actions: MonsterAction[];
  legendary_actions?: MonsterAction[];
  saving_throws?: string;
  skills?: string;
  damage_resistances?: string;
  damage_immunities?: string;
  condition_immunities?: string;
  senses?: string;
  languages?: string;
}

// ── Spell ──────────────────────────────────────────────────────────────────

export interface SpellStats {
  level: number;
  school: string;
  casting_time: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  description: string;
  higher_levels?: string;
}

// ── Item ───────────────────────────────────────────────────────────────────

export interface ItemStats {
  type: string;
  rarity: string;
  attunement: boolean;
  acBonus: number;
  statBonuses: Record<string, number>;
  damage: string | null;
  description: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function getAbilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export const MONSTER_DEFAULTS: MonsterStats = {
  hp: 10, ac: 10, speed: '30 ft.',
  STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10,
  challenge_rating: '1', type: 'Beast', size: 'Medium',
  abilities: [], actions: [],
};

export const SPELL_DEFAULTS: SpellStats = {
  level: 1, school: 'Evocation', casting_time: '1 Action',
  range: '60 feet', components: 'V, S', duration: 'Instantaneous',
  concentration: false, description: '',
};

export const ITEM_DEFAULTS: ItemStats = {
  type: 'Wondrous item', rarity: 'Common', attunement: false,
  acBonus: 0, statBonuses: {}, damage: null, description: '',
};
