# Changelog

All notable changes to the **Arcane Ally** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to Semantic Versioning.

## [Unreleased]

### Added
- **Multi-Phase Boss Tracker**: DMs can configure two or more phases on a monster, set phase-specific HP and AC, choose reset/retain/proportional HP transitions, and optionally clear conditions or buffs per phase.
- **Concentration Ownership**: Concentration effects now retain their casting-character and spell-instance ownership so dropping concentration removes linked buffs from characters and monsters together.
- **Campaign Automation Policies**: DMs can configure automatic unconscious handling, recovery cleanup, concentration cleanup and check behavior, condition duration ticks, initiative sync, turn triggers, auras, and curated reactive handlers from **DM Dashboard -> Automation -> Policies**.
- **Encounter Timeline Archives**: Combat events are assigned to named combat sessions and retained when an encounter ends instead of being deleted when the next encounter starts.
- **Combat History API**: Added combat-session listing and cursor-based timeline queries for active and archived encounters.
- **Focused Coverage**: Added tests for enabled defaults, partial policy persistence, disabled automation behavior, and encounter history isolation.

### Changed
- **Role-Safe Live State**: DM, player, public, and cast clients now receive server-projected combat payloads. Hidden monsters stay DM-only, cast displays use monster health labels instead of exact values, and players receive full private details only for their registered character.
- **Cast View Safety**: The encounter cast socket is read-only at the server boundary and no longer receives future boss phases, monster stat blocks, effect details, action logs, notes, or pending imports.
- **Timeline Discovery**: The DM timeline now includes a current/archive selector, earlier-event pagination, read-only archived views, and search across actors, targets, descriptions, spells, conditions, and event payloads.
- **Automation Authority**: HP rules, concentration behavior, condition ticks, initiative synchronization, turn triggers, auras, and reactive handlers now consult the same server-side campaign policy source.
- **Documentation**: Updated the README, client guide, Arcane Codex, and technical references for policy controls, encounter retention, and container-native dependency isolation.

### Fixed
- **Timeline Retention**: Starting a new encounter no longer destroys the previous encounter's effect history.
- **Automation Dialog Accessibility**: Added the missing dialog description and accessible labels for the new policy and timeline controls.

## [1.0.2] - 2026-07-08

### Added
- **Roll Visibility Modes**: Dice rolls now support public, private, secret, and super-secret visibility. Secret rolls are rolled server-side so players can voluntarily hide rolls from themselves while still routing full results to the DM.
- **DM Save Visibility Controls**: DM-requested saving throws can now specify visibility, allowing public saves, private player+DM saves, DM-only secret saves, or super-secret saves with no player acknowledgement.
- **Curated Reactive Automation**: Added the first built-in reactive handler, `retributive_healing`, which can trigger a self-heal reaction from equipped or homebrew item metadata without recursive loops.

### Changed
- **0 HP Rules Lifecycle**: Damage that drops a character to 0 HP now automatically applies `unconscious`; healing above 0 HP removes the automatic unconscious condition.
- **Roll Feed Filtering**: DM roll feed privacy filters now group private, secret, and super-secret rolls consistently under non-public roll visibility.
- **Documentation Refresh**: Updated public, developer, and agent-facing docs to reflect the current Arcane Ally app name, local-first privacy posture, and active feature set.
- **Arcane Codex Onboarding**: Reworked the in-app guide into task-first categories, added roll visibility/troubleshooting guidance, and improved rendering for tables and code examples.

### Fixed
- **Hidden Save Routing**: Legacy blind-roll save resolution now respects the pending save visibility mode instead of broadcasting hidden results publicly.
- **Secret Roll Acknowledgements**: Hidden saving throws no longer emit duplicate masked acknowledgements to the rolling player.

## [1.0.1] - 2026-06-21

### Added
- **Global Feature Toggles (Grim-Rage)**: Added interactive toggles on Character Sheets for class-specific states (e.g., Barbarian's Rage, Blood Hunter rites) that automatically broadcast defensive adjustments (resistances/immunities) to the server's core rules parser.
- **Encounter Cast View**: Created a standalone read-only cast window located at `/encounter/:id/cast` designed with a dark-fantasy aesthetic, ideal for casting the live party state and initiative order to a secondary monitor or TV screen.

### Changed
- **Decoupled Visual State**: Insulated local UI animations (e.g., DiceRoller drag-and-drop gestures) from websocket state mutations using React component memoization and state decoupling, preventing UI reset glitches during combat.
- **Centralized Rules Parsing**: Abstracted string matching logic for conditional rules and modifiers away from the frontend client and into the backend's `rules-parser` and `rulesEngine.js` integrations.
- **Transient State Teardown**: Updated rules lifecycle to properly drop transient states (like active concentration or temporary modifiers) when a character's HP reaches 0.
- **Arcane Codex Update**: Appended dedicated chapters to the internal documentation guidebook detailing the Grim-Rage feature toggles and the Encounter Cast View.

## [1.0.0] - 2026-06-08

### Added
- **🛡️ External Sheet Import Guardrails**: Real-time validation layer analyzing incoming character stats (Level, HP, AC, ability scores) from D&D Beyond or PDFs. Flags standard 5e rules anomalies (Danger/Warning/Info) and holds player-initiated updates in a staged DM approval queue (`pending_imports`).
- **🗃️ DM Staging Queue Console**: Created `ImportDiffModal.tsx` rendering side-by-side comparative views of level, HP, AC, and ability changes. Displays safety flags and triggers DM approvals/discards.
- **✨ Effect Preset Library**: Reusable DM-created templates for spells, conditions, monster auras, and environmental modifiers. Pre-seeded with *Bless*, *Haste*, *Shield of Faith*, *Frightened*, and *Poisoned*.
- **⚡ Bulk Preset Application**: Built `EffectPresetLibrary.tsx` drawer letting DMs search, create custom templates, and select combatants to apply effects concurrently.
- **⚙️ Persisted Approval Mode State**: Persisted the toggle state of `isApprovalMode` in the SQLite database under key `'approval_mode'` inside `campaign_state` table.

### Changed
- **📝 Sockets Payload Alignment**: Enhanced `pending_import_created` socket emission payload to include the full `incomingData` object for real-time frontend synchronization.
- **📖 Arcane Codex Update**: Appended dedicated chapters to the internal documentation guidebook detailing the Effect Preset Library and the Import Guardrails & Safety Diffs engines.

## [1.16.0] - 2026-06-05

### Added
- **🛡️ Player Miniature Sidebar**: Integrated a slide-out drawer on the left side of the combat tracker (`SidebarSheetMini.tsx`) showing live player cards, HP status (+/-5 quick controls), AC/Speed/ability grid, active conditions, and interactive spell slot pips (click to toggle and sync preparation status via WebSockets).
- **⚡ Bulk AoE REST API**: Added a secure POST `/api/v1/effects/bulk-apply` endpoint for multi-target actions. Loops targets concurrently using `Promise.all` and wraps writes in database savepoint transactions. A single target validation failure rolls back independently without affecting other targets.
- **⚙️ V8 Memory Telemetry & Loop Guard**: Exposed a `/api/health` telemetry endpoint displaying uptime and V8 memory usage profiles (`rss`, `heapTotal`, `heapUsed`). Integrated an automated memory monitoring script (`healthcheck.js`) that aborts the process (exit code 1) if memory consumption exceeds 500MB, preventing endless execution loops.
- **✨ Gothic Scrollbars & Tag Glow Animators**: Added custom CSS scrollbars, `@keyframes gothic-glow`, and `@keyframes flash-tag-glow` to style active state modifications. Floating, color-coded tag flashes temporarily display telemetry feedback (e.g. `+Bless`, `-Prone`, `+2 AC`) when character state updates.

### Changed
- **🐳 3-Stage Lightweight Docker Container**: Refactored `Dockerfile` into a multi-stage compilation flow, fully discarding build dependencies (`python3`, `make`, `g++`) from the final release image, and declared the automated health check path.
- **🧪 Rules Engine Attribute Resolution**: Hardened `rulesEngine.js` and `rulesIntegration.js` to propagate active conditions during stat calculations, ensuring equipment modifiers (like Strength/Dexterity) drop automatically when characters are disabled (e.g. paralyzed, stunned, unconscious).
- **📖 Arcane Codex Update**: Expanded the guidebook sections (`self-hosting`, `equipment-inventory`, `combat-management`, `modifier-trace`) to detail level-scaling formulas, condition-disabled suppressions, stacking rules, and Docker telemetries.

## [1.15.0] - 2026-05-22

### Added
- **🗃️ Rollback Audit Log & Purge**: Added a new combat restore audit database table and a Recovery History view in the CombatRecoveryModal to securely log DM combat rollback usage. Includes a Purge History option.
- **🎒 Portable Encounter Packs**: DMs can now import lightweight Encounter Pack JSON files directly from the DM Dashboard. Added comprehensive schema validation.

## [1.14.0] - 2026-05-19

### Added
- **🔍 Modifier Trace Overlay (Phase 20.0)**: Integrated calculations provenance to mathematically resolve character AC, Ability Scores, Saving Throws, Skills, Speed, and Initiative in real-time. Hovering or tapping any statistic displays a beautiful Radix popover detailing the base scores, active equipment, temporary dynamic buffs, and environmental condition reductions (e.g. grappled, paralyzed) affecting that stat.
- **⏳ Combat Session Snapshots (Phase 20.0)**: Seamless encounter chronology backups. The system automatically records deep SQLite checkpoints in the background during critical combat transitions (start/end encounter, turn changes, condition clears, and dead dismissals). DMs can access the new gold-accented "Recover" timeline panel to roll back HP, spell slots, initiative, and status conditions to any of the 20 most recent checkpoints instantly.
- **📖 Arcane Codex Update**: Appended dedicated chapters to the internal documentation guidebook detailing the Modifier Trace Overlay and the Combat Recovery Snapshots engine.

## [1.13.0] - 2026-05-17

### Added
- **👁️ Combat State Inspector (Phase 13.0)**: DMs now have access to a real-time, transparent breakdown of a character's state. A new "Eye" icon on the Character Card opens a glassmorphism modal revealing the exact mathematical breakdown of Armor Class (base, dexterity with armor caps, shield), Ability Scores (base + equipment bonuses), and currently Active Conditions.
- **🔄 Smart Encounter Recovery**: Total persistence for encounter flow. The active combat round and turn index are now continuously synced to the SQLite `campaign_state` table. If the server restarts or a client reconnects, the game context instantly resynchronizes, ensuring the initiative sequence automatically resumes exactly where it left off.

## [1.12.0] - 2026-05-15

### Added
- **👀 Effect Preview & Consent Log**: DMs can now preview the exact outcome of AoE and party effects (damage, healing, conditions) before they hit the database. Players receive a sticky toast to securely **[Accept]** or **[Reject]** the incoming effect in real-time, preventing silent data mutations.
- **📦 DM Prep Pack Import & Encounter Staging**: Added support for bundling encounters with maps, notes, and specific automation presets into a single JSON "Prep Pack." Pasting a Prep Pack into the Encounter Builder now natively unpacks and sandboxes the encounter, keeping global automation presets clean.

## [1.11.0] - 2026-03-23

### Added
- **🎲 Clickable Stat Rolls (Phase 13.0)**: All Ability Scores, Saving Throws, Skills, and Initiative are now interactive. Clicking any stat triggers a `1d20 + modifier` roll, broadcasts via `dice_roll` socket event, and shows a Sonner toast with the result. Implemented via new reusable `<RollableStat />` component (`variant="card"` and `variant="row"`).
- **⚔️ Clickable Weapon Attacks**: New `<WeaponRow />` component with two independent click zones — **To Hit** (1d20 + attack bonus) and **Damage** (damage dice + modifier). Shift+Click on the Damage zone rolls critical damage (2× dice count). New `<ActionsPanel />` wraps weapon rows with column headers and example data fallback. Extended `dice_roll` socket payload with `rollType`, `source`, and `damageType` fields.
- **🩹 Condition Badges in Header**: Active conditions relocated from a standalone card to the character sheet header. Each condition renders as a compact severity-colored pill badge (deadly=red, dangerous=orange, debilitating=amber, utility=slate). Hovering shows a Tooltip with actual 5e rules text for that condition. A `+` button opens a Popover grid of all 15 conditions as one-click toggles. Implemented in new `<ConditionBadges />` component using Radix `Tooltip` and `Popover`.
- **🗂️ Character Sheet Grid Layout**: Refactored from a single vertical column to a two-column CSS Grid (`grid-cols-[280px_1fr]`). Left column (stat block: Ability Scores, Saves, Skills) is sticky. Right column (active play: Dice Roller, Actions, Inventory) scrolls freely. Full-width header card contains HP, stat pills (AC/PROF/SPD/INIT), and the new conditions row.
- **📐 New Types**: `WeaponAttack` and `DamageType` interfaces added to `character.ts`. `Character.attacks?: WeaponAttack[]` added (not yet populated by DDB importer — falls back to example data).

### Fixed
- **🔡 Condition Case Mismatch**: `rulesEngine.js` stores conditions as lowercase; `DND_CONDITIONS` uses Title Case. Conditions were silently failing to display after being applied. Fixed by capitalizing in `normaliseCharacter()` in `GameContext.tsx`.

## [1.10.0] - 2026-03-22

### Added
- **🗺️ World Map & Voice (Phase 11.0)**: Interactive SVG overworld map with discovery mode, and mesh WebRTC voice chat featuring per-peer volume control.
- **📱 Mobile App Wrapper**: Capacitor integration (`capacitor.config.ts`) allowing dedicated Android/iOS standalone builds.
- **⚡ Party Effect Engine (Phase 12.0)**: Deterministic multi-target processor (`effectEngine.js`), DM Automation Panel for auras and triggers, and real-time Combat Effect Timeline tracking.
- **🪄 Spellcasting Tracker**: Interactive spell slots and concentration management directly built into the Character Sheet.
- **🎲 Animated Dice Tray**: Real-time physics-style dice rolling broadcasted to the entire table.

### Changed
- **🎨 Tailwind Refactor**: Modernized `PartyDashboard` and `CharacterSheetModal` completely, migrating them to Tailwind CSS.
- **🔄 DDB Re-Sync Engine**: Hardened sync logic that safely preserves local homebrew modifications while pulling external level-up data.

### Fixed
- **🐳 Docker Binary Compatibility**: Resolved `better-sqlite3` crashes in the Alpine environment by enforcing the build-from-source flag in the Dockerfile.

## [1.9.0] - 2026-03-18

### Added
- **🗣️ Prompt Engineering Upgrade**: Rewrote all LLM system prompts from basic stubs into detailed, structured schema guidelines for significantly higher quality generation (especially for Homebrew Stats, Loot, and Session Recaps).

### Changed
- **🧠 AI Core Refactor (Ollama)**: Completely overhauled the LLM integration layer (`ollama.js`). Unified all fetch requests through a shared `ollamaRequest()` helper featuring configurable retry logic, `AbortController` timeouts (preventing infinite hangs), and a multi-strategy JSON extraction parser (`cleanLlmJson()`).

### Fixed
- **🛡️ Character Validation Hardening**: The AI validation engine (`validator.js`) now auto-corrects common LLM hallucinations (e.g., mapping \`character_name\` → \`name\`, \`race\` → \`species\`), strictly enforces AC ranges (1–30), flags duplicate skills, and warns on empty inventories.
- **⛈️ Weather Engine Stability**: Migrated the world weather generation endpoint in `world.js` to a dedicated JSON-formatted LLM function, eliminating unstable regex-based parsing that frequently crashed the endpoint.

## [1.8.1] - 2026-03-09

### Fixed
- **🗑️ Character Deletion Bug**: Resolved an issue where characters imported from D&D Beyond could not be deleted from the party or database due to their remote DDB `id` overwriting the local SQLite `id` in the API payload.
- **📦 Docker Build Pipeline**: Fixed an NPM peer dependency conflict (`react@19` vs `next-themes`) that was failing the `docker-compose` build by applying the `--legacy-peer-deps` flag to the Dockerfile.

## [1.8.0] - 2026-03-03

### Added
- **✨ LLM Auto-Resolution**: Actions with "✨ Auto-Resolve with AI" enabled will now be parsed by the LLM and automatically adjust the target's HP, AC, Initiative, or Speed in real-time.
- **🎯 Dynamic Target Selection**: Added a dedicated `TargetSelectionModal` to accurately capture intended targets before emitting action logs.
- **Global Dice Roller FAB**: Replaced the static right-pane dice tray with a floating D20 action button. The new glassmorphic popover menu allows users to build and roll complex multi-dice pools (e.g., `2d20 + 1d6 + 4`) and broadcasts the total seamlessly to the table's Action Log.
- **📱 Mobile-First Party Tracker**: The `PartySidebar` has been redesigned to collapse into a highly ergonomic, horizontally scrolling carousel on mobile devices, ensuring it doesn't consume valuable screen real estate.

### Changed
- **🎨 Dark Fantasy UX Overhaul**: Applied a Google Stitch-inspired redesign focusing on deep navy backgrounds, glassmorphism, and gold/amber accents.
- **📊 Priority Stat Banners**: The `CharacterSheetView` now features a massive, gradient-backed Hit Point indicator, with prominently stylized Armor Class and Initiative blocks for immediate readability in the heat of battle.
- **⚡ Combat Cards**: `CombatActions` tap targets were significantly enlarged for touch screens, transitioning to a premium dark gradient with neon-amber hover states to instantly highlight available actions.

## [1.7.1] - 2026-03-02

### Added
- **🛡️ Character Deduplication**: Introduced a persistent `ddb_id` unique constraint in the database. The app now prevents duplicate character creations when importing from D&D Beyond by mapping to existing records.
- **🔒 Import Concurrency Lock**: Added a server-side "active import" lock to prevent race conditions when multiple import requests are sent for the same character simultaneously.

### Fixed
- **🔄 Session State Initialization**: Resolved a critical bug where D&D Beyond URL imports and manual character creations failed to initialize a valid session state. Characters now correctly start with full HP, empty condition lists, and prepared spell slots in the database.
- **🛠️ Database Schema Hardening**: Added the missing `ddb_id` column to the `characters` table for robust external reference tracking.

## [1.7.0] - 2026-03-02

### Added
- **🎞️ Living Environments (Animated Maps)**: Full support for `.mp4` and `.webm` battlemaps. The VTT now renders high-performance looping video backgrounds with tokens and grids layered accurately on top.
- **🏰 Multi-Level Floor Support**: DMs can now stack vertical floors (e.g. Basement, Ground, Attic) within a single Map entry. A new "Level Switcher" overlay allows for instant party-wide teleportation between floors.
- **📜 The NPC Archive**: A persistent, searchable directory for non-combat characters. Includes support for Public descriptions (for players) and Master's Secrets (DM-only notes and motives).
- **💰 AI Loot Forger**: Integrated an Ollama-powered item generator. DMs can provide context (e.g. "Goblin King's Chest") and generate unique items with mechanical stats (AC, Damage, Stat Bonuses) and storied flavor text.
- **🎁 One-Click Distribution**: New logic to push AI-generated loot directly into player inventories or archive it in the Homebrew Library.

### Changed
- **⚔️ Default Combat View**: The "Shadow Realm" Stitch-inspired combat cards are now the default view when opening the Character Sheet, prioritizing action speed.
- **🏗️ Map Rendering Stack**: Migrated from CSS background images to a Z-indexed layered stack (Video/Img -> Grid -> Tokens) for better performance and precision.

### Fixed
- **📐 Token Snapping Precision**: Rewrote token coordinate math using `getBoundingClientRect()` to fix dragging offsets caused by browser window resizing and UI overlays.
- **⚡ Map Backend Stability**: Hardened the Base64 stripping logic to support multiple video MIME types and extensions.

## [1.6.0] - 2026-03-02

### Added
- **📱 Mobile-Optimized Combat UI**: Premium Stitch-inspired "Action Cards" (`CombatActions.jsx`) that automatically parse character inventory and features for attacks and damage properties.
- **🧭 Bottom Tab Navigation**: Ergonomic, thumb-friendly mobile bottom bar replacing the legacy hamburger menu, offering instant access to Party, Map, Quests, Initiative, and Session Logs.
- **🎲 Persistent Dice FAB**: A global "Big Red Button" (Floating Action Button) for instant mobile dice rolling from any app view without obscuring the combat viewport.

### Changed
- **🖥️ Three-Pane Dashboard Refactor**: Fundamentally restructured the desktop/tablet interface into a dense, non-scrolling grid (`grid-cols-[250px_1fr_300px]`).
- **🗂️ Center Pane Character Sheet**: Replaced modal overlays with a persistent, independent-scrolling character view featuring floating stat boxes and a split 2-column layout for saves and skills.
- **📌 Fixed Right Pane**: Moved the Dice Roller and Session Log to a persistent right-hand column so players can roll naturally without hiding their character sheet.
- **📊 Left Pane Party Tracker**: Interactive roster mapping the party state into clickable mini-cards for quick status checks and character switching.
- **🔇 Auto-Play Audio Strategy**: Removed the intrusive bouncing "Enable Audio" UI button in favor of seamless background audio integration that unlocks organically upon the player's first web interaction.

### Fixed
- **🛡️ AC Calculation Resiliency**: The backend rules engine now intelligently overrides unarmored AC conflicts, mathematically validating `10 + DexMod` when LLM imports hallucinate unarmored configurations or missing base armor values.
- **📐 Floating UI Compatibility**: Recalculated dynamic CSS positioning margins for overlapping z-index elements (DM Whisper Toast, Rules Assistant) to ensure they stack perfectly above the new mobile bottom tab bar without visual occlusion.

... rest of history unchanged ...
