const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const db = require('../db');
const { parseCharacterPdfLLM } = require('../ollama');
const { createInitialSessionState } = require('../lib/models');

const upload = multer({ storage: multer.memoryStorage() });

// GET /api/characters/import/diag — diagnostic endpoint
router.get('/diag', async (req, res) => {
    const diag = {
        pdftotext: false,
        ollama: false,
        ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
        tempDirWritable: false
    };

    try {
        const { stdout } = await execAsync('pdftotext -v');
        diag.pdftotext = true;
    } catch (e) { diag.pdftotext_error = e.message; }

    try {
        const response = await fetch(`${diag.ollamaUrl}/api/tags`, { timeout: 3000 });
        diag.ollama = response.ok;
        diag.ollama_status = response.status;
    } catch (e) { diag.ollama_error = e.message; }

    try {
        const tempDir = path.join(__dirname, '../../tmp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const testFile = path.join(tempDir, '.test_write');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        diag.tempDirWritable = true;
    } catch (e) { diag.tempDirError = e.message; }

    res.json(diag);
});

/**
 * POST /api/characters/import
 */
router.post('/', async (req, res) => {
    const { url } = req.body;
    console.log(`[Importer] URL Import Request: ${url}`);

    if (!url) {
        return res.status(400).json({ error: 'A D&D Beyond character URL is required.' });
    }

    const match =
        url.match(/\/characters\/(\d+)/) ||
        url.match(/_(\d+)\.pdf/) ||
        url.match(/characters\/(\d+)/);

    if (!match) {
        return res.status(400).json({
            error: 'Invalid D&D Beyond URL.'
        });
    }

    const characterId = match[1];
    const BROWSER_HEADERS = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
    };

    try {
        const apiUrl = `https://character-service.dndbeyond.com/character/v5/character/${characterId}`;
        const response = await fetch(apiUrl, { headers: BROWSER_HEADERS, timeout: 8000 });

        if (response.ok) {
            const json = await response.json();
            if (json.data) {
                const character = parseCharacterData(json.data);
                const newChar = insertCharacter(character);
                return res.status(201).json(newChar);
            }
        }
    } catch (err) {
        console.log(`[Importer] Strategy 1 Error: ${err.message}`);
    }

    return res.status(502).json({
        error: 'D&D Beyond is blocking automated access. Ensure character is PUBLIC.'
    });
});

/**
 * POST /api/characters/import/pdf
 */
router.post('/pdf', upload.single('pdf'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded.' });

    try {
        const tempDir = path.join(__dirname, '../../tmp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempPath = path.join(tempDir, `import_${Date.now()}.pdf`);
        fs.writeFileSync(tempPath, req.file.buffer);

        let rawText = "";
        try {
            const { stdout } = await execAsync(`pdftotext -layout "${tempPath}" -`);
            rawText = stdout;
        } catch (execErr) {
            const pdfData = await pdfParse(req.file.buffer);
            rawText = pdfData.text;
        } finally {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }

        const parsed = await parseCharacterPdfLLM(rawText);
        if (!parsed || !parsed.name) throw new Error('AI failed to parse PDF.');

        const charClassStr = (parsed.classes || []).map(c => `${c.name} ${c.level}`).join(' / ') || 'Unknown';
        const totalLevel = (parsed.classes || []).reduce((sum, c) => sum + (c.level || 0), 0) || 1;

        const character = {
            name: parsed.name,
            charClass: charClassStr,
            level: totalLevel,
            maxHp: parsed.baseMaxHp || 10,
            currentHp: parsed.baseMaxHp || 10,
            ac: parsed.baseAc || 10,
            stats: JSON.stringify(parsed.abilityScores || {}),
            skills: JSON.stringify(parsed.skills || []),
            inventory: JSON.stringify(parsed.inventory || []),
            homebrew_inventory: '[]',
            features: JSON.stringify(parsed.features || []),
            features_traits: JSON.stringify(parsed.features || []),
            spells: JSON.stringify(parsed.spells || []),
            backstory: '',
            raw_dndbeyond_json: '', 
            data_json: JSON.stringify(parsed)
        };

        const newChar = insertCharacter(character);
        const sessionState = createInitialSessionState(parsed, "pdf-import-" + Date.now());
        insertSessionState(newChar.id, sessionState);

        res.status(201).json(newChar);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper: 5-step calculation for Ability Scores
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
    const setMods = allMods.filter(m => m.type === 'set' && m.subType === statName);
    let setMax = 0;
    for (const mod of setMods) { if (mod.value > setMax) setMax = mod.value; }
    if (setMax > total) total = setMax;
    return total;
}

function extractFeatures(data) {
    const features = [];
    // Class features
    if (data.classes) {
        data.classes.forEach(cls => {
            if (cls.classFeatures) {
                cls.classFeatures.forEach(cf => {
                    features.push({
                        name: cf.definition.name,
                        description: cf.definition.description,
                        source: cls.definition.name
                    });
                });
            }
        });
    }
    // Race features
    if (data.race && data.race.racialTraits) {
        data.race.racialTraits.forEach(rt => {
            features.push({
                name: rt.definition.name,
                description: rt.definition.description,
                source: data.race.fullName
            });
        });
    }
    return features;
}

function extractSpells(data) {
    const spells = [];
    if (data.classSpells) {
        data.classSpells.forEach(cs => {
            if (cs.spells) {
                cs.spells.forEach(s => {
                    spells.push({
                        name: s.definition.name,
                        level: s.definition.level,
                        isConcentration: s.definition.concentration,
                        description: s.definition.description
                    });
                });
            }
        });
    }
    return spells;
}

function extractSkills(data) {
    const skills = [];
    const skillList = [
        'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
        'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
        'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
        'Sleight of Hand', 'Stealth', 'Survival'
    ];
    
    let allMods = [];
    if (data.modifiers) {
        Object.values(data.modifiers).forEach(modArray => {
            if (Array.isArray(modArray)) allMods = allMods.concat(modArray);
        });
    }

    skillList.forEach(s => {
        const subType = s.toLowerCase().replace(/ /g, '-');
        const isProf = allMods.some(m => m.type === 'proficiency' && m.subType === subType);
        if (isProf) skills.push(s);
    });

    return skills;
}

function parseCharacterData(data) {
    const name = data.name || data.characterName || 'Unknown Adventurer';
    let charClass = 'Adventurer';
    if (data.classes && data.classes.length > 0) {
        charClass = data.classes.map(c => c.definition?.name || c.name || 'Unknown').join(' / ');
    }
    const level = data.classes ? data.classes.reduce((sum, c) => sum + (c.level || 0), 0) : (data.level || 1);
    
    const str = calculateAbilityScore(1, 'strength-score', data);
    const dex = calculateAbilityScore(2, 'dexterity-score', data);
    const con = calculateAbilityScore(3, 'constitution-score', data);
    const int = calculateAbilityScore(4, 'intelligence-score', data);
    const wis = calculateAbilityScore(5, 'wisdom-score', data);
    const cha = calculateAbilityScore(6, 'charisma-score', data);

    const baseHp = data.baseHitPoints || 10;
    const conBonus = Math.floor((con - 10) / 2);
    const maxHp = data.overrideHitPoints || Math.max(1, baseHp + (conBonus * level) + (data.bonusHitPoints || 0));
    const currentHp = Math.max(0, maxHp - (data.removedHitPoints || 0));
    const ac = data.armorClass || (10 + Math.floor((dex - 10) / 2));

    const statsObj = { STR: str, DEX: dex, CON: con, INT: int, WIS: wis, CHA: cha };
    
    const inventory = (data.inventory || []).map(i => ({
        name: i.definition.name, 
        quantity: i.quantity, 
        equipped: i.equipped, 
        type: i.definition.filterType, 
        isAttuned: i.isAttuned,
        description: i.definition.description
    }));

    // Extract detailed fields
    const features = extractFeatures(data);
    const spells = extractSpells(data);
    const skills = extractSkills(data);

    // Spell Slots
    const spellSlots = {};
    if (data.spellSlots) {
        data.spellSlots.forEach((slot, idx) => {
            if (slot.available > 0) spellSlots[idx + 1] = slot.available;
        });
    }

    return {
        name, charClass, level, maxHp, currentHp, ac,
        stats: JSON.stringify(statsObj),
        skills: JSON.stringify(skills),
        features: JSON.stringify(features),
        features_traits: JSON.stringify(features),
        inventory: JSON.stringify(inventory),
        homebrew_inventory: '[]',
        spells: JSON.stringify(spells),
        spellSlots: JSON.stringify(spellSlots),
        backstory: data.notes?.backstory || '',
        raw_dndbeyond_json: JSON.stringify(data),
        data_json: JSON.stringify(data)
    };
}

function insertCharacter(charObj) {
    const name = charObj.name;
    const charClass = charObj.charClass || charObj.class || 'Adventurer';
    const level = charObj.level || 1;
    const max_hp = charObj.maxHp || charObj.max_hp || 10;
    const current_hp = charObj.currentHp || charObj.current_hp || max_hp;
    const ac = charObj.ac || 10;
    
    const stats = charObj.stats || '{}';
    const skills = charObj.skills || '[]';
    const features = charObj.features || '[]';
    const features_traits = charObj.features_traits || '[]';
    const inventory = charObj.inventory || '[]';
    const homebrew_inventory = charObj.homebrew_inventory || '[]';
    const spells = charObj.spells || '[]';
    const spell_slots = charObj.spellSlots || '{}';
    const backstory = charObj.backstory || '';
    const raw_dndbeyond_json = charObj.raw_dndbeyond_json || '';
    const data_json = charObj.data_json || '{}';

    const stmt = db.prepare(`
        INSERT INTO characters (
            name, class, level, max_hp, current_hp, ac,
            stats, skills, features, features_traits, inventory, homebrew_inventory, spells, spell_slots, backstory, 
            raw_dndbeyond_json, data_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
        name, charClass, level, max_hp, current_hp, ac,
        stats, skills, features, features_traits, inventory, homebrew_inventory, spells, spell_slots, backstory,
        raw_dndbeyond_json, data_json
    );
    
    return db.prepare('SELECT * FROM characters WHERE id = ?').get(result.lastInsertRowid);
}

function insertSessionState(characterId, state) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO session_states (
            character_id, session_id, current_hp, temp_hp, 
            death_saves_json, conditions_json, buffs_json, 
            concentrating_on, slots_used_json, hd_used_json, 
            feature_uses_json, active_features_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
        characterId, state.sessionId, state.currentHp, state.tempHp,
        JSON.stringify(state.deathSaves), JSON.stringify(state.activeConditions), JSON.stringify(state.activeBuffs),
        state.concentratingOn, JSON.stringify(state.spellSlotsUsed), JSON.stringify(state.hitDiceUsed),
        JSON.stringify(state.featureUses), JSON.stringify(state.activeFeatures)
    );
}

module.exports = router;
