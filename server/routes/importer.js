const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const db = require('../db');

/**
 * POST /api/characters/import
 * Body: { url: "https://www.dndbeyond.com/characters/12345678" }
 *
 * Strategy  1 → internal character-service JSON API  (fast, may 403)
 * Strategy  2 → public character page HTML scraping   (slower, more resilient)
 * Strategy  3 → structured fallback with a clear error
 *
 * NOTE: The character must be set to PUBLIC on D&D Beyond.
 */
router.post('/', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'A D&D Beyond character URL is required.' });
    }

    // --- Extract character ID ---
    // Supports: https://www.dndbeyond.com/characters/12345678
    // Supports: https://www.dndbeyond.com/characters/12345678/builder
    // Supports: https://www.dndbeyond.com/sheet-pdfs/username_12345678.pdf
    // Supports: https://www.dndbeyond.com/profile/user/characters/12345678
    const match =
        url.match(/\/characters\/(\d+)/) ||
        url.match(/_(\d+)\.pdf/) ||
        url.match(/characters\/(\d+)/);

    if (!match) {
        return res.status(400).json({
            error: 'Invalid D&D Beyond URL. Expected a URL like: https://www.dndbeyond.com/characters/12345678'
        });
    }

    const characterId = match[1];
    console.log(`[Importer] Attempting import for character ID: ${characterId}`);

    // ── Shared browser-like headers ──────────────────────────────────
    const BROWSER_HEADERS = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Referer': 'https://www.dndbeyond.com/',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
    };

    // ── Strategy 1: Internal JSON API ────────────────────────────────
    try {
        const apiUrl = `https://character-service.dndbeyond.com/character/v5/character/${characterId}`;
        console.log('[Importer] Strategy 1: Trying internal JSON API…');

        const response = await fetch(apiUrl, {
            headers: {
                ...BROWSER_HEADERS,
                'Accept': 'application/json',
            },
            timeout: 8000,
        });

        if (response.ok) {
            const json = await response.json();
            const data = json.data;
            if (data) {
                console.log('[Importer] Strategy 1 succeeded!');
                const character = parseCharacterData(data);
                const newChar = insertCharacter(character);
                return res.status(201).json(newChar);
            }
        }
        console.log(`[Importer] Strategy 1 returned ${response.status}, falling through…`);
    } catch (err) {
        console.log(`[Importer] Strategy 1 failed: ${err.message}`);
    }

    // ── Strategy 2: Public character page scraping ───────────────────
    try {
        const pageUrl = `https://www.dndbeyond.com/characters/${characterId}`;
        console.log('[Importer] Strategy 2: Scraping public character page…');

        const response = await fetch(pageUrl, {
            headers: BROWSER_HEADERS,
            timeout: 12000,
            redirect: 'follow',
        });

        if (!response.ok) {
            if (response.status === 404) {
                return res.status(404).json({
                    error: 'Character not found on D&D Beyond. Double-check the URL and make sure the character is set to Public.'
                });
            }
            if (response.status === 403) {
                // Hard 403 on even the public page — fall through to fallback
                console.log('[Importer] Strategy 2 got 403 on public page.');
                throw new Error('403 on public page');
            }
            throw new Error(`Page returned ${response.status}`);
        }

        const html = await response.text();

        // --- Try to extract __NEXT_DATA__ embedded JSON ---
        const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
        if (nextDataMatch) {
            console.log('[Importer] Found __NEXT_DATA__ block');
            try {
                const nextData = JSON.parse(nextDataMatch[1]);
                // Navigate into the page props for character data
                const charData = findCharacterInNextData(nextData);
                if (charData) {
                    const character = parseCharacterData(charData);
                    const newChar = insertCharacter(character);
                    return res.status(201).json(newChar);
                }
            } catch (parseErr) {
                console.log(`[Importer] __NEXT_DATA__ parse failed: ${parseErr.message}`);
            }
        }

        // --- Try to find character JSON blob in any script tag ---
        const jsonBlobMatch = html.match(/"characterId"\s*:\s*\d+[\s\S]*?"name"\s*:\s*"([^"]+)"/);
        if (jsonBlobMatch) {
            console.log('[Importer] Found inline character JSON fragment');
            // Try to extract the full JSON object
            const allScripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
            for (const script of allScripts) {
                const inner = script.replace(/<\/?script[^>]*>/gi, '');
                if (inner.includes('"characterId"') && inner.includes('"baseHitPoints"')) {
                    // Find the JSON object start
                    const charStart = inner.indexOf('{"characterId"');
                    if (charStart !== -1) {
                        // Try to parse progressively larger substrings
                        const potential = inner.substring(charStart);
                        const parsed = tryParseJSON(potential);
                        if (parsed) {
                            const character = parseCharacterData(parsed);
                            const newChar = insertCharacter(character);
                            return res.status(201).json(newChar);
                        }
                    }
                }
            }
        }

        // --- Fallback: parse visible HTML for basic stats ---
        console.log('[Importer] Attempting HTML element scraping…');
        const character = parseCharacterFromHTML(html);
        if (character) {
            const newChar = insertCharacter(character);
            return res.status(201).json(newChar);
        }

        throw new Error('Could not extract character data from the page.');
    } catch (err) {
        console.error(`[Importer] Strategy 2 failed: ${err.message}`);
    }

    // ── All strategies exhausted ─────────────────────────────────────
    return res.status(502).json({
        error: 'D&D Beyond is blocking automated access to this character. '
            + 'This is a known issue with their API lockdown. '
            + 'Please try: (1) make sure the character is set to Public, '
            + '(2) use the direct character URL format: https://www.dndbeyond.com/characters/XXXXXXXX, '
            + 'or (3) add the character manually using the form above.'
    });
});


// ── Helper: deeply search __NEXT_DATA__ for character payload ─────────
function findCharacterInNextData(nextData) {
    // Common paths where character data lives in Next.js page props
    const paths = [
        nextData?.props?.pageProps?.character,
        nextData?.props?.pageProps?.characterData,
        nextData?.props?.pageProps?.data,
        nextData?.props?.pageProps?.initialState?.character,
    ];
    for (const p of paths) {
        if (p && (p.name || p.characterName)) return p;
    }
    // Brute-force DFS for an object with baseHitPoints
    return deepFind(nextData, obj =>
        obj && typeof obj === 'object' && 'baseHitPoints' in obj && 'name' in obj
    );
}

function deepFind(obj, predicate, depth = 0) {
    if (depth > 8 || !obj || typeof obj !== 'object') return null;
    if (predicate(obj)) return obj;
    for (const key of Object.keys(obj)) {
        const result = deepFind(obj[key], predicate, depth + 1);
        if (result) return result;
    }
    return null;
}


// ── Helper: 5-step calculation for Ability Scores (DDB Rules) ──────────
function calculateAbilityScore(statId, statName, data) {
    // 1. Base Score
    const baseStat = data.stats?.find(s => s.id === statId)?.value || 10;
    let total = baseStat;

    // 2. Modifiers (race, class, background, feat, item)
    // Flatten all active modifiers into one array
    let allMods = [];
    if (data.modifiers) {
        Object.values(data.modifiers).forEach(modArray => {
            if (Array.isArray(modArray)) allMods = allMods.concat(modArray);
        });
    }

    // Filter for bonuses to this specific score
    const bonuses = allMods.filter(m => m.type === 'bonus' && m.subType === statName);
    const bonusSum = bonuses.reduce((sum, m) => sum + (m.value || 0), 0);
    total += bonusSum;

    // 3. Manual bonusStats
    const manualBonus = data.bonusStats?.find(s => s.id === statId)?.value || 0;
    total += manualBonus;

    // 4. Manual overrideStats
    const override = data.overrideStats?.find(s => s.id === statId)?.value || null;
    if (override !== null) {
        total = override;
    }

    // 5. Magic Item Sets (e.g. Gauntlets of Ogre Power setting STR to 19)
    const setMods = allMods.filter(m => m.type === 'set' && m.subType === statName);
    let setMax = 0;
    for (const mod of setMods) {
        if (mod.value > setMax) setMax = mod.value;
    }

    // Set modifiers only apply if they increase the score
    if (setMax > total) {
        total = setMax;
    }

    return total;
}

// ── Helper: parse structured charData from the API / embedded JSON ────
function parseCharacterData(data) {
    const name = data.name || data.characterName || 'Unknown Adventurer';

    // Class: take the first class or join multi-class
    let charClass = 'Adventurer';
    if (data.classes && data.classes.length > 0) {
        charClass = data.classes
            .map(c => c.definition?.name || c.name || 'Unknown')
            .join(' / ');
    }

    // Level: sum of all class levels
    const level = data.classes
        ? data.classes.reduce((sum, c) => sum + (c.level || 0), 0)
        : (data.level || 1);

    // Apply exact 5-step calculation for all core stats
    const strScore = calculateAbilityScore(1, 'strength-score', data);
    const dexScore = calculateAbilityScore(2, 'dexterity-score', data);
    const conScore = calculateAbilityScore(3, 'constitution-score', data);
    const intScore = calculateAbilityScore(4, 'intelligence-score', data);
    const wisScore = calculateAbilityScore(5, 'wisdom-score', data);
    const chaScore = calculateAbilityScore(6, 'charisma-score', data);

    // Max HP
    const baseHp = data.baseHitPoints || data.hitPoints?.max || 10;
    const conBonus = Math.floor((conScore - 10) / 2);
    const bonusHp = data.bonusHitPoints || 0;
    const overrideHp = data.overrideHitPoints;
    const maxHp = overrideHp || Math.max(1, baseHp + conBonus * level + bonusHp);

    // Current HP
    const removedHp = data.removedHitPoints || 0;
    const currentHp = Math.max(0, maxHp - removedHp);

    // AC
    const dexBonus = Math.floor((dexScore - 10) / 2);
    const ac = data.armorClass || (10 + dexBonus);

    // --- Phase 4 Detailed Data ---
    const statsObj = {
        STR: strScore,
        DEX: dexScore,
        CON: conScore,
        INT: intScore,
        WIS: wisScore,
        CHA: chaScore,
    };

    const skillsArr = data.customProficiencies || [];
    // Or parse from modifiers if available
    const parsedSkills = data.modifiers?.class?.filter(m => m.type === 'proficiency' || m.type === 'expertise').map(m => m.subType) || [];

    const featuresArr = [];
    if (data.classes) {
        data.classes.forEach(c => {
            if (c.classFeatures) {
                c.classFeatures.forEach(f => featuresArr.push({ name: f.definition.name, description: f.definition.description }));
            }
        });
    }

    const inventoryArr = data.inventory ? data.inventory.map(i => ({
        name: i.definition.name,
        quantity: i.quantity,
        equipped: i.equipped,
        type: i.definition.filterType
    })) : [];

    const spellsObj = data.classSpells || {};
    const backstory = data.notes?.backstory || '';
    const rawJson = JSON.stringify(data);

    return {
        name, charClass, level, maxHp, currentHp, ac,
        stats: JSON.stringify(statsObj),
        skills: JSON.stringify(parsedSkills),
        features_traits: JSON.stringify(featuresArr),
        inventory: JSON.stringify(inventoryArr),
        spells: JSON.stringify(spellsObj),
        backstory: backstory,
        raw_dndbeyond_json: rawJson
    };
}


// ── Helper: try to extract basic stats from raw HTML elements ─────────
function parseCharacterFromHTML(html) {
    // Character name — often in <h1 class="...name..."> or <meta property="og:title">
    const nameMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/)
        || html.match(/<h1[^>]*class="[^"]*character-name[^"]*"[^>]*>([^<]+)</)
        || html.match(/<span[^>]*class="[^"]*ddbc-character-name[^"]*"[^>]*>([^<]+)</);
    if (!nameMatch) return null;

    const name = nameMatch[1].trim();

    // Try to find class/level from meta description or page text
    const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/);
    let charClass = 'Adventurer';
    let level = 1;
    if (descMatch) {
        // Often formatted like "Level 5 Paladin" or "Paladin 5"
        const lvlMatch = descMatch[1].match(/Level\s+(\d+)\s+(\w[\w\s/]*)/i)
            || descMatch[1].match(/(\w[\w\s/]*?)\s+(\d+)/);
        if (lvlMatch) {
            if (/^\d+$/.test(lvlMatch[1])) {
                level = parseInt(lvlMatch[1], 10);
                charClass = lvlMatch[2].trim();
            } else {
                charClass = lvlMatch[1].trim();
                level = parseInt(lvlMatch[2], 10);
            }
        }
    }

    // AC from page text
    const acMatch = html.match(/aria-label="Armor Class[^"]*"[^>]*>(\d+)/)
        || html.match(/class="[^"]*armor-class[^"]*"[^>]*>(\d+)/);
    const ac = acMatch ? parseInt(acMatch[1], 10) : 10;

    // HP from page text
    const hpMatch = html.match(/aria-label="Hit Points[^"]*"[^>]*>(\d+)\s*\/\s*(\d+)/)
        || html.match(/(\d+)\s*\/\s*(\d+)\s*HP/i);
    const currentHp = hpMatch ? parseInt(hpMatch[1], 10) : 10;
    const maxHp = hpMatch ? parseInt(hpMatch[2], 10) : 10;

    return { name, charClass, level, maxHp, currentHp, ac };
}


// ── Helper: attempt JSON.parse on a string, finding the matching } ────
function tryParseJSON(str) {
    let depth = 0;
    for (let i = 0; i < str.length && i < 500000; i++) {
        if (str[i] === '{') depth++;
        else if (str[i] === '}') {
            depth--;
            if (depth === 0) {
                try { return JSON.parse(str.substring(0, i + 1)); }
                catch { return null; }
            }
        }
    }
    return null;
}


// ── Helper: insert into SQLite and return the new row ─────────────────
function insertCharacter(charObj) {
    const {
        name, charClass, level, maxHp, currentHp, ac,
        stats = '{}', skills = '{}', features_traits = '[]', inventory = '[]', spells = '{}', backstory = '', raw_dndbeyond_json = ''
    } = charObj;

    const stmt = db.prepare(`
        INSERT INTO characters (
            name, class, level, max_hp, current_hp, ac,
            stats, skills, features, features_traits, inventory, spells, backstory, raw_dndbeyond_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
        name, charClass, level, maxHp, currentHp || maxHp, ac,
        stats, skills, '[]', features_traits, inventory, spells, backstory, raw_dndbeyond_json
    );
    return db.prepare('SELECT * FROM characters WHERE id = ?').get(result.lastInsertRowid);
}


module.exports = router;
