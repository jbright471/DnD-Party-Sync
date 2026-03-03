const fetch = require('node-fetch');

// Default to local p40 instance for high performance
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama-p40:11434';
const DEFAULT_MODEL = 'gemma3:27b';

// ---- Rules Assistant (Phase 2) ----

async function askRulesAssistant(question, partyContext) {
    const prompt = `You are an expert D&D 5e Rules Assistant.
You provide clear, concise, and mechanics-focused rules rulings. Do not invent rules.
Where relevant, consider the current party state:
${JSON.stringify(partyContext, null, 2)}

Question:
${question}

Provide your answer in plain text or markdown. Be brief and direct.`;

    try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: DEFAULT_MODEL,
                prompt: prompt,
                stream: false
            })
        });
        if (!res.ok) throw new Error(`Ollama API error: ${res.statusText}`);
        const data = await res.json();
        return data.response;
    } catch (e) {
        console.error('[Ollama] Error rules assistant:', e.message);
        return "I'm sorry, my connection to the weave (Ollama) was interrupted.";
    }
}

// ---- Action Resolver (Phase 2) ----

async function resolveActionLLM(actionText, partyContext) {
    const trimmedParty = partyContext.map(c => ({
        id: c.id,
        name: c.name,
        class: c.class,
        hp: `${c.current_hp}/${c.max_hp}`
    }));

    const prompt = `You are a D&D 5e automated action resolver. Your ONLY job is to take an action description and translate it into a structured JSON array of mechanical state changes.

The current valid targets in the party are:
${JSON.stringify(trimmedParty, null, 2)}

You must return a JSON array of effect objects.
Action description to resolve:
"${actionText}"

Return ONLY valid JSON.`;

    try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: DEFAULT_MODEL,
                prompt: prompt,
                stream: false,
                format: 'json'
            })
        });
        if (!res.ok) throw new Error(`Ollama API error: ${res.statusText}`);
        const data = await res.json();
        const jsonStr = data.response.trim();

        try {
            return JSON.parse(jsonStr);
        } catch (err) {
            const cleaned = jsonStr.replace(/^```json/g, '').replace(/```$/g, '').trim();
            return JSON.parse(cleaned);
        }
    } catch (e) {
        console.error('[Ollama] Error resolving action:', e.message);
        return null;
    }
}

// ---- Session Recap Generator (Phase 3) ----

async function generateSessionRecap(logs) {
    const logSummary = logs.map(l =>
        `[${l.timestamp}] ${l.actor}: ${l.action_description}${l.status === 'rejected' ? ' (REJECTED by DM)' : ''}`
    ).join('\n');

    const prompt = `You are a D&D chronicle scribe...
Action Log:
${logSummary}

Write the narrative recap now:`;

    try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: DEFAULT_MODEL,
                prompt: prompt,
                stream: false
            })
        });
        if (!res.ok) throw new Error(`Ollama API error: ${res.statusText}`);
        const data = await res.json();
        return data.response;
    } catch (e) {
        console.error('[Ollama] Error generating recap:', e.message);
        return null;
    }
}

// ---- Homebrew Stat Generator (Phase 3) ----

async function generateHomebrewStats(entityType, name, description) {
    let schemaHint;
    if (entityType === 'monster') {
        schemaHint = `{ "hp": 45, "ac": 15, ... }`;
    } else if (entityType === 'spell') {
        schemaHint = `{ "level": 3, ... }`;
    } else {
        schemaHint = `{ "type": "Wondrous item", ... }`;
    }

    const prompt = `You are a D&D 5e game designer. Parse description and generate JSON...
Name: ${name}
Description: ${description}
Output Schema: ${schemaHint}`;

    try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: DEFAULT_MODEL,
                prompt: prompt,
                stream: false,
                format: 'json'
            })
        });
        if (!res.ok) throw new Error(`Ollama API error: ${res.statusText}`);
        const data = await res.json();
        const jsonStr = data.response.trim();
        try {
            return JSON.parse(jsonStr);
        } catch (err) {
            const cleaned = jsonStr.replace(/^```json/g, '').replace(/```$/g, '').trim();
            return JSON.parse(cleaned);
        }
    } catch (e) {
        console.error('[Ollama] Error generating homebrew stats:', e.message);
        return null;
    }
}

/**
 * NEW: Item Description Parser (Phase 5)
 */
async function parseItemDescriptionLLM(itemName, description) {
    const prompt = `You are a D&D 5e mechanics extractor.
Item: ${itemName}
Description: ${description}
Return ONLY JSON with acBonus, statBonuses, resistances, immunities, speedBonus.`;

    try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: DEFAULT_MODEL,
                prompt: prompt,
                stream: false,
                format: 'json'
            })
        });
        if (!res.ok) throw new Error(`Ollama error: ${res.statusText}`);
        const data = await res.json();
        const jsonStr = data.response.trim();
        try {
            return JSON.parse(jsonStr);
        } catch (err) {
            const cleaned = jsonStr.replace(/^```json/g, '').replace(/```$/g, '').trim();
            return JSON.parse(cleaned);
        }
    } catch (e) {
        console.error('[Ollama] Error parsing item description:', e.message);
        return { acBonus: 0, statBonuses: {}, resistances: [], immunities: [], vulnerabilities: [], speedBonus: 0 };
    }
}

// ---- Lore Assistant (Phase 5.5) ----

async function generateLoreLLM(promptText) {
    const systemPrompt = `You are an expert Dungeon Master and creative writer. 
Your goal is to provide evocative, atmospheric, and high-fantasy descriptions and ideas.
- If asked for a description, use sensory details (smell, sound, lighting).
- If asked for NPCs, give them a unique quirk or motivation.
- If asked for loot, make it sound unique and storied.
- Keep responses concise but flavorful.
- Avoid game-mechanics unless specifically asked.`;

    try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: DEFAULT_MODEL,
                system: systemPrompt,
                prompt: promptText,
                stream: false,
                options: { temperature: 0.8 }
            })
        });
        if (!res.ok) throw new Error(`Ollama API error: ${res.statusText}`);
        const data = await res.json();
        return data.response;
    } catch (e) {
        console.error('[Ollama] Error lore assistant:', e.message);
        return "The weave is silent... (Ollama Error)";
    }
}

// ---- Loot Generator (Phase 8.2) ----

async function generateLootLLM(context) {
    const prompt = `You are a D&D 5e loot generator. 
Generate a JSON array of 1-3 unique items found in this context: ${context}

Output format:
[
  {
    "name": "string",
    "type": "item/weapon/armor",
    "rarity": "Common/Uncommon/Rare/Very Rare",
    "description": "Flavorable visual description and history",
    "stats": {"acBonus": 0, "statBonuses": {}, "damage": "string"}
  }
]
Return ONLY raw JSON array.`;

    try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: DEFAULT_MODEL,
                prompt: prompt,
                stream: false,
                format: 'json'
            })
        });
        if (!res.ok) throw new Error(`Ollama API error: ${res.statusText}`);
        const data = await res.json();
        const response = data.response.trim();
        try {
            return JSON.parse(response);
        } catch (e) {
            const cleaned = response.replace(/^```json/g, '').replace(/```$/g, '').trim();
            return JSON.parse(cleaned);
        }
    } catch (e) {
        console.error('[Ollama] Error generating loot:', e.message);
        return [];
    }
}

// ---- Advanced Character PDF Parser (Pivot Upgrade) ----
const { validateCharacter } = require('./lib/validator');

async function parseCharacterPdfLLM(pdfText) {
    const systemPrompt = `You are a high-precision data extractor for D&D 5e character sheets.
You MUST return a JSON object with EXACTLY these keys (camelCase):
{
  "name": "string",
  "species": "string",
  "background": "string",
  "classes": [{"name": "string", "level": number}],
  "baseMaxHp": number,
  "baseAc": number,
  "abilityScores": {"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10},
  "skills": ["Acrobatics", "Athletics", ...], // List only proficient skills
  "inventory": [{"name": "string", "quantity": 1, "equipped": true, "description": "string"}],
  "spells": [{"name": "string", "level": 0, "isConcentration": false}],
  "features": [{"name": "string", "description": "string"}]
}
Rules:
1. No "character_name", use "name".
2. Only list proficient skills in the "skills" array.
3. No markdown blocks. Return ONLY raw JSON.`;

    const userPrompt = `Extract character from text:
---
${pdfText.substring(0, 18000)}
---`;

    try {
        console.log(`[Ollama] Dispatching to ${DEFAULT_MODEL} with ${userPrompt.length} chars...`);
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: DEFAULT_MODEL,
                system: systemPrompt,
                prompt: userPrompt,
                stream: false,
                format: 'json',
                options: {
                    num_ctx: 32768,
                    temperature: 0
                }
            }),
            timeout: 600000 // 10 minutes
        });

        if (!res.ok) throw new Error(`Ollama API error: ${res.statusText}`);
        const data = await res.json();
        const jsonStr = data.response.trim();
        console.log(`[Ollama] Raw response (first 200 chars): ${jsonStr.substring(0, 200)}...`);

        let parsed;
        try {
            parsed = JSON.parse(jsonStr);
        } catch (err) {
            console.warn('[Ollama] JSON.parse failed, attempting cleanup...');
            const cleaned = jsonStr.replace(/^```json/g, '').replace(/```$/g, '').trim();
            parsed = JSON.parse(cleaned);
        }

        const validation = validateCharacter(parsed);
        parsed.validation = validation;
        return parsed;
    } catch (e) {
        console.error('[Ollama] Error parsing character PDF:', e.message);
        throw e;
    }
}

module.exports = {
    askRulesAssistant,
    resolveActionLLM,
    generateSessionRecap,
    generateHomebrewStats,
    parseItemDescriptionLLM,
    parseCharacterPdfLLM,
    generateLoreLLM,
    generateLootLLM
};
