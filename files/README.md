# Arcane Ally Legacy Parser References

This folder contains older reference/prototype files from the character parser and rules-engine exploration phase. The active application code now lives in:

- `client/` - React/Vite frontend
- `server/` - Express, Socket.io, SQLite backend
- `server/routes/importer.js` - active D&D Beyond and PDF import route logic
- `server/lib/validator.js` and `server/lib/importValidator.js` - active import validation
- `server/lib/rulesEngine.js` and `server/lib/rulesIntegration.js` - active rules calculations and state mutation helpers

Keep this folder as historical implementation reference unless a file has been deliberately promoted into `client/` or `server/`.

## Current PDF Import Posture

Arcane Ally is designed for self-hosted play. PDF parsing and item/rules extraction should use the configured local Ollama endpoint from `.env`:

```env
OLLAMA_URL=http://localhost:11434
```

Do not commit real API keys, private PDFs, character exports, or local database files. The repo ignore rules already exclude `.env`, PDFs, local SQLite files, private key formats, `node_modules`, and build output.

## Historical Flow Captured Here

The prototype files demonstrate these concepts:

1. Extract text from a character-sheet PDF.
2. Ask an LLM to return strict JSON.
3. Validate that ability scores, HP, proficiency, slots, and inventory are plausible.
4. Create initial session state for HP, conditions, spell slots, and resources.
5. Hand validated data to the live app's server-side importer.

Use the active server routes and tests as the source of truth before reusing any code from this folder.
