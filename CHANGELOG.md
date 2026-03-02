# Changelog

All notable changes to the **DnD Party Sync** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to Semantic Versioning.

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

## [1.5.0] - 2026-03-01

### Added
- **🗺️ Virtual Tabletop (VTT)**: High-performance shared battlemap system with grid-snapping, draggable tokens, and persistent positioning.
- **🧭 Map Cartographer**: Dedicated UI for the DM to upload maps (Base64) and manage a library of active battlefields.
- **🎵 Synchronized Soundboard**: Real-time atmospheric audio loops (Rain, Dungeon, Tavern) that play for all party members simultaneously.
- **✨ Dynamic Multi-Buff System**: DM Enchantment Console to apply standardized 5e buffs (Bless, Haste, Shield of Faith) to multiple targets with automated stat recalculation.
- **🎬 Cinematic Session Finale**: "End Session" now triggers a party-wide modal showing a vivid, AI-generated narrative recap of the night's highlights.
- **🎲 Interactive Dice Intelligence**: Click-to-roll for all Stats and Skills directly from the Character Sheet, with automated modifier calculation and DDB-style visual indicators.
- **ℹ️ Condition Intelligence**: Interactive hover tooltips on Character Sheets explaining the mechanical impact of all active conditions.

### Changed
- **🖥️ DM Dashboard 2.0**: Reorganized three-pane layout for optimized desktop control of combat, lore, and atmosphere.
- **🏹 Advanced Combat Tracking**: Enhanced "HP Ghosting" and Fog-of-War for both Initiative and Map views.

### Fixed
- **🧠 Rules Precision**: Refined AC and Modifier calculations to handle complex overlapping buffs like Mage Armor and Haste.
- **🔌 Socket State Stability**: Improved synchronization logic for token movement and shared audio playback.

## [1.4.0] - 2026-03-01

### Added
- **🎮 DM Command Center**: Introduced a persistent, PIN-secured (`1234`) dashboard for the DM with a "God-Eye" view of all player stats.
- **🎲 Animated Dice Tray**: New physics-inspired rolling system for both players and DM, supporting all standard D&D dice and custom modifiers.
- **👹 Encounter Library**: Ability to pre-build monster groups and start multi-entity combats with a single click.
- **🌫️ Fog of War (Combat)**: Toggle visibility for any combatant in the initiative tracker to hide/reveal ambushes to players.
- **👻 HP Ghosting**: Players now see descriptive health statuses (Bloodied, Critical) for monsters while the DM sees exact numeric values.
- **⚡ Master Overrides**: DM-only quick-action buttons for instant HP adjustment and condition application/removal on player cards.
- **🔮 Creative AI Lore Master**: Enhanced Lore Console with historical session tracking and DM-focused creative system prompts.

### Fixed
- **🚀 SSD Performance Optimization**: Successfully relocated the project to local SSD, eliminating network-drive latency for Docker builds and NPM operations.
- **🛠️ Socket Reliability**: Improved event handling for real-time dice rolls and initiative state synchronization.
- **🩺 Character Sheet Stability**: Resolved critical React crashes in the Skills and Inventory tabs by normalizing incoming data as arrays and adding defensive rendering checks.
- **📜 PDF Extraction Depth**: Increased the LLM context buffer for PDF parsing from 18k to 50k characters, ensuring full Spellbook extraction for high-level characters.

## [1.3.0] - 2026-03-01

### Added
- **🔮 LLM Item Parser**: Integrated local Ollama (`gemma3:27b`) to extract mechanical modifiers (AC, Stats, Resistances) from plain-text item descriptions.
- **📜 Homebrew Compendium**: New "Store/Compendium" view for managing custom entities and assigning them to characters.
- **🛡️ Equipment Management**: Direct Equip/Unequip toggles in Character Sheets with real-time stat recalculation.
- **🪄 Spellcasting Layer**: Interactive spell slot tracking and active concentration management within character sheets.
- **🔄 Smart DDB Re-Sync**: Added one-click sync button to refresh character data from D&D Beyond while preserving local homebrew items.
- **🩺 Diagnostic Endpoint**: Added `/api/characters/import/diag` to monitor Ollama connectivity and system health.

### Changed
- **💅 Tailwind Refactor**: Converted `PartyDashboard` and `CharacterSheetModal` to full Tailwind CSS for improved mobile responsiveness and "Dark Fantasy" aesthetics.
- **📊 Improved Data Extraction**: Enhanced D&D Beyond importer to pull full Skills, Spells, Features, and Backstory data.
- **⚙️ Rules Engine Upgrade**: Recalculated AC and Ability Scores to include modifiers from both standard gear and homebrew items.

### Fixed
- **🚀 Importer Stability**: Resolved `NOT NULL` constraint crashes by aligning database column names with API response fields.
- **🐳 Docker Compatibility**: Fixed `better-sqlite3` binary crashes in Alpine containers by forcing a build-from-source and adding `gcompat`.
- **🧩 AI Parsing Precision**: Hardened LLM prompts to ensure strict camelCase JSON output and reduced character-count truncation.
- **🛠️ UI "Ghost" Tabs**: Fixed issue where Skills, Inventory, and Spells sections were appearing empty due to missing data mappings.

## [1.2.0] - 2026-02-28

### Added
- **5e Rules Engine**: Core logic for damage resolution, healing, AC calculation, and concentration DCs.
- **Advanced UI Suite**: Premium geometric `CharacterCard`, `InitiativeTracker`, and `ConcentrationAlert` components.
- **Layout-Preserving PDF Importer**: Switched to `pdftotext -layout` for accurate D&D Beyond PDF extraction.
- **Session State Persistence**: Volatile character resources (temp HP, slots) now persist in a dedicated database table.
- **Real-time Concentration Tracking**: Automated checks triggered by damage events.
- **AI Infrastructure Optimization**: Pointed the application to the `ollama-p40` instance (port 11436) to utilize dedicated Tesla P40 VRAM for background tasks.

### Fixed
- **HTML Double-Escaping**: Resolved bug where character names containing "&" were rendered as `&amp;` in the session log.
- **Importer Syntax Stability**: Fixed critical parsing errors in the `importer.js` route.
- **Concentration UI Crashes**: Patched `useRef` missing imports and state-update side effects in `ConcentrationAlert.jsx`.

## [1.1.0] - 2026-02-27

### Added
- Phase 3.5: Advanced Character Sheet Importer.
- Integrated `better-sqlite3` database architecture with resilient JSON column storage.
- Multi-strategy D&D Beyond API importer (Internal API + Public Scraping fallback).
- Tabbed `CharacterSheetModal.jsx` for deep viewing of Stats, Equipment, Traits, and Backstory.
- `roles.md` documentation to specify Antigravity agent personas (_@frontend-weaver_, _@db-architect_, _@lore-keeper_, etc).

### Changed
- Conformed frontend websocket connection to utilize Vite proxy instead of hardcoded typical hostnames to ensure Portainer compatibility.
- Implemented robust error catching on React components parsing deeply nested stringified JSON characters.
