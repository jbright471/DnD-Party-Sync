import { Character, DndClass, AbilityScores, Equipment, StatModifier, SpellSlots, Spell } from '../types/character';

// D&D Beyond JSON structure (subset of fields we care about)
interface DDBCharacter {
  id?: number;
  name?: string;
  race?: { fullName?: string; baseName?: string };
  classes?: Array<{
    definition?: { name?: string };
    level?: number;
    isStartingClass?: boolean;
  }>;
  stats?: Array<{ id?: number; value?: number | null }>;
  bonusStats?: Array<{ id?: number; value?: number | null }>;
  overrideStats?: Array<{ id?: number; value?: number | null }>;
  baseHitPoints?: number;
  bonusHitPoints?: number;
  removedHitPoints?: number;
  temporaryHitPoints?: number;
  inventory?: Array<{
    id?: number;
    definition?: {
      name?: string;
      description?: string;
      filterType?: string;
      grantedModifiers?: Array<{
        type?: string;
        subType?: string;
        value?: number;
        friendlyTypeName?: string;
        friendlySubtypeName?: string;
      }>;
      armorClass?: number;
      damage?: { diceString?: string };
    };
    equipped?: boolean;
    quantity?: number;
  }>;
  modifiers?: {
    race?: DDBModifier[];
    class?: DDBModifier[];
    background?: DDBModifier[];
    item?: DDBModifier[];
    feat?: DDBModifier[];
    condition?: DDBModifier[];
  };
  spellSlots?: Array<{
    level?: number;
    used?: number;
    available?: number;
  }>;
  classSpells?: Array<{
    spells?: Array<{
      definition?: {
        name?: string;
        level?: number;
        school?: string;
        concentration?: boolean;
        ritual?: boolean;
        castingTimeDescription?: string;
        range?: { origin?: string; rangeValue?: number | null; aoeType?: string; aoeValue?: number | null };
        components?: number[];
        componentsDescription?: string;
        duration?: { durationInterval?: number; durationType?: string; durationUnit?: string };
        description?: string;
        damage?: { diceString?: string };
        saveDcStat?: number | null;
      };
      prepared?: boolean;
      alwaysPrepared?: boolean;
      usesSpellSlot?: boolean;
    }>;
  }>;
  spells?: {
    race?: Array<{ definition?: any; prepared?: boolean; alwaysPrepared?: boolean }>;
    class?: Array<{ definition?: any; prepared?: boolean; alwaysPrepared?: boolean }>;
    feat?: Array<{ definition?: any; prepared?: boolean; alwaysPrepared?: boolean }>;
    item?: Array<{ definition?: any; prepared?: boolean; alwaysPrepared?: boolean }>;
  };
  preferences?: {
    useHomebrewContent?: boolean;
  };
  // Some exports wrap everything in a "data" field
  data?: DDBCharacter;
}

interface DDBModifier {
  type?: string;
  subType?: string;
  value?: number;
  friendlyTypeName?: string;
  friendlySubtypeName?: string;
}

// D&D Beyond stat IDs map to: 1=STR, 2=DEX, 3=CON, 4=INT, 5=WIS, 6=CHA
const STAT_ID_MAP: Record<number, keyof AbilityScores> = {
  1: 'STR', 2: 'DEX', 3: 'CON', 4: 'INT', 5: 'WIS', 6: 'CHA',
};

const VALID_CLASSES: DndClass[] = [
  'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk',
  'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard',
];

function resolveClass(name?: string): DndClass {
  if (!name) return 'Fighter';
  const match = VALID_CLASSES.find(c => c.toLowerCase() === name.toLowerCase());
  return match ?? 'Fighter';
}

function parseAbilityScores(ddb: DDBCharacter): AbilityScores {
  const scores: AbilityScores = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };

  // Base stats
  if (ddb.stats) {
    for (const stat of ddb.stats) {
      if (stat.id && stat.value != null && STAT_ID_MAP[stat.id]) {
        scores[STAT_ID_MAP[stat.id]] = stat.value;
      }
    }
  }

  // Bonus stats
  if (ddb.bonusStats) {
    for (const stat of ddb.bonusStats) {
      if (stat.id && stat.value != null && STAT_ID_MAP[stat.id]) {
        scores[STAT_ID_MAP[stat.id]] += stat.value;
      }
    }
  }

  // Override stats (completely replace)
  if (ddb.overrideStats) {
    for (const stat of ddb.overrideStats) {
      if (stat.id && stat.value != null && STAT_ID_MAP[stat.id]) {
        scores[STAT_ID_MAP[stat.id]] = stat.value;
      }
    }
  }

  // Racial and other modifiers that affect ability scores
  const modSources = ddb.modifiers
    ? [...(ddb.modifiers.race ?? []), ...(ddb.modifiers.feat ?? []), ...(ddb.modifiers.background ?? [])]
    : [];

  for (const mod of modSources) {
    if (mod.type === 'bonus' && mod.value != null) {
      const sub = (mod.subType ?? '').toLowerCase().replace(/-/g, '');
      const abilityMap: Record<string, keyof AbilityScores> = {
        'strengthscore': 'STR', 'dexterityscore': 'DEX', 'constitutionscore': 'CON',
        'intelligencescore': 'INT', 'wisdomscore': 'WIS', 'charismascore': 'CHA',
      };
      if (abilityMap[sub]) {
        scores[abilityMap[sub]] += mod.value;
      }
    }
  }

  return scores;
}

function getSlotForItem(filterType?: string): Equipment['slot'] {
  const map: Record<string, Equipment['slot']> = {
    'Armor': 'chest', 'Shield': 'offHand', 'Weapon': 'mainHand',
    'Ring': 'ring1', 'Wondrous Item': 'amulet', 'Boots': 'feet',
    'Gloves': 'hands', 'Helmet': 'head', 'Hat': 'head',
  };
  return map[filterType ?? ''] ?? 'mainHand';
}

function parseEquipment(ddb: DDBCharacter): Equipment[] {
  if (!ddb.inventory) return [];

  return ddb.inventory
    .filter(item => item.equipped && item.definition)
    .map(item => {
      const def = item.definition!;
      const baseStats: StatModifier[] = [];

      // Extract granted modifiers as base stats
      if (def.grantedModifiers) {
        for (const mod of def.grantedModifiers) {
          if (mod.value != null && mod.value !== 0) {
            const statName = mod.friendlySubtypeName ?? mod.subType ?? mod.friendlyTypeName ?? 'unknown';
            baseStats.push({
              stat: statName,
              modifier: mod.value,
              source: def.name ?? 'Unknown Item',
            });
          }
        }
      }

      // AC from armor
      if (def.armorClass) {
        baseStats.push({
          stat: 'AC',
          modifier: def.armorClass,
          source: def.name ?? 'Armor',
        });
      }

      return {
        id: crypto.randomUUID(),
        name: def.name ?? 'Unknown Item',
        slot: getSlotForItem(def.filterType),
        description: def.description ?? '',
        baseStats,
        parsedBonuses: [],
        equipped: true,
      };
    });
}

function parseSpellSlots(ddb: DDBCharacter): SpellSlots {
  const slots: SpellSlots = {};
  if (ddb.spellSlots) {
    for (const slot of ddb.spellSlots) {
      if (slot.level != null && slot.available != null) {
        slots[slot.level] = {
          max: slot.available,
          used: slot.used ?? 0,
        };
      }
    }
  }
  return slots;
}

const COMPONENT_MAP: Record<number, string> = { 1: 'V', 2: 'S', 3: 'M' };
const SAVE_STAT_MAP: Record<number, string> = { 1: 'STR', 2: 'DEX', 3: 'CON', 4: 'INT', 5: 'WIS', 6: 'CHA' };

function parseSpells(ddb: DDBCharacter): Spell[] {
  const seen = new Set<string>();
  const spells: Spell[] = [];

  function addSpell(raw: any) {
    const def = raw?.definition;
    if (!def?.name) return;
    const key = def.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const components = (def.components || [])
      .map((c: number) => COMPONENT_MAP[c])
      .filter(Boolean)
      .join(', ');

    let durationStr = '';
    if (def.duration) {
      const d = def.duration;
      if (d.durationType === 'Instantaneous' || d.durationType === 'Special') {
        durationStr = d.durationType;
      } else if (d.durationInterval && d.durationUnit) {
        const prefix = def.concentration ? 'Concentration, up to ' : '';
        durationStr = `${prefix}${d.durationInterval} ${d.durationUnit}${d.durationInterval > 1 ? 's' : ''}`;
      }
    }

    spells.push({
      name: def.name,
      level: def.level ?? 0,
      school: def.school ?? undefined,
      prepared: raw.prepared ?? raw.alwaysPrepared ?? false,
      isConcentration: def.concentration ?? false,
      isRitual: def.ritual ?? false,
      castingTime: def.castingTimeDescription ?? undefined,
      range: def.range?.rangeValue != null
        ? `${def.range.rangeValue} ft`
        : def.range?.origin ?? undefined,
      components: components || undefined,
      duration: durationStr || undefined,
      description: def.description ? stripHtml(def.description) : undefined,
      damageDice: def.damage?.diceString ?? undefined,
      saveAbility: def.saveDcStat != null ? (SAVE_STAT_MAP[def.saveDcStat] as any) : undefined,
      alwaysPrepared: raw.alwaysPrepared ?? false,
    });
  }

  // classSpells is the primary source in DDB character exports
  if (ddb.classSpells) {
    for (const classEntry of ddb.classSpells) {
      for (const spell of classEntry.spells ?? []) {
        addSpell(spell);
      }
    }
  }

  // Also check race/feat/item spell sources
  if (ddb.spells && typeof ddb.spells === 'object' && !Array.isArray(ddb.spells)) {
    for (const source of ['race', 'class', 'feat', 'item'] as const) {
      for (const spell of (ddb.spells as any)[source] ?? []) {
        addSpell(spell);
      }
    }
  }

  return spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

function calculateTotalLevel(ddb: DDBCharacter): number {
  if (!ddb.classes || ddb.classes.length === 0) return 1;
  return ddb.classes.reduce((sum, c) => sum + (c.level ?? 0), 0);
}

function calculateMaxHP(ddb: DDBCharacter, conMod: number, level: number): number {
  const base = ddb.baseHitPoints ?? 10;
  const bonus = ddb.bonusHitPoints ?? 0;
  // D&D Beyond baseHitPoints already includes CON modifier per level in most exports
  // but sometimes it's just the rolled/average HP
  return base + bonus;
}

export function parseDDBCharacter(json: unknown): Character {
  let ddb = json as DDBCharacter;

  // Handle wrapped format (some exports wrap in { data: { ... } })
  if (ddb.data && ddb.data.name) {
    ddb = ddb.data;
  }

  // Also handle { character: { ... } } format
  if ((json as any).character) {
    ddb = (json as any).character;
  }

  const level = calculateTotalLevel(ddb);
  const abilityScores = parseAbilityScores(ddb);
  const conMod = Math.floor((abilityScores.CON - 10) / 2);
  const maxHP = calculateMaxHP(ddb, conMod, level);
  const removedHP = ddb.removedHitPoints ?? 0;
  const tempHP = ddb.temporaryHitPoints ?? 0;

  const primaryClass = ddb.classes?.find(c => c.isStartingClass) ?? ddb.classes?.[0];

  const equipment = parseEquipment(ddb);
  const spellSlots = parseSpellSlots(ddb);
  const spells = parseSpells(ddb);

  // Calculate AC from modifiers
  let ac = 10; // base
  const itemMods = ddb.modifiers?.item ?? [];
  for (const mod of itemMods) {
    if (mod.type === 'set' && (mod.subType ?? '').toLowerCase().includes('armor')) {
      ac = Math.max(ac, mod.value ?? 10);
    }
  }
  // Also check equipment for AC values
  const armorAC = equipment
    .flatMap(e => e.baseStats)
    .filter(s => s.stat === 'AC')
    .reduce((max, s) => Math.max(max, s.modifier), 0);
  if (armorAC > 0) {
    ac = Math.max(ac, armorAC + Math.min(conMod, 2)); // simplified; real AC calc is complex
  }

  const dexMod = Math.floor((abilityScores.DEX - 10) / 2);
  if (ac === 10) {
    ac = 10 + dexMod; // unarmored
  }

  return {
    id: crypto.randomUUID(),
    name: ddb.name ?? 'Imported Character',
    class: resolveClass(primaryClass?.definition?.name),
    level,
    hp: {
      current: Math.max(0, maxHP - removedHP),
      max: maxHP,
      temp: tempHP,
    },
    ac,
    abilityScores,
    conditions: [],
    equipment,
    spellSlots,
    spells,
    abilities: [],
    proficiencyBonus: Math.ceil(level / 4) + 1,
    speed: 30, // Could be parsed from modifiers but varies by race
    initiative: dexMod,
    activeBuffs: [],
  };
}

export function validateDDBJson(json: unknown): { valid: boolean; error?: string } {
  if (!json || typeof json !== 'object') {
    return { valid: false, error: 'Invalid JSON file' };
  }

  const obj = json as any;
  const data = obj.data ?? obj.character ?? obj;

  if (!data.name && !data.stats) {
    return { valid: false, error: 'This doesn\'t appear to be a D&D Beyond character export. Expected fields like "name" and "stats".' };
  }

  return { valid: true };
}
