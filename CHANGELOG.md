# Changelog

All notable changes to the **DnD Party Sync** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to Semantic Versioning.

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
