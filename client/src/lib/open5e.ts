/**
 * open5e SRD API client — searches the open5e v1 API for official 5e SRD
 * content and normalizes results into our CompendiumEntity schema.
 *
 * API docs: https://api.open5e.com/
 */
import type {
  CompendiumEntity, EntityType,
  MonsterStats, SpellStats, ItemStats,
} from '../types/compendium';

const BASE = 'https://api.open5e.com/v1';

// ── Raw API response shapes ──────────────────────────────────────────────

interface Open5eListResponse<T> {
  count: number;
  results: T[];
}

interface Open5eMonster {
  slug: string;
  name: string;
  size: string;
  type: string;
  armor_class: number;
  hit_points: number;
  speed: Record<string, number>;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  challenge_rating: string;
  actions: { name: string; desc: string }[];
  special_abilities?: { name: string; desc: string }[];
  legendary_actions?: { name: string; desc: string }[];
  strength_save?: number | null;
  dexterity_save?: number | null;
  constitution_save?: number | null;
  intelligence_save?: number | null;
  wisdom_save?: number | null;
  charisma_save?: number | null;
  perception?: number | null;
  damage_resistances: string;
  damage_immunities: string;
  condition_immunities: string;
  senses: string;
  languages: string;
  skills?: Record<string, number>;
  desc?: string;
}

interface Open5eSpell {
  slug: string;
  name: string;
  level: string;        // "0", "1", "2", …
  level_int: number;
  school: string;
  casting_time: string;
  range: string;
  components: string;
  duration: string;
  concentration: string; // "yes" | "no"
  desc: string;
  higher_level?: string;
}

interface Open5eItem {
  slug: string;
  name: string;
  type: string;
  rarity: string;
  requires_attunement: string; // "requires attunement" | ""
  desc: string;
}

// ── Normalizers ──────────────────────────────────────────────────────────

function normalizeSize(raw: string): MonsterStats['size'] {
  const map: Record<string, MonsterStats['size']> = {
    tiny: 'Tiny', small: 'Small', medium: 'Medium',
    large: 'Large', huge: 'Huge', gargantuan: 'Gargantuan',
  };
  return map[raw.toLowerCase()] ?? 'Medium';
}

function formatSpeed(speed: Record<string, number>): string {
  return Object.entries(speed)
    .map(([mode, ft]) => mode === 'walk' ? `${ft} ft.` : `${mode} ${ft} ft.`)
    .join(', ');
}

function formatSaves(m: Open5eMonster): string {
  const saves: string[] = [];
  if (m.strength_save != null) saves.push(`STR +${m.strength_save}`);
  if (m.dexterity_save != null) saves.push(`DEX +${m.dexterity_save}`);
  if (m.constitution_save != null) saves.push(`CON +${m.constitution_save}`);
  if (m.intelligence_save != null) saves.push(`INT +${m.intelligence_save}`);
  if (m.wisdom_save != null) saves.push(`WIS +${m.wisdom_save}`);
  if (m.charisma_save != null) saves.push(`CHA +${m.charisma_save}`);
  return saves.join(', ');
}

function formatSkills(skills?: Record<string, number>): string {
  if (!skills || Object.keys(skills).length === 0) return '';
  return Object.entries(skills)
    .map(([name, bonus]) => `${name.charAt(0).toUpperCase() + name.slice(1)} +${bonus}`)
    .join(', ');
}

function monsterToEntity(m: Open5eMonster): CompendiumEntity {
  const stats: MonsterStats = {
    hp: m.hit_points,
    ac: m.armor_class,
    speed: formatSpeed(m.speed ?? {}),
    STR: m.strength,
    DEX: m.dexterity,
    CON: m.constitution,
    INT: m.intelligence,
    WIS: m.wisdom,
    CHA: m.charisma,
    challenge_rating: m.challenge_rating,
    type: m.type,
    size: normalizeSize(m.size),
    abilities: (m.special_abilities ?? []).map(a => ({ name: a.name, description: a.desc })),
    actions: (m.actions ?? []).map(a => ({ name: a.name, description: a.desc })),
    legendary_actions: (m.legendary_actions ?? []).map(a => ({ name: a.name, description: a.desc })),
    saving_throws: formatSaves(m),
    skills: formatSkills(m.skills),
    damage_resistances: m.damage_resistances,
    damage_immunities: m.damage_immunities,
    condition_immunities: m.condition_immunities,
    senses: m.senses,
    languages: m.languages,
  };
  return {
    id: slugId(m.slug),
    entity_type: 'monster',
    name: m.name,
    description: m.desc ?? '',
    stats_json: stats,
    created_at: '',
  };
}

function spellToEntity(s: Open5eSpell): CompendiumEntity {
  const stats: SpellStats = {
    level: s.level_int,
    school: s.school,
    casting_time: s.casting_time,
    range: s.range,
    components: s.components,
    duration: s.duration,
    concentration: s.concentration === 'yes',
    description: s.desc,
    higher_levels: s.higher_level || undefined,
  };
  return {
    id: slugId(s.slug),
    entity_type: 'spell',
    name: s.name,
    description: s.desc,
    stats_json: stats,
    created_at: '',
  };
}

function itemToEntity(i: Open5eItem): CompendiumEntity {
  const stats: ItemStats = {
    type: i.type || 'Wondrous item',
    rarity: i.rarity || 'Common',
    attunement: i.requires_attunement.toLowerCase().includes('attunement'),
    acBonus: 0,
    statBonuses: {},
    damage: null,
    description: i.desc,
  };
  return {
    id: slugId(i.slug),
    entity_type: 'item',
    name: i.name,
    description: i.desc,
    stats_json: stats,
    created_at: '',
  };
}

/** Deterministic negative ID from slug so it never collides with DB IDs */
function slugId(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = ((hash << 5) - hash + slug.charCodeAt(i)) | 0;
  }
  return -(Math.abs(hash) + 1); // always negative
}

// ── Public API ───────────────────────────────────────────────────────────

export interface SrdSearchResult {
  entities: CompendiumEntity[];
  total: number;
}

export async function searchSrd(
  query: string,
  entityType: EntityType | 'all',
  limit = 20,
): Promise<SrdSearchResult> {
  if (!query.trim()) return { entities: [], total: 0 };

  const types: EntityType[] = entityType === 'all'
    ? ['monster', 'spell', 'item']
    : [entityType];

  const fetches = types.map(async (type) => {
    try {
      const endpoint = type === 'monster' ? 'monsters'
        : type === 'spell' ? 'spells'
        : 'magicitems';
      const url = `${BASE}/${endpoint}/?search=${encodeURIComponent(query)}&limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) return [] as CompendiumEntity[];
      const data: Open5eListResponse<any> = await res.json();

      if (type === 'monster') return data.results.map(monsterToEntity);
      if (type === 'spell') return data.results.map(spellToEntity);
      return data.results.map(itemToEntity);
    } catch {
      return [] as CompendiumEntity[];
    }
  });

  const results = (await Promise.all(fetches)).flat();
  return { entities: results, total: results.length };
}

export async function fetchSrdMonster(slug: string): Promise<CompendiumEntity | null> {
  try {
    const res = await fetch(`${BASE}/monsters/${slug}/`);
    if (!res.ok) return null;
    return monsterToEntity(await res.json());
  } catch {
    return null;
  }
}

export async function fetchSrdSpell(slug: string): Promise<CompendiumEntity | null> {
  try {
    const res = await fetch(`${BASE}/spells/${slug}/`);
    if (!res.ok) return null;
    return spellToEntity(await res.json());
  } catch {
    return null;
  }
}
