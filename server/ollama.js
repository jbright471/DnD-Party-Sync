const fetch = require('node-fetch');

// Default to localhost, allow override via Docker environment variables
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3';

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
        return "I'm sorry, my connection to the weave (Ollama) was interrupted. Please ensure Ollama is running with the 'llama3' model.";
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

You must return a JSON array of effect objects. There are two valid types of effect objects:
1. HP Change (damage or healing):
   {"type": "hp", "characterId": 123, "delta": -15} // negative for damage, positive for healing
2. Status/Resource Updates (conditions, inspiration, spell_slots):
   {"type": "character", "characterId": 123, "updates": {"conditions": ["Blinded"], "inspiration": 1}}

Action description to resolve:
"${actionText}"

Return ONLY valid JSON. Absolutely no markdown blocks (\`\`\`json), no introductory text, no explanations. Just the raw array.`;

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

        let parsed;
        try {
            parsed = JSON.parse(jsonStr);
        } catch (err) {
            // Fallback: sometimes LLM still wraps in markdown
            const cleaned = jsonStr.replace(/^```json/g, '').replace(/```$/g, '').trim();
            parsed = JSON.parse(cleaned);
        }

        if (!Array.isArray(parsed)) {
            parsed = [parsed]; // Guarantee array
        }
        return parsed;

    } catch (e) {
        console.error('[Ollama] Error resolving action:', e.message);
        return null; // Signals failure, fallback to manual log
    }
}

// ---- Session Recap Generator (Phase 3) ----

async function generateSessionRecap(logs) {
    const logSummary = logs.map(l =>
        `[${l.timestamp}] ${l.actor}: ${l.action_description}${l.status === 'rejected' ? ' (REJECTED by DM)' : ''}`
    ).join('\n');

    const prompt = `You are a D&D chronicle scribe. You have been given the raw mechanical action log from a D&D 5th edition session. Your job is to transform these dry mechanical entries into a short, vivid, in-universe narrative recap.

Rules:
- Write in past tense, third person
- Keep it between 3-6 paragraphs
- Reference character names and their actions dramatically
- Mention key moments: big damage, healing surges, status effects, kills, close calls
- Ignore system messages like "Approval Mode ON/OFF"
- Add flavor but do NOT invent events that aren't in the log
- End the recap with a dramatic hook or closure

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
        schemaHint = `{
  "hp": 45, "ac": 15, "speed": "30 ft",
  "str": 16, "dex": 12, "con": 14, "int": 8, "wis": 10, "cha": 6,
  "challenge_rating": "3",
  "attacks": [{"name": "Claw", "hit": "+5", "damage": "2d6+3 slashing"}],
  "abilities": [{"name": "Pack Tactics", "description": "..."}],
  "resistances": [], "immunities": [], "vulnerabilities": []
}`;
    } else if (entityType === 'spell') {
        schemaHint = `{
  "level": 3, "school": "Evocation", "casting_time": "1 action",
  "range": "120 feet", "components": "V, S, M (a bit of phosphorus)",
  "duration": "Instantaneous", "damage": "8d6 fire",
  "save": "DEX half", "description": "..."
}`;
    } else {
        schemaHint = `{
  "type": "Wondrous item", "rarity": "Rare", "requires_attunement": true,
  "ac_bonus": 0, "damage_bonus": 0,
  "effects": [{"trigger": "on equip", "description": "..."}],
  "description": "..."
}`;
    }

    const prompt = `You are a D&D 5e game designer. Parse the following homebrew ${entityType} description and generate a balanced, structured JSON stat block for it.

Name: ${name}
Description: ${description}

Your output must follow this JSON schema:
${schemaHint}

Return ONLY valid JSON. No markdown blocks, no introductory text, no explanations. Just the raw JSON object.`;

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

        let parsed;
        try {
            parsed = JSON.parse(jsonStr);
        } catch (err) {
            const cleaned = jsonStr.replace(/^```json/g, '').replace(/```$/g, '').trim();
            parsed = JSON.parse(cleaned);
        }
        return parsed;
    } catch (e) {
        console.error('[Ollama] Error generating homebrew stats:', e.message);
        return null;
    }
}

module.exports = {
    askRulesAssistant,
    resolveActionLLM,
    generateSessionRecap,
    generateHomebrewStats
};
