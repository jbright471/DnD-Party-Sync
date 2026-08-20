# R1-E REST Access Matrix

R1-E is deny-by-default. The central middleware in `server/lib/restAuthorization.js` runs before every production router and inline API handler. Only the exact method/path pairs below are public. All other classified surfaces require the current revocable DM session. A new `/api` prefix is forbidden until it is explicitly added to the policy and this matrix.

| Route or prefix | Safe route class | Access | Data/action class |
|---|---|---|---|
| `POST /api/auth/dm` | `dm_auth` | Public | PIN exchange for a revocable DM session |
| `GET /api/health` | `health` | Public | Process health and memory telemetry |
| `/api/characters/import` | `character_imports` | DM session | Import, PDF upload, sync, pending approval writes |
| `/api/characters` | `characters` | DM session | Character reads/writes, HP, tokens, weapons, inspector/log data |
| `/api/encounters` | `encounters` | DM session | Encounter CRUD, duplicate, authenticated export |
| `/api/initiative` | `initiative` | DM session | Initiative/tracker state |
| `/api/maps` | `maps` | DM session | Map metadata, files, uploads, activation, tokens, markers |
| `/api/npcs` | `npcs` | DM session | NPC reads and writes |
| `/api/loot` | `loot` | DM session | AI generation, archive, direct assignment |
| `/api/quests` | `quests` | DM session | Public and hidden quest state; query flags grant no authority |
| `/api/world` | `world` | DM session | World time/weather reads, writes, and AI generation |
| `/api/notes` | `party_notes` | DM session | Shared note reads and writes |
| `/api/homebrew` | `homebrew` | DM session | Compendium CRUD, AI generation/parsing, assignment |
| `/api/automation` | `automation` | DM session | Presets and campaign-wide rules |
| `/api/dm-notes` | `dm_notes` | DM session | DM prep-note reads and writes |
| `/api/prep-packs` | `prep_packs` | DM session | Portable encounter import |
| `/api/effect-presets` | `effect_presets` | DM session | Preset reads and writes |
| `/api/combat/snapshots` | `combat_snapshots` | DM session | Snapshots, diffs, restore, restore audit |
| `/api/v1/effects/bulk-apply` | `bulk_effects` | DM session | Multi-target combat mutation |
| `/api/log` | `action_log` | DM session | Action history |
| `/api/lore` | `ai_lore` | DM session | Cost-bearing/local-AI lore generation |
| `/api/chat` | `ai_rules` | DM session | Cost-bearing/local-AI rules assistant |
| `/api/offline-bundle` | `offline_bundle` | DM session | Character and recent-effect export/diagnostic data |
| `/api/effect-timeline` | `effect_timeline` | DM session | Active/archive ledger and character provenance |
| `/api/combat-sessions` | `combat_sessions` | DM session | Session metadata and counts |
| `/api/sync-audit` | `sync_audit` | DM session | Connected-player and pending-save/import state |
| `/api/recaps` | `recaps` | DM session | Recap archive reads and writes |
| `/api/access-grants` | `access_grants` | DM session | Player/cast grant creation, listing, rotation, revocation |
| Any other `/api` prefix | `unclassified_api` | Forbidden | No handler executes |

## Credential and denial contract

- DM identity comes only from a server comparison with the current `campaign_state.dm_token`. The client may send it as `Authorization: Bearer <session>` or `X-DM-Token: <session>`.
- PINs, query strings, cookies, caller roles, `isDm`, character IDs/ownership claims, and access-grant assertions are never REST identity sources.
- Active player/cast grants are server-validated only to return a controlled `403 REST_DM_REQUIRED`; they gain no REST authority. Invalid or revoked credentials return `401 REST_DM_REQUIRED`. Unclassified prefixes return `403 REST_ROUTE_UNCLASSIFIED` even for a DM.
- The legacy `/api/dm-notes` unauthenticated `403` status is retained. No denied request reaches JSON parsing, upload handling, AI invocation, file delivery, or route side effects.
- Policy matching normalizes path case to mirror Express's default case-insensitive route matching, so `/API/...` variants cannot skip authorization.
- REST denial audits store the fixed event type, server-derived allowlisted role, allowlisted route class, denied outcome, sanitized direct-peer address, and fixed reason code. They never store a raw path, query, body, PIN, token, authorization/cookie header, or grant credential.

## Change invariant

`server/test/restAuthorization.test.js` extracts every production `app.use` mount and inline `/api` literal from `server/server.js` and requires an allowlisted policy classification. Additions must deliberately update the policy, this matrix, production-process integration coverage, and any affected client fetch/file flow.
