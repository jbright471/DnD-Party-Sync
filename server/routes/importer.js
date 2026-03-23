const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const db = require('../db');
const { parseCharacterPdfLLM } = require('../ollama');

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

        const parsed = parseCharacterData(json.data);
        
        db.prepare(`
            UPDATE characters SET
                name = ?, class = ?, level = ?, max_hp = ?, ac = ?,\n                stats = ?, skills = ?, features = ?, features_traits = ?,\n                inventory = ?, spells = ?, backstory = ?,\n                raw_dndbeyond_json = ?, data_json = ?
            WHERE id = ?
        `).run(
            parsed.name, parsed.class, parsed.level, parsed.maxHp, parsed.ac,
            parsed.stats, parsed.skills, parsed.features, parsed.features_traits,
            parsed.inventory, parsed.spells, parsed.backstory,
            parsed.raw_dndbeyond_json, parsed.data_json,
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
    
    const inventory = (data.inventory || []).map(i => ({
        name: i.definition.name, 
        quantity: i.quantity, 
        equipped: i.equipped, 
        type: i.definition.filterType, 
        description: i.definition.description
    }));

    return {
        name, class: charClass, level, maxHp, currentHp, ac,
        stats: JSON.stringify(statsObj),
        skills: JSON.stringify([]),
        features: JSON.stringify([]),
        features_traits: JSON.stringify([]),
        inventory: JSON.stringify(inventory),
        spells: JSON.stringify([]),
        backstory: data.notes?.backstory || '',
        raw_dndbeyond_json: JSON.stringify(data),
        data_json: JSON.stringify(data)
    };
}

function insertCharacter(charObj) {
    const stmt = db.prepare(`
        INSERT INTO characters (
            name, class, level, max_hp, current_hp, ac,
            stats, skills, features, features_traits, inventory, homebrew_inventory, spells, backstory, 
            raw_dndbeyond_json, data_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
        charObj.name, charObj.class, charObj.level, charObj.maxHp, charObj.currentHp, charObj.ac,
        charObj.stats, charObj.skills, charObj.features, charObj.features_traits, charObj.inventory,
        charObj.spells, charObj.backstory, charObj.raw_dndbeyond_json, charObj.data_json
    );
    
    return db.prepare('SELECT * FROM characters WHERE id = ?').get(result.lastInsertRowid);
}

module.exports = router;
