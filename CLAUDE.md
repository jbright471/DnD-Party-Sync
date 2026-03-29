# CLAUDE.md — Arcane Ally / DnD Party Sync

## Development Commands
- `cd client && npx tsc --noEmit` — TypeScript check; silent output = clean. Run before finishing any client work.
- `docker-compose up --build -d` — Full rebuild and launch (Portainer or CLI).

## Architecture: The State Flow
All game state changes follow a strict one-way pipeline — never short-circuit it:
```
client socket.emit(event) → server handler → broadcastPartyState() → 'party_state' event → normaliseCharacter() → React state
```
Do not mutate local React state directly. Wait for the broadcast.

## Architecture: Key Files
- `client/src/context/GameContext.tsx` — `normaliseCharacter()` is the single transform from raw server data to the `Character` type. All field mapping lives here.
- `client/src/types/character.ts` — Canonical types (`Character`, `WeaponAttack`, `DamageType`, `SharedLootItem`, etc.). Extend here first.
- `client/src/types/compendium.ts` — Compendium types (`MonsterStats`, `SpellStats`, `ItemStats`, `CompendiumEntity`).
- `client/src/types/effects.ts` — Effect event types and `EVENT_META` color/label map.
- `server/lib/rulesIntegration.js` — All socket event handlers that mutate game state (`applyConditionEvent`, etc.).
- `server/lib/rulesEngine.js` — Pure logic functions (no DB calls).
- `server/lib/effectEngine.js` — `writeAuditEvent()` (with idempotency dedup), `reverseEvent()`, timeline management.
- `server/lib/permissions.js` — `checkPermission()` for loot/cross-player/inventory authority rules.
- `server/routes/initiative.js` — `spawnMonster()` auto-rolls initiative and stores full `stats_json`.
- `client/src/lib/open5e.ts` — SRD search client; normalizes open5e API responses to `CompendiumEntity`.
- `client/src/lib/loreParser.ts` — Regex parser that extracts `<EntityData>` blocks from AI lore responses.
- `client/src/components/ActionableLoreMessage.tsx` — Renders AI responses with interactive entity cards (item→loot, monster→combat, npc→notes).

## Known Gotchas
- **Condition case mismatch**: `rulesEngine.js` stores conditions as lowercase (`condition.toLowerCase()`). `DND_CONDITIONS` in `character.ts` is Title Case. Always capitalize in `normaliseCharacter()` — currently handled but fragile.
- **`character.attacks` not populated by DDB importer**: `ActionsPanel` falls back to example weapons. Don't rely on this field being set.
- **Per-skill proficiency not in schema**: `StatChecks` uses base ability modifier only. The proficiency dot on `RollableStat` is visual-only until the Character schema is extended.
- **`session_states` row auto-created**: `getSessionState()` creates a default row if missing — no manual migration needed for new characters, but DDB-imported characters may have missing rows until first state mutation.
- **SRD entity IDs are negative**: `open5e.ts` generates deterministic negative IDs from slugs to avoid collision with DB auto-increment IDs. Never assume entity IDs are positive.
- **`<EntityData>` regex is global with lastIndex**: `loreParser.ts` resets `ENTITY_TAG_RE.lastIndex` after each use. If you add new regex consumers, remember to reset.
- **`initiative_tracker.stats_json`** is nullable: only populated when spawned from Compendium or AI. Quick-spawned monsters have `null`.

## UI Conventions
- **Dark fantasy aesthetic**: deep navy/black backgrounds, `text-primary` (gold/amber) accents, `text-destructive` (red) for damage, `text-health` (green) for healing.
- **Dice roll broadcasts**: extend `socket.emit('dice_roll', {...})` with `label`, `rollType`, `source`, `damageType` for effect stream context.
- **shadcn/ui primitives installed**: Tooltip, Popover, Dialog, DropdownMenu, Sheet, ResizablePanel — use these before writing custom overlays.
- **lucide-react `^0.462.0`**: Crosshair, Target, Swords, Dices, Zap, Globe, Database, Copy, HelpCircle all confirmed available.
- **Tailwind v4**: Arbitrary grid values work — `grid-cols-[280px_1fr]`. Sticky grid children require `items-start` on parent.
- **Sticky two-column pattern**: `lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto` on the narrower column.
- **Entity type colors**: Monsters = `text-red-400`, Spells = `text-violet-400`, Items = `text-amber-400`. Consistent across Compendium, ActionableLoreMessage, and loot UI.
- **HelpButton**: Use `<HelpButton title="..." content="..." />` for contextual help popovers next to UI elements.

## Key Feature Patterns

### Compendium (Official SRD + Homebrew)
- Official tab searches open5e API with 400ms debounce; results are read-only
- "Clone to Homebrew" copies SRD entity to local DB for editing
- AI generation creates drafts that must be reviewed before saving
- Spawn passes full `stats` blob to `spawn_monster` for tracker persistence

### Actionable AI Responses
- `generateLoreLLM()` system prompt instructs AI to emit `<EntityData type="item|monster|npc">` JSON blocks
- `loreParser.ts` strips tags from display text, extracts structured payloads
- `ActionableLoreMessage` renders interactive cards with one-click game injection
- Buttons disable after use to prevent duplicates

### Idempotency & Audit
- All mutation socket emits should include `requestId` from `client/src/lib/requestId.ts`
- Server checks `effect_events.request_id` uniqueness before applying
- `writeAuditEvent()` wraps `writeEventRecord()` with dedup + human-readable description
- `reverseEvent()` applies inverse operations (damage↔heal, condition↔remove)

### Permissions
- `campaign_state.resource_permissions` JSON controls loot_claim, cross_player_effects, inventory_transfer
- Values: `"open"` | `"dm_approval"` | `"owner_only"`
- `checkPermission()` gates socket handlers; non-DM actions create pending entries when approval required

## Agent Roles (see `.agents/workflows/roles.md`)
`@frontend-weaver` · `@backend-smith` · `@db-architect` · `@ai-whisperer` · `@devops-warden` · `@lore-keeper`
