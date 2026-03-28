export function normaliseCharacter(raw) {
    return {
        id: raw.id,
        name: raw.name,
        classes: raw.classes ?? [{ name: raw.class ?? 'Unknown', level: raw.level ?? 1 }],
        currentHp: raw.current_hp ?? raw.currentHp ?? 0,
        maxHp: raw.max_hp ?? raw.maxHp ?? 1,
        tempHp: raw.temp_hp ?? raw.tempHp ?? 0,
        ac: raw.ac ?? 10,
        conditions: raw.conditions ?? [],
        concentratingOn: raw.concentrating_on ?? raw.concentratingOn ?? null,
        spellSlotsMax: raw.spell_slots_max ?? raw.spellSlotsMax ?? {},
        spellSlotsUsed: (() => {
            const v = raw.spell_slots_used ?? raw.spellSlotsUsed ?? raw.spell_slots;
            if (!v) return {};
            if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } }
            return v;
        })(),
        deathSaves: raw.death_saves ?? raw.deathSaves ?? { successes: 0, failures: 0 },
        ...raw,
    };
}

export function normaliseTrackerEntity(raw) {
    return {
        ...raw,
        conditions: raw.conditions ?? [],
        concentrating_on: raw.concentrating_on ?? null,
    };
}

export const TABS = [
    { id: 'party', label: '🛡️ Party' },
    { id: 'map', label: '🗺️ Map' },
    { id: 'quests', label: '📜 Quests' },
    { id: 'initiative', label: '⚔ Initiative' },
    { id: 'campaign', label: '📜 Campaign' },
    { id: 'notes', label: '📋 Notes' },
];
