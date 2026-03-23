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
- `client/src/types/character.ts` — Canonical types (`Character`, `WeaponAttack`, `DamageType`, etc.). Extend here first.
- `server/lib/rulesIntegration.js` — All socket event handlers that mutate game state (`applyConditionEvent`, etc.).
- `server/lib/rulesEngine.js` — Pure logic functions (no DB calls).

## Known Gotchas
- **Condition case mismatch**: `rulesEngine.js` stores conditions as lowercase (`condition.toLowerCase()`). `DND_CONDITIONS` in `character.ts` is Title Case. Always capitalize in `normaliseCharacter()` — currently handled but fragile.
- **`character.attacks` not populated by DDB importer**: `ActionsPanel` falls back to example weapons. Don't rely on this field being set.
- **Per-skill proficiency not in schema**: `StatChecks` uses base ability modifier only. The proficiency dot on `RollableStat` is visual-only until the Character schema is extended.
- **`session_states` row auto-created**: `getSessionState()` creates a default row if missing — no manual migration needed for new characters, but DDB-imported characters may have missing rows until first state mutation.

## UI Conventions
- **Dark fantasy aesthetic**: deep navy/black backgrounds, `text-primary` (gold/amber) accents, `text-destructive` (red) for damage, `text-health` (green) for healing.
- **Dice roll broadcasts**: extend `socket.emit('dice_roll', {...})` with `label`, `rollType`, `source`, `damageType` for effect stream context.
- **shadcn/ui primitives installed**: Tooltip, Popover, Dialog, DropdownMenu, Sheet — use these before writing custom overlays.
- **lucide-react `^0.462.0`**: Crosshair, Target, Swords, Dices, Zap all confirmed available.
- **Tailwind v4**: Arbitrary grid values work — `grid-cols-[280px_1fr]`. Sticky grid children require `items-start` on parent.
- **Sticky two-column pattern**: `lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto` on the narrower column.

## Agent Roles (see `.agents/workflows/roles.md`)
`@frontend-weaver` · `@backend-smith` · `@db-architect` · `@ai-whisperer` · `@devops-warden` · `@lore-keeper`
