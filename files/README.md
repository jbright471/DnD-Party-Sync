# DnD Party Sync — PDF Character Parser

Extracts structured character data from D&D Beyond PDF exports using an LLM.

## File Structure

```
dnd-parser/
├── types/
│   └── character.ts          # Character + SessionState TypeScript interfaces
├── lib/
│   ├── parsePdfToCharacter.ts # Core parser: PDF → text → LLM → Character object
│   └── validateCharacter.ts   # Sanity-checks parsed output before DB write
└── examples/
    └── usage.ts               # Wiring examples for Claude, Ollama, OpenAI
```

## Quick Start

```bash
npm install pdf-parse uuid @anthropic-ai/sdk
npm install -D @types/pdf-parse @types/uuid typescript ts-node

export ANTHROPIC_API_KEY=sk-ant-...

npx ts-node examples/usage.ts ./your-character.pdf
```

## How It Works

1. **`extractTextFromPdf`** — uses `pdf-parse` to pull raw text from the DDB PDF
2. **`buildParserSystemPrompt`** — returns the LLM prompt with all extraction rules
3. **`parseCharacterFromText`** — calls your LLM, cleans the response, parses JSON
4. **`parsePdfToCharacter`** — top-level orchestrator (steps 1–3 combined)
5. **`createInitialSessionState`** — builds the starting `SessionState` for a character
6. **`validateCharacter`** — catches the most common LLM extraction errors

## LLM Backend Options

| Backend | Accuracy | Cost | Privacy |
|---|---|---|---|
| Claude API (claude-opus-4-5) | Best | ~$0.01/parse | Data leaves homelab |
| Local Ollama (llama3.1:8b) | Good | Free | Fully local |
| OpenAI gpt-4o | Best | ~$0.01/parse | Data leaves homelab |

For a homelab/private game, **Ollama with llama3.1:8b or qwen2.5:14b** is recommended.
For maximum accuracy (especially for complex multiclass sheets), use Claude.

## Known Edge Cases Handled

- **Dual-class spellcasting** — two entries in `spellcasting[]`, matched to classes
- **Pact Magic slots** — counted alongside regular slots at their level
- **Always-prepared spells** — `alwaysPrepared: true`, no slot decrement
- **Item-granted spells** — `grantsSpell` on inventory item, source on spell
- **Concentration tracking** — flagged on spell, enforced by rules engine
- **Toggle features** — `resourceType: "toggle"`, no maxUses (e.g. Crimson Rite)
- **Mixed hit dice** — multiclass characters with different die types per class

## What the Validator Catches

The #1 LLM mistake is extracting **modifiers instead of ability scores** 
(returning 4 instead of 18 for DEX). The validator catches this and returns 
a descriptive error before bad data reaches your DB.

Other checks: HP range, proficiency bonus vs. level, spell slot counts (5e max 4/level),
item-granted spells present in spell list, hit dice total matching total level.

## Next Steps

Once characters import cleanly, build:
- **`/api/sessions`** — create a session, assign characters
- **`/api/sessions/:id/event`** — POST events (APPLY_DAMAGE, ADD_CONDITION, etc.)
- **Rules engine** — `resolveCurrentAC()`, `resolveAttackBonus()`, etc.
- **WebSocket broadcast** — emit updated `SessionState` to all connected clients
