const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const db = require('../db');
const { parseCharacterPdfLLM } = require('../ollama');
const { validateImportDiff } = require('../lib/importValidator');

const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/characters/import
 */
router.post('/', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'A D&D Beyond character URL is required.' });

    const match = url.match(/\/characters\/(\d+)/);
    if (!match) return res.status(400).json({ error: 'Invalid D&D Beyond URL.' });

    const characterId = match[1];
    const BROWSER_HEADERS = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    try {
        const apiUrl = `https://character-service.dndbeyond.com/character/v5/character/${characterId}`;
        const response = await fetch(apiUrl, { headers: BROWSER_HEADERS });

        if (!response.ok) throw new Error(`DDB returned ${response.status}`);
        const json = await response.json();
        if (!json.data) throw new Error('No data in DDB response');

        const character = parseCharacterData(json.data);

        // --- Import Guardrail ---
        const validation = validateImportDiff(null, character);
        const isDm = isDmRequest(req);
        
        const approvalRow = db.prepare("SELECT value FROM campaign_state WHERE key = 'approval_mode'").get();
        const isApprovalMode = approvalRow ? approvalRow.value === '1' : false;

        if (!isDm && (validation.requiresApproval || isApprovalMode)) {
            const stmt = db.prepare(`
                INSERT INTO pending_imports (character_id, player_name, url, incoming_data_json, diff_json)
                VALUES (NULL, ?, ?, ?, ?)
            `);
            const result = stmt.run(
                character.name,
                url,
                JSON.stringify(character),
                JSON.stringify(validation)
            );
            
            const egress = req.app.get('socketDelivery');
            if (egress) {
                egress.dm('pending_import_created', {
                    id: result.lastInsertRowid,
                    characterId: null,
                    playerName: character.name,
                    url,
                    flags: validation.flags,
                    diff: validation.diff,
                    incomingData: character
                });
            }

            return res.status(202).json({
                status: 'pending',
                pendingId: result.lastInsertRowid,
                diff: validation.diff,
                flags: validation.flags
            });
        }

        const newChar = insertCharacter(character);
        
        // Init session state
        db.prepare(`
          INSERT INTO session_states (character_id, current_hp, temp_hp, death_saves_json, conditions_json, buffs_json, concentrating_on, slots_used_json, hd_used_json, feature_uses_json, active_features_json)
          VALUES (?, ?, 0, '{"successes":0,"failures":0}', '[]', '[]', NULL, '{}', '{}', '{}', '[]')
        `).run(newChar.id, newChar.current_hp);

        res.status(201).json(newChar);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/characters/:id/sync
 */
router.put('/:id/sync', async (req, res) => {
    const { id } = req.params;
    const { url } = req.body;

    if (!url) return res.status(400).json({ error: 'URL required for sync' });

    const match = url.match(/\/characters\/(\d+)/);
    if (!match) return res.status(400).json({ error: 'Invalid URL format' });

    const characterId = match[1];
    const BROWSER_HEADERS = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    try {
        const apiUrl = `https://character-service.dndbeyond.com/character/v5/character/${characterId}`;
        const response = await fetch(apiUrl, { headers: BROWSER_HEADERS });

        if (!response.ok) throw new Error(`D&D Beyond returned ${response.status}`);
        const json = await response.json();
        if (!json.data) throw new Error('No data in D&D Beyond response');

        const existing = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
        if (!existing) return res.status(404).json({ error: 'Character not found' });

        // --- Import Guardrail ---
        const validation = validateImportDiff(existing, parsed);
        const isDm = isDmRequest(req);
        
        const approvalRow = db.prepare("SELECT value FROM campaign_state WHERE key = 'approval_mode'").get();
        const isApprovalMode = approvalRow ? approvalRow.value === '1' : false;

        if (!isDm && (validation.requiresApproval || isApprovalMode)) {
            const stmt = db.prepare(`
                INSERT INTO pending_imports (character_id, player_name, url, incoming_data_json, diff_json)
                VALUES (?, ?, ?, ?, ?)
            `);
            const result = stmt.run(
                id,
                parsed.name,
                url,
                JSON.stringify(parsed),
                JSON.stringify(validation)
            );
            
            const egress = req.app.get('socketDelivery');
            if (egress) {
                egress.dm('pending_import_created', {
                    id: result.lastInsertRowid,
                    characterId: id,
                    playerName: parsed.name,
                    url,
                    flags: validation.flags,
                    diff: validation.diff,
                    incomingData: parsed
                });
            }

            return res.status(202).json({
                status: 'pending',
                pendingId: result.lastInsertRowid,
                diff: validation.diff,
                flags: validation.flags
            });
        }
        
        db.prepare(`
            UPDATE characters SET
                name = ?, class = ?, level = ?, max_hp = ?, ac = ?,
                stats = ?, skills = ?, features = ?, features_traits = ?,
                inventory = ?, spells = ?, backstory = ?,
                raw_dndbeyond_json = ?, data_json = ?,
                skill_proficiencies = ?, save_proficiencies = ?, attacks = ?
            WHERE id = ?
        `).run(
            parsed.name, parsed.class, parsed.level, parsed.maxHp, parsed.ac,
            parsed.stats, parsed.skills, parsed.features, parsed.features_traits,
            parsed.inventory, parsed.spells, parsed.backstory,
            parsed.raw_dndbeyond_json, parsed.data_json,
            parsed.skill_proficiencies || '{}',
            parsed.save_proficiencies  || '{}',
            parsed.attacks             || '[]',
            id
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/characters/import/pdf
 */
router.post('/pdf', upload.single('pdf'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded.' });

    try {
        const pdfData = await pdfParse(req.file.buffer);
        const rawText = pdfData.text;

        const parsed = await parseCharacterPdfLLM(rawText);
        if (!parsed || !parsed.name) throw new Error('AI failed to extract character data.');

        const classStr = (parsed.classes || []).map(c => `${c.name} ${c.level}`).join(' / ') || 'Unknown';
        const totalLevel = (parsed.classes || []).reduce((sum, c) => sum + (c.level || 0), 0) || 1;

        const charObj = {
            name: parsed.name,
            class: classStr,
            level: totalLevel,
            maxHp: parsed.baseMaxHp || 10,
            currentHp: parsed.baseMaxHp || 10,
            ac: parsed.baseAc || 10,
            stats: JSON.stringify(parsed.abilityScores || {}),
            skills: JSON.stringify(parsed.skills || []),
            inventory: JSON.stringify(parsed.inventory || []),
            features: JSON.stringify(parsed.features || []),
            spells: JSON.stringify(parsed.spells || []),
            backstory: '',
            raw_dndbeyond_json: '', 
            data_json: JSON.stringify(parsed)
        };

        // --- Import Guardrail ---
        const validation = validateImportDiff(null, charObj);
        const isDm = isDmRequest(req);
        
        const approvalRow = db.prepare("SELECT value FROM campaign_state WHERE key = 'approval_mode'").get();
        const isApprovalMode = approvalRow ? approvalRow.value === '1' : false;

        if (!isDm && (validation.requiresApproval || isApprovalMode)) {
            const stmt = db.prepare(`
                INSERT INTO pending_imports (character_id, player_name, url, incoming_data_json, diff_json)
                VALUES (NULL, ?, 'PDF Upload', ?, ?)
            `);
            const result = stmt.run(
                charObj.name,
                JSON.stringify(charObj),
                JSON.stringify(validation)
            );
            
            const egress = req.app.get('socketDelivery');
            if (egress) {
                egress.dm('pending_import_created', {
                    id: result.lastInsertRowid,
                    characterId: null,
                    playerName: charObj.name,
                    url: 'PDF Upload',
                    flags: validation.flags,
                    diff: validation.diff,
                    incomingData: charObj
                });
            }

            return res.status(202).json({
                status: 'pending',
                pendingId: result.lastInsertRowid,
                diff: validation.diff,
                flags: validation.flags
            });
        }

        const newChar = insertCharacter(charObj);
        db.prepare(`
          INSERT INTO session_states (character_id, current_hp, temp_hp, death_saves_json, conditions_json, buffs_json, concentrating_on, slots_used_json, hd_used_json, feature_uses_json, active_features_json)
          VALUES (?, ?, 0, '{"successes":0,"failures":0}', '[]', '[]', NULL, '{}', '{}', '{}', '[]')
        `).run(newChar.id, newChar.current_hp);

        res.status(201).json(newChar);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Helpers ---

function calculateAbilityScore(statId, statName, data) {
    const baseStat = data.stats?.find(s => s.id === statId)?.value || 10;
    let total = baseStat;
    let allMods = [];
    if (data.modifiers) {
        Object.values(data.modifiers).forEach(modArray => {
            if (Array.isArray(modArray)) allMods = allMods.concat(modArray);
        });
    }
    const bonuses = allMods.filter(m => m.type === 'bonus' && m.subType === statName);
    total += bonuses.reduce((sum, m) => sum + (m.value || 0), 0);
    total += data.bonusStats?.find(s => s.id === statId)?.value || 0;
    const override = data.overrideStats?.find(s => s.id === statId)?.value || null;
    if (override !== null) total = override;
    return total;
}

const COMPONENT_MAP = { 1: 'V', 2: 'S', 3: 'M' };
const SAVE_STAT_MAP = { 1: 'STR', 2: 'DEX', 3: 'CON', 4: 'INT', 5: 'WIS', 6: 'CHA' };

// ── Proficiency / Attack Parsers ──────────────────────────────────────────────

const DDB_SKILL_MAP = {
    'acrobatics': 'Acrobatics',
    'animal-handling': 'Animal Handling',
    'arcana': 'Arcana',
    'athletics': 'Athletics',
    'deception': 'Deception',
    'history': 'History',
    'insight': 'Insight',
    'intimidation': 'Intimidation',
    'investigation': 'Investigation',
    'medicine': 'Medicine',
    'nature': 'Nature',
    'perception': 'Perception',
    'performance': 'Performance',
    'persuasion': 'Persuasion',
    'religion': 'Religion',
    'sleight-of-hand': 'Sleight of Hand',
    'stealth': 'Stealth',
    'survival': 'Survival',
};

const DDB_SAVE_MAP = {
    'strength-saving-throws': 'STR',
    'dexterity-saving-throws': 'DEX',
    'constitution-saving-throws': 'CON',
    'intelligence-saving-throws': 'INT',
    'wisdom-saving-throws': 'WIS',
    'charisma-saving-throws': 'CHA',
};

const DDB_DAMAGE_TYPE_MAP = {
    1: 'Bludgeoning', 2: 'Piercing', 3: 'Slashing',
    4: 'Necrotic', 5: 'Radiant', 6: 'Fire',
    7: 'Cold', 8: 'Psychic', 9: 'Lightning',
    10: 'Thunder', 11: 'Poison', 12: 'Acid', 13: 'Force',
};

/** Flatten all modifier arrays across all DDB modifier sources. */
function flatModifiers(data) {
    if (!data.modifiers || typeof data.modifiers !== 'object') return [];
    return Object.values(data.modifiers)
        .filter(Array.isArray)
        .flat();
}

/**
 * Returns { skillName: 'proficiency' | 'expertise' } for all proficient/expert skills.
 * Expertise beats proficiency if both appear.
 */
function parseSkillProficiencies(data) {
    const result = {};
    for (const mod of flatModifiers(data)) {
        const label = DDB_SKILL_MAP[mod.subType];
        if (!label) continue;
        if (mod.type === 'expertise') result[label] = 'expertise';
        else if (mod.type === 'proficiency' && result[label] !== 'expertise') result[label] = 'proficiency';
        else if (mod.type === 'half-proficiency' && !result[label]) result[label] = 'half';
    }
    return result;
}

/** Returns { STR: true, DEX: true, ... } for all proficient saving throws. */
function parseSaveProficiencies(data) {
    const result = {};
    for (const mod of flatModifiers(data)) {
        const ability = DDB_SAVE_MAP[mod.subType];
        if (!ability) continue;
        if (mod.type === 'proficiency' || mod.type === 'expertise') result[ability] = true;
    }
    return result;
}

/**
 * Extract equipped weapon attacks from DDB inventory.
 * Returns WeaponAttack[] (matching client/src/types/character.ts).
 */
function parseWeaponAttacks(data, statsObj, profBonus) {
    const abilityMod = score => Math.floor((score - 10) / 2);
    const strMod = abilityMod(statsObj.STR || 10);
    const dexMod = abilityMod(statsObj.DEX || 10);

    const attacks = [];
    for (const item of (data.inventory || [])) {
        if (!item.equipped) continue;
        const def = item.definition;
        if (!def) continue;

        // Only include items typed as weapons
        const ft = (def.filterType || '').toLowerCase();
        if (!ft.includes('weapon')) continue;

        const isMelee = def.attackType === 1;
        const props = (def.properties || []).map(p => (p.name || '').toLowerCase());
        const isFinesse  = props.includes('finesse');
        const isVersatile = props.includes('versatile');
        const isThrown   = props.includes('thrown');

        let abilityModVal;
        if (isFinesse) {
            abilityModVal = Math.max(strMod, dexMod);
        } else if (isMelee && !isThrown) {
            abilityModVal = strMod;
        } else {
            abilityModVal = dexMod;
        }

        // Look for magic bonus in item's granted modifiers
        const itemMods = (data.modifiers?.item || []).filter(m => m.componentId === item.id && m.type === 'bonus');
        const magicBonus = itemMods.reduce((sum, m) => sum + (m.value || 0), 0);

        const attackBonus = abilityModVal + profBonus + magicBonus;
        const dmg = def.damage || {};
        const diceCount  = dmg.diceCount || 1;
        const diceValue  = dmg.diceValue || 4;
        const damageType = DDB_DAMAGE_TYPE_MAP[dmg.damageTypeId] || 'Bludgeoning';

        let rangeStr;
        if (!isMelee) {
            const near = def.range?.rangeValue;
            const far  = def.range?.longRangeValue || near;
            rangeStr = near ? `${near}/${far} ft` : '60/240 ft';
        } else {
            rangeStr = isVersatile ? '5 ft reach (versatile)' : '5 ft reach';
        }

        const notes = (def.properties || []).map(p => p.name).filter(Boolean).join(' · ') || undefined;

        attacks.push({
            id: `ddb-${item.id}`,
            name: def.name,
            attackBonus,
            damageDice: `d${diceValue}`,
            damageCount: diceCount,
            damageBonus: abilityModVal + magicBonus,
            damageType,
            range: rangeStr,
            notes,
            isMelee,
        });
    }
    return attacks;
}

function stripHtml(html) {
    return (html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

function parseSpellList(data) {
    const seen = new Set();
    const spells = [];

    function addSpell(raw) {
        const def = raw?.definition;
        if (!def?.name) return;
        const key = def.name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);

        const components = (def.components || [])
            .map(c => COMPONENT_MAP[c]).filter(Boolean).join(', ');

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
            range: def.range?.rangeValue != null ? `${def.range.rangeValue} ft` : def.range?.origin ?? undefined,
            components: components || undefined,
            duration: durationStr || undefined,
            description: def.description ? stripHtml(def.description).slice(0, 500) : undefined,
            damageDice: def.damage?.diceString ?? undefined,
            saveAbility: def.saveDcStat != null ? SAVE_STAT_MAP[def.saveDcStat] : undefined,
            alwaysPrepared: raw.alwaysPrepared ?? false,
        });
    }

    // classSpells — primary source
    if (data.classSpells) {
        for (const classEntry of data.classSpells) {
            for (const spell of classEntry.spells ?? []) {
                addSpell(spell);
            }
        }
    }
    // race/feat/item spell sources
    if (data.spells && typeof data.spells === 'object' && !Array.isArray(data.spells)) {
        for (const source of ['race', 'class', 'feat', 'item']) {
            for (const spell of data.spells[source] ?? []) {
                addSpell(spell);
            }
        }
    }
    return spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

function parseCharacterData(data) {
    const name = data.name || 'Unknown';
    const charClass = data.classes?.map(c => c.definition?.name).join(' / ') || 'Adventurer';
    const level = data.classes?.reduce((sum, c) => sum + (c.level || 0), 0) || 1;
    
    const str = calculateAbilityScore(1, 'strength-score', data);
    const dex = calculateAbilityScore(2, 'dexterity-score', data);
    const con = calculateAbilityScore(3, 'constitution-score', data);
    const int = calculateAbilityScore(4, 'intelligence-score', data);
    const wis = calculateAbilityScore(5, 'wisdom-score', data);
    const cha = calculateAbilityScore(6, 'charisma-score', data);

    const baseHp = data.baseHitPoints || 10;
    const conBonus = Math.floor((con - 10) / 2);
    const maxHp = data.overrideHitPoints || (baseHp + (conBonus * level));
    const currentHp = maxHp - (data.removedHitPoints || 0);
    const ac = data.armorClass || (10 + Math.floor((dex - 10) / 2));

    const statsObj = { STR: str, DEX: dex, CON: con, INT: int, WIS: wis, CHA: cha };
    const profBonus = Math.floor((level - 1) / 4) + 2;

    const inventory = (data.inventory || []).map(i => ({
        name: i.definition.name, 
        quantity: i.quantity, 
        equipped: i.equipped, 
        type: i.definition.filterType, 
        description: i.definition.description
    }));

    // Parse spells from classSpells and other sources
    const spells = parseSpellList(data);

    const skillProficiencies = parseSkillProficiencies(data);
    const saveProficiencies  = parseSaveProficiencies(data);
    const attacks            = parseWeaponAttacks(data, statsObj, profBonus);

    return {
        name, class: charClass, level, maxHp, currentHp, ac,
        stats: JSON.stringify(statsObj),
        skills: JSON.stringify([]),
        features: JSON.stringify([]),
        features_traits: JSON.stringify([]),
        inventory: JSON.stringify(inventory),
        spells: JSON.stringify(spells),
        backstory: data.notes?.backstory || '',
        raw_dndbeyond_json: JSON.stringify(data),
        data_json: JSON.stringify(data),
        skill_proficiencies: JSON.stringify(skillProficiencies),
        save_proficiencies:  JSON.stringify(saveProficiencies),
        attacks:             JSON.stringify(attacks),
    };
}

function insertCharacter(charObj) {
    const stmt = db.prepare(`
        INSERT INTO characters (
            name, class, level, max_hp, current_hp, ac,
            stats, skills, features, features_traits, inventory, homebrew_inventory, spells, backstory,
            raw_dndbeyond_json, data_json, skill_proficiencies, save_proficiencies, attacks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
        charObj.name, charObj.class, charObj.level, charObj.maxHp, charObj.currentHp, charObj.ac,
        charObj.stats, charObj.skills, charObj.features, charObj.features_traits, charObj.inventory,
        charObj.spells, charObj.backstory, charObj.raw_dndbeyond_json, charObj.data_json,
        charObj.skill_proficiencies || '{}',
        charObj.save_proficiencies  || '{}',
        charObj.attacks             || '[]',
    );

    return db.prepare('SELECT * FROM characters WHERE id = ?').get(result.lastInsertRowid);
}

function isDmRequest(req) {
    return req.restAuthorization?.role === 'dm';
}

module.exports = router;
