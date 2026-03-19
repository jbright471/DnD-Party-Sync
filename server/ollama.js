const fetch = require('node-fetch');
const { validateCharacter } = require('./lib/validator');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama-p40:11434';
const DEFAULT_MODEL = 'mistral-small:24b';
const DEFAULT_TIMEOUT = 120000;   // 2 minutes
const PDF_TIMEOUT = 600000;       // 10 minutes for large PDF parsing
const DEFAULT_RETRIES = 1;

// ---------------------------------------------------------------------------
// Core Helpers
// ---------------------------------------------------------------------------

/**
 * Attempts to extract valid JSON from messy LLM output.
 * Handles markdown fences, leading prose, trailing commas, etc.
 */
function cleanLlmJson(raw) {
    let text = raw.trim();

    // Strip markdown code fences (```json ... ``` or ``` ... ```)
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/g, '').trim();

    // If there's prose before the actual JSON, find the first { or [
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    let jsonStart = -1;

    if (firstBrace >= 0 && firstBracket >= 0) {
        jsonStart = Math.min(firstBrace, firstBracket);
    } else if (firstBrace >= 0) {
        jsonStart = firstBrace;
    } else if (firstBracket >= 0) {
        jsonStart = firstBracket;
    }

    if (jsonStart > 0) {
        text = text.substring(jsonStart);
    }

    // Strip trailing commas before } or ] (common LLM mistake)
    text = text.replace(/,\s*([}\]])/g, '$1');

    return text;
}

/**
 * Unified Ollama API request handler.
 *
 * @param {object} opts
 * @param {string} opts.prompt       - User prompt text
 * @param {string} [opts.system]     - System prompt (uses Ollama's native system field)
 * @param {string} [opts.format]     - 'json' to request structured output
 * @param {object} [opts.options]    - Ollama generation options (temperature, num_ctx, etc.)
 * @param {number} [opts.timeout]    - Request timeout in ms
 * @param {number} [opts.retries]    - Number of retry attempts on failure
 * @param {string} [opts.model]      - Override the default model
 * @returns {Promise<string|object>} - Raw text (text mode) or parsed object (json mode)
 */
async function ollamaRequest({
    prompt,
    system,
    format,
    options = {},
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    model = DEFAULT_MODEL,
}) {
    const body = {
        model,
        prompt,
        stream: false,
    };
    if (system) body.system = system;
    if (format) body.format = format;
    if (Object.keys(options).length > 0) body.options = options;

    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
            if (attempt > 0) {
                console.warn(`[Ollama] Retry ${attempt}/${retries}...`);
            }

            const res = await fetch(`${OLLAMA_URL}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timer);

            if (!res.ok) {
                throw new Error(`Ollama API ${res.status}: ${res.statusText}`);
            }

            const data = await res.json();
            const raw = (data.response || '').trim();

            // Text mode — return raw response
            if (!format) return raw;

            // JSON mode — parse with cleanup fallback
            try {
                return JSON.parse(raw);
            } catch (_) {
                const cleaned = cleanLlmJson(raw);
                return JSON.parse(cleaned);
            }
        } catch (err) {
            clearTimeout(timer);
            lastError = err;

            if (err.name === 'AbortError') {
                lastError = new Error(`Ollama request timed out after ${timeout}ms`);
            }

            // Only retry on network/timeout/5xx errors, not parse errors
            const isRetryable = err.name === 'AbortError'
                || err.code === 'ECONNREFUSED'
                || err.code === 'ECONNRESET'
                || (err.message && err.message.includes('API 5'));

            if (!isRetryable || attempt >= retries) break;
        }
    }

    throw lastError;
}

// ---------------------------------------------------------------------------
// LLM Functions
// ---------------------------------------------------------------------------

/**
 * Rules Assistant — answers D&D 5e rules questions with party context.
 */
async function askRulesAssistant(question, partyContext) {
    const system = `You are an expert D&D 5th Edition Rules Assistant.
You provide clear, concise, and mechanics-focused rulings. Cite specific rules when possible.
Do not invent rules — if something is ambiguous, say so and suggest how a DM might rule.
Keep answers brief (2-4 paragraphs max). Use bullet points for multi-step processes.`;

    const prompt = `Current party state for context:
${JSON.stringify(partyContext, null, 2)}

Question: ${question}`;

    try {
        return await ollamaRequest({ prompt, system });
    } catch (e) {
        console.error('[Ollama] Rules assistant error:', e.message);
        return "I'm sorry, my connection to the weave (Ollama) was interrupted.";
    }
}

/**
 * Action Resolver — translates free-text action descriptions into structured
 * mechanical effects that the server can apply to characters.
 */
async function resolveActionLLM(actionText, partyContext) {
    const trimmedParty = partyContext.map(c => ({
        id: c.id,
        name: c.name,
        class: c.class,
        hp: `${c.current_hp}/${c.max_hp}`,
    }));

    const system = `You are a D&D 5e automated action resolver. Your ONLY job is to take an action description and translate it into a structured JSON array of mechanical state changes for the party members involved.

Supported effect types and their schemas:
1. HP change:       { "type": "hp",        "characterId": <ID>, "delta": <number>, "damageType": "<type>" }
   - Use negative delta for damage, positive for healing. damageType is optional.
2. Character state: { "type": "character", "characterId": <ID>, "updates": { "conditions": ["<cond>"], "concentration_spell": "<name>" | null, "spell_slots": { "<level>": <used_count> } } }
3. Buff applied:    { "type": "buff",      "characterId": <ID>, "buffData": { "name": "<string>", "sourceName": "<string>", "isConcentration": <boolean> } }

Rules:
- Return ONLY a raw JSON array of effect objects. No explanation text.
- Every effect MUST include "characterId" matching one of the valid target IDs.
- If the action doesn't clearly affect a party member, return an empty array [].`;

    const prompt = `Valid targets:
${JSON.stringify(trimmedParty, null, 2)}

Action to resolve:
"${actionText}"`;

    try {
        return await ollamaRequest({ prompt, system, format: 'json' });
    } catch (e) {
        console.error('[Ollama] Action resolver error:', e.message);
        return null;
    }
}

/**
 * Session Recap Generator — creates narrative prose from the action log.
 */
async function generateSessionRecap(logs) {
    const logSummary = logs.map(l =>
        `[${l.timestamp}] ${l.actor}: ${l.action_description}${l.status === 'rejected' ? ' (REJECTED by DM)' : ''}`
    ).join('\n');

    const system = `You are a master storyteller and D&D chronicle scribe. Your task is to transform a raw action log into a vivid, atmospheric narrative recap of the session.

Guidelines:
- Write in past tense, third person, as if recounting events in a campaign journal.
- Group related actions into narrative beats (combat sequences, exploration, roleplay moments).
- Use sensory details and dramatic language — make combat feel tense, social encounters feel nuanced.
- Mention character names and their key actions, but weave them into prose rather than listing them.
- If actions were rejected by the DM, omit them or note them as "attempted but failed."
- Keep the recap to 3-6 paragraphs. Quality over quantity.
- End with a hook or cliffhanger if the log suggests unresolved tension.`;

    const prompt = `Here is the session's action log. Transform it into a narrative recap:

${logSummary}

Write the narrative recap now:`;

    try {
        return await ollamaRequest({ prompt, system });
    } catch (e) {
        console.error('[Ollama] Session recap error:', e.message);
        return null;
    }
}

/**
 * Homebrew Stat Generator — produces D&D 5e stat blocks from a description.
 */
async function generateHomebrewStats(entityType, name, description) {
    const schemas = {
        monster: `{
  "hp": <number>, "ac": <number>, "speed": "<string>",
  "STR": <1-30>, "DEX": <1-30>, "CON": <1-30>, "INT": <1-30>, "WIS": <1-30>, "CHA": <1-30>,
  "challenge_rating": "<string>", "type": "<creature type>", "size": "<Tiny|Small|Medium|Large|Huge|Gargantuan>",
  "abilities": [{ "name": "<string>", "description": "<string>" }],
  "actions": [{ "name": "<string>", "description": "<string>" }]
}`,
        spell: `{
  "level": <0-9>, "school": "<abjuration|conjuration|divination|enchantment|evocation|illusion|necromancy|transmutation>",
  "casting_time": "<string>", "range": "<string>", "components": "<V, S, M (material)>",
  "duration": "<string>", "concentration": <boolean>,
  "description": "<mechanical effect description>"
}`,
        item: `{
  "type": "<Wondrous item|Weapon|Armor|Potion|Ring|etc.>",
  "rarity": "<Common|Uncommon|Rare|Very Rare|Legendary>",
  "attunement": <boolean>,
  "acBonus": <number|0>, "statBonuses": {}, "damage": "<string|null>",
  "description": "<mechanical effect description>"
}`,
    };

    const system = `You are a D&D 5e game designer and stat block generator.
Given a name and description, produce a balanced, official-style stat block as JSON.
Follow the output schema exactly. Do not add extra keys. Return ONLY raw JSON.`;

    const prompt = `Entity type: ${entityType}
Name: ${name}
Description: ${description}

Output Schema:
${schemas[entityType] || schemas.item}`;

    try {
        return await ollamaRequest({ prompt, system, format: 'json' });
    } catch (e) {
        console.error('[Ollama] Homebrew stats error:', e.message);
        return null;
    }
}

/**
 * Item Description Parser — extracts mechanical bonuses from item text.
 */
async function parseItemDescriptionLLM(itemName, description) {
    const system = `You are a D&D 5e item mechanics extractor.
Given an item name and its description, extract any mechanical bonuses into a structured JSON object.
Only include bonuses explicitly stated or strongly implied by the description.
If a field has no bonus, use the zero/empty default.`;

    const prompt = `Item: ${itemName}
Description: ${description}

Return ONLY JSON with this exact schema:
{
  "acBonus": <number|0>,
  "statBonuses": { "<ABILITY>": <bonus> },
  "resistances": ["<damage type>"],
  "immunities": ["<damage type>"],
  "vulnerabilities": ["<damage type>"],
  "speedBonus": <number|0>
}`;

    try {
        return await ollamaRequest({ prompt, system, format: 'json' });
    } catch (e) {
        console.error('[Ollama] Item parse error:', e.message);
        return { acBonus: 0, statBonuses: {}, resistances: [], immunities: [], vulnerabilities: [], speedBonus: 0 };
    }
}

/**
 * Lore Assistant — generates creative, atmospheric D&D content.
 */
async function generateLoreLLM(promptText) {
    const system = `You are an expert Dungeon Master and creative writer.
Your goal is to provide evocative, atmospheric, high-fantasy descriptions and ideas.
- If asked for a description, use sensory details (smell, sound, lighting, texture).
- If asked for NPCs, give them a unique quirk, motivation, and a memorable physical detail.
- If asked for loot, make it sound unique and storied — every item has a history.
- Keep responses concise but flavorful (2-4 paragraphs max).
- Avoid game-mechanics unless specifically asked.`;

    try {
        return await ollamaRequest({
            prompt: promptText,
            system,
            options: { temperature: 0.8 },
        });
    } catch (e) {
        console.error('[Ollama] Lore assistant error:', e.message);
        return 'The weave is silent... (Ollama Error)';
    }
}

/**
 * Loot Generator — creates thematic D&D loot as structured JSON.
 */
async function generateLootLLM(context) {
    const system = `You are a D&D 5e loot generator. Create unique, flavorful items that fit the context provided.
Each item should feel like it has a history — not just generic "+1 sword" entries.
Return ONLY a raw JSON array. No explanation text.`;

    const prompt = `Generate 1-3 unique items found in this context: ${context}

Output format — a JSON array:
[
  {
    "name": "<evocative item name>",
    "type": "<item|weapon|armor|potion|scroll|wondrous>",
    "rarity": "<Common|Uncommon|Rare|Very Rare>",
    "description": "<Flavorful visual description and brief history>",
    "stats": { "acBonus": 0, "statBonuses": {}, "damage": "<string|null>" }
  }
]`;

    try {
        return await ollamaRequest({ prompt, system, format: 'json' });
    } catch (e) {
        console.error('[Ollama] Loot generator error:', e.message);
        return [];
    }
}

/**
 * Weather Generator — produces structured weather data for the campaign world.
 */
async function generateWeatherLLM(climate) {
    const system = `You are a D&D 5e weather and environment engine.
Generate atmospheric weather appropriate for the given climate.
Return ONLY a raw JSON object with the exact schema below. No extra keys.`;

    const prompt = `Generate weather for a ${climate || 'Temperate'} climate.

Output schema:
{
  "condition": "<e.g. Heavy Rain, Blistering Heat, Arcane Fog>",
  "impact": "<Mechanical effect, e.g. Disadvantage on Perception checks>",
  "flavor": "<2-3 sentence atmospheric description>"
}`;

    try {
        return await ollamaRequest({ prompt, system, format: 'json' });
    } catch (e) {
        console.error('[Ollama] Weather generator error:', e.message);
        return null;
    }
}

/**
 * Character PDF Parser — extracts structured character data from PDF text.
 * Uses extended timeout and zero temperature for precision.
 */
async function parseCharacterPdfLLM(pdfText) {
    const system = `You are a high-precision data extractor for D&D 5e character sheets.
You MUST return a JSON object with EXACTLY these keys (camelCase):
{
  "name": "string",
  "species": "string",
  "background": "string",
  "classes": [{"name": "string", "level": number}],
  "baseMaxHp": number,
  "baseAc": number,
  "abilityScores": {"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10},
  "skills": ["Acrobatics", "Athletics"],
  "inventory": [{"name": "string", "quantity": 1, "equipped": true, "description": "string"}],
  "spells": [{"name": "string", "level": 0, "isConcentration": false}],
  "features": [{"name": "string", "description": "string"}]
}

Critical rules:
1. Use "name", never "character_name".
2. Use "species", never "race".
3. Ability scores are the BASE SCORES (8-20 typically), NOT modifiers (-1 to +5).
4. Only list proficient skills in the "skills" array.
5. No markdown blocks. Return ONLY raw JSON.`;

    const prompt = `Extract the character data from this PDF text:
---
${pdfText.substring(0, 18000)}
---`;

    try {
        console.log(`[Ollama] Parsing PDF with ${DEFAULT_MODEL} (${prompt.length} chars)...`);

        const parsed = await ollamaRequest({
            prompt,
            system,
            format: 'json',
            timeout: PDF_TIMEOUT,
            retries: 2,
            options: { num_ctx: 32768, temperature: 0 },
        });

        console.log(`[Ollama] PDF parse complete. Character: ${parsed.name || 'unknown'}`);

        // Run validation and attach results
        const validation = validateCharacter(parsed);
        parsed.validation = validation;
        return parsed;
    } catch (e) {
        console.error('[Ollama] PDF parse error:', e.message);
        throw e;
    }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
    askRulesAssistant,
    resolveActionLLM,
    generateSessionRecap,
    generateHomebrewStats,
    parseItemDescriptionLLM,
    parseCharacterPdfLLM,
    generateLoreLLM,
    generateLootLLM,
    generateWeatherLLM,
};
