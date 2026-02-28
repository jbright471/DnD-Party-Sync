// lib/parsePdfToCharacter.ts
//
// USAGE:
//   import { parsePdfToCharacter } from './lib/parsePdfToCharacter';
//   const character = await parsePdfToCharacter(pdfBuffer);
//
// DEPENDENCIES:
//   npm install pdf-parse uuid
//   npm install -D @types/pdf-parse @types/uuid

import pdfParse from 'pdf-parse';
import { v4 as uuidv4 } from 'uuid';
import type { Character } from '../types/character';

// ---------------------------------------------------------------------------
// STEP 1: Extract raw text from the PDF buffer
// ---------------------------------------------------------------------------

export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  const data = await pdfParse(pdfBuffer);
  return data.text;
}

// ---------------------------------------------------------------------------
// STEP 2: Build the LLM system prompt
//
// This is the core artifact. It instructs the LLM to act as a structured
// data extractor, not a conversational assistant. It handles every edge case
// we've identified: dual-class spellcasting, slot bubble notation, item-
// granted spells, always-prepared spells, and toggle vs. counted features.
// ---------------------------------------------------------------------------

export function buildParserSystemPrompt(): string {
  return `
You are a precise data extraction engine for D&D Beyond character sheet PDFs.
Your ONLY job is to extract structured data from the raw text of a DDB PDF export 
and return a single valid JSON object. You must never add commentary, markdown 
fences, or explanation. Return ONLY the raw JSON object — nothing before it, 
nothing after it.

=== OUTPUT SCHEMA ===

Return exactly this JSON structure. All fields are required unless marked optional.

{
  "name": string,
  "species": string,
  "background": string,

  "classes": [
    { "name": string, "level": number }
  ],

  "baseMaxHp": number,
  "baseAc": number,
  "initiativeBonus": number,   // the number shown in the Initiative box (may be negative)
  "speed": number,             // walking speed in feet, integer only
  "proficiencyBonus": number,

  "abilityScores": {
    "STR": number, "DEX": number, "CON": number,
    "INT": number, "WIS": number, "CHA": number
  },

  "savingThrows": {
    "STR": number, "DEX": number, "CON": number,
    "INT": number, "WIS": number, "CHA": number
  },

  "skills": {
    "acrobatics": number,
    "animalHandling": number,
    "arcana": number,
    "athletics": number,
    "deception": number,
    "history": number,
    "insight": number,
    "intimidation": number,
    "investigation": number,
    "medicine": number,
    "nature": number,
    "perception": number,
    "performance": number,
    "persuasion": number,
    "religion": number,
    "sleightOfHand": number,
    "stealth": number,
    "survival": number
  },

  "passives": {
    "perception": number,
    "insight": number,
    "investigation": number
  },

  "spellSlots": {
    // Keys are spell level as strings. Include ONLY levels that have slots.
    // Source: lines like "=== 1st LEVEL === 4 Slots OOOO" or "2 Slots OO"
    // Count the O characters to get the number. Example: "OOOO" = 4
    // Include Pact Magic slots at the level they appear (e.g., "1 Pact O" → { "1": 1 })
    // OMIT levels with 0 slots.
    "1": number,   // example
    "2": number    // example
  },

  "hitDice": {
    // Keys are die types as strings: "d6", "d8", "d10", "d12"
    // Values are total count across all class levels with that die type.
    // Source: Hit Dice box, e.g. "5d10 + 3d10" → { "d10": 8 }
    // Mixed multiclass example: "4d8 + 3d10" → { "d8": 4, "d10": 3 }
  },

  "weapons": [
    {
      "name": string,
      "attackBonus": number,     // the number shown (e.g., +13 → 13)
      "damage": string,          // e.g., "1d8+8 Piercing" — preserve exactly
      "properties": string[]     // from the Notes column: split by comma
    }
  ],

  "inventory": [
    {
      "name": string,
      "quantity": number,
      "isAttuned": boolean,
      // Optional: if you can identify that this item grants a specific spell,
      // include it. Example: Ring of Water Walking → grantsSpell: "Water Walk"
      "grantsSpell": string | null
    }
  ],

  "proficiencies": {
    "armor": string[],     // e.g., ["Light Armor", "Medium Armor", "Shields"]
    "weapons": string[],   // e.g., ["Martial Weapons", "Simple Weapons"]
    "tools": string[],     // e.g., ["Alchemist's Supplies", "Pan Flute"]
    "languages": string[]  // e.g., ["Common", "Elvish", "Giant"]
  },

  "spellcasting": [
    // One entry PER casting class. If character has two casting classes,
    // there will be two entries. The PDF shows them as "WIS / WIS" and "14/14".
    {
      "classSource": string,     // e.g., "Ranger", "Blood Hunter"
      "ability": string,         // "STR"|"DEX"|"CON"|"INT"|"WIS"|"CHA"
      "saveDC": number,
      "attackBonus": number
    }
  ],

  "spells": [
    {
      "name": string,
      "level": number,            // 0 for cantrips
      "isConcentration": boolean, // true if "Concentration" appears in Duration column
      "alwaysPrepared": boolean,  // true if marked "P" in the Prep column
      "source": string            // value in the Source column, verbatim
    }
  ],

  "features": [
    {
      "name": string,
      "description": string,      // first sentence only — keep it brief
      // resourceType rules:
      //   "shortRest" → feature recharges on short rest
      //   "longRest"  → feature recharges on long rest
      //   "toggle"    → feature is activated/deactivated (like Crimson Rite)
      //   omit field  → passive feature, no resource
      "resourceType": "shortRest" | "longRest" | "toggle" | null,
      // maxUses rules:
      //   number      → fixed uses (e.g., "3 times per long rest" → 3)
      //   null        → for toggles, passives, or "level-based" (use null, not a formula)
      "maxUses": number | null
    }
  ]
}

=== EXTRACTION RULES ===

1. ABILITY SCORES: Extract the large numbers in the ability score boxes (9, 18, 14...),
   NOT the modifier values (+4, -1...). Modifiers are in parentheses or smaller text.

2. SAVING THROWS & SKILLS: Extract the signed modifier value shown next to each 
   (e.g., "+7 Dexterity" → DEX saving throw = 7). Always store as plain integer 
   (7, not "+7").

3. INITIATIVE: The value in the Initiative box. Treat as signed integer. "+4" → 4.

4. SPELL SLOTS: CRITICAL — count the "O" bubble characters next to each level header.
   "4 Slots OOOO" → 4. "2 Slots OO" → 2. "1 Pact O" → treat as a slot at that level.
   Do NOT invent slot counts. If text is ambiguous, use what is literally present.

5. CONCENTRATION: A spell is concentration if the Duration column contains the word 
   "Concentration" or "Conc." Examples: "Concentration, up to 1 hour" → true.

6. ALWAYS PREPARED: A spell has alwaysPrepared: true ONLY if marked with "P" in the 
   Prep column, or if its Source label contains "Always Prepared".

7. ITEM-GRANTED SPELLS: If an item name strongly implies a spell (Ring of Water Walking
   → Water Walk, Necklace of Fireballs → Fireball), set grantsSpell on that inventory
   item. If uncertain, set grantsSpell: null.

8. MULTICLASS SPELLCASTING: If two spellcasting classes exist, create two entries in
   the spellcasting array. Match class to ability based on context (the PDF may show
   "WIS / WIS" — use class knowledge to assign if ambiguous, e.g. Ranger uses WIS,
   Blood Hunter uses WIS).

9. FEATURES: Include all named class features, species traits, and feats. For Blood 
   Hunter's Crimson Rite specifically: resourceType = "toggle", maxUses = null.
   For Hunter's Sense: resourceType = "longRest", maxUses = 3 (read from the PDF text).
   For Blood Curse of Bloated Agony: resourceType = "shortRest", maxUses = null 
   (uses are governed by Blood Maledict charges, which are level-based — use null).

10. NUMBERS ONLY: All numeric fields must be numbers, never strings. 
    "+13" → 13. "16" → 16. Never include "+" signs in output.

11. IF DATA IS MISSING: If a field cannot be found in the text, use these defaults:
    - number fields → 0
    - string fields → ""
    - array fields → []
    - boolean fields → false
    Never hallucinate values. Only extract what is present.

=== COMMON ERRORS TO AVOID ===

- Do NOT confuse ability score modifiers with the scores themselves
- Do NOT include markdown code fences in output
- Do NOT include any text before the opening { or after the closing }
- Do NOT use trailing commas in JSON
- Do NOT invent spell slot counts — count the O bubbles literally
- Do NOT include spells that appear only in feature descriptions unless they 
  also appear in the Spells section of the sheet
`.trim();
}

// ---------------------------------------------------------------------------
// STEP 3: Call the LLM with the extracted text and parse the response
// ---------------------------------------------------------------------------

export interface LLMCallOptions {
  // Replace with your actual LLM client call.
  // This signature works for OpenAI, local Ollama, or any OpenAI-compatible API.
  callLLM: (systemPrompt: string, userMessage: string) => Promise<string>;
}

export async function parseCharacterFromText(
  rawPdfText: string,
  options: LLMCallOptions
): Promise<Character> {
  const systemPrompt = buildParserSystemPrompt();

  const userMessage = `
Extract the character data from this D&D Beyond PDF export text.
Return ONLY the JSON object — no commentary, no markdown, no preamble.

=== RAW PDF TEXT ===
${rawPdfText}
`.trim();

  const rawResponse = await options.callLLM(systemPrompt, userMessage);

  // Strip any accidental markdown fences the LLM might add despite instructions
  const cleaned = rawResponse
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: Omit<Character, 'id' | 'hitDice'> & {
    hitDice?: Record<string, number>;
  };

  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `LLM returned invalid JSON.\n\nRaw response:\n${rawResponse}\n\nParse error: ${err}`
    );
  }

  // Assign a fresh app-side ID and normalize hitDice default
  const character: Character = {
    id: uuidv4(),
    hitDice: {},
    ...parsed,
  };

  return character;
}

// ---------------------------------------------------------------------------
// STEP 4: Top-level orchestrator — takes a raw PDF buffer, returns Character
// ---------------------------------------------------------------------------

export async function parsePdfToCharacter(
  pdfBuffer: Buffer,
  options: LLMCallOptions
): Promise<Character> {
  const rawText = await extractTextFromPdf(pdfBuffer);
  const character = await parseCharacterFromText(rawText, options);
  return character;
}

// ---------------------------------------------------------------------------
// STEP 5: SessionState factory — given a parsed Character, build the initial
// empty session state. Call this when a GM adds a character to a session.
// ---------------------------------------------------------------------------

import type { SessionState } from '../types/character';

export function createInitialSessionState(
  character: Character,
  sessionId: string
): SessionState {
  // Build featureUses map: only features with maxUses get a tracked counter
  const featureUses: Record<string, number> = {};
  for (const feature of character.features) {
    if (feature.maxUses !== null && feature.maxUses !== undefined) {
      featureUses[feature.name] = 0; // 0 used at session start
    }
  }

  // Build hitDiceUsed map: same die types as character, all starting at 0
  const hitDiceUsed: Record<string, number> = {};
  for (const dieType of Object.keys(character.hitDice)) {
    hitDiceUsed[dieType] = 0;
  }

  return {
    characterId: character.id,
    sessionId,

    currentHp: character.baseMaxHp,
    tempHp: 0,
    deathSaves: { successes: 0, failures: 0 },

    activeConditions: [],
    activeBuffs: [],

    concentratingOn: null,
    spellSlotsUsed: {}, // empty = no slots used yet

    hitDiceUsed,
    featureUses,
    activeFeatures: [],
  };
}
