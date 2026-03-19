# TODO

A living document for the *DnD Party Sync* project, outlining upcoming features, bug fixes, and architectural optimizations.

## 🔜 Current Sprint: Phase 12.1 — Polish & Expansion

- [ ] **Voice Proximity (Auto-Volume)**: Auto-adjust peer volume based on token distance on the active battlemap (builds on Phase 11 voice groundwork).
- [ ] **World Map: Replace Overworld**: Allow the DM to swap the world map image without losing existing markers.
- [ ] **Push Notifications**: Capacitor local notifications for DM whispers and turn alerts when the app is backgrounded.
- [ ] **Saving Throws in Automation**: Allow presets to specify a save (type + DC). Server holds the effect pending; players roll and report pass/fail before the effect commits.
- [ ] **Automation: Spatial Aura Radius**: Auto-resolve targets within N grid squares using battlemap token positions (currently manual target selection).

## ✅ Completed

- [x] **Phase 12.2: AI Logic Refactor**: Complete overhaul of the Ollama integration layer (\`ollama.js\`). Extracted shared request/retry/timeout logic. Hardened JSON parsing with multi-strategy fallback. Upgraded all system prompts to enforce strict schemas. Improved character validation to auto-correct common LLM key mistakes.
- [x] **Character Deletion Bug**: Fixed SQLite `id` overwrite issue when parsing character data.
- [x] **Docker Build Dependencies**: Applied `--legacy-peer-deps` to resolve React 19 peer conflicts.
- [x] **Phase 12.0: Party Effect Engine**: `effectEngine.js` — deterministic, transactional multi-target effect processor. Handles characters (rulesIntegration) and monsters (initiative_tracker) with distinct code paths. Every applied effect writes an immutable row to `effect_events`.
- [x] **Phase 12.0: DM Automation Panel**: `DmAutomationPanel.tsx` — three-tab dialog (Group Strike inline builder, Saved Macros with CRUD + Fire, Aura Manager). Turn-trigger and aura presets auto-fire on `next_turn` via server-side hooks.
- [x] **Phase 12.0: Combat Effect Timeline**: `EffectTimeline.tsx` — collapsible panel showing round-grouped, colour-coded event history. Source-tagged (manual / automation / aura). Real-time via `timeline_update` socket. Filter + clear controls.
- [x] **Phase 12.0: Condition & Aura Automation Presets**: Full aura definition with name, trigger phase, radius (noted), target mode, and effect list. Stored in `automation_presets` table, processed by `processAurasForTurn()` each turn.
- [x] **Phase 11.0: World Map (Global Overworld)**: Interactive overworld map with SVG marker overlay, DM-controlled discovery/visibility, fast-travel to battlemaps, and Socket.io live sync.
- [x] **Phase 11.0: Voice Chat (WebRTC)**: Mesh WebRTC voice channel with speaking detection, per-peer volume sliders, mute/deafen, and floating FAB widget.
- [x] **Phase 11.0: Mobile App Wrapper (Capacitor)**: `capacitor.config.ts`, `cap:android`/`cap:ios` build scripts, environment-variable server URL for homelab LAN connections, and Capacitor-optimised Vite build mode.
- [x] **Phase 11.1: Character Deduplication**: Introduced `ddb_id` and import locking to prevent duplicate character creation.
- [x] **Phase 8.3: Living Environments**: Looping video battlemaps (.mp4/.webm) with layered token support.
- [x] **Phase 8.0: Multi-Level Maps**: Support for verticality (Floors/Levels) within a single Map entry.
- [x] **Phase 8.0: NPC Archive**: A non-combat NPC directory for tracking shopkeepers, quest-givers, and secrets.
- [x] **Phase 8.0: AI Loot Forger**: Ollama-powered context-aware loot generation and distribution.
- [x] **Phase 8.2: Mobile-Optimized Combat**: Introduced Stitch-inspired mobile bottom tabs, persistent dice FAB, and animated premium Action Cards for combat.
- [x] **Phase 8.1: Three-Pane Dashboard**: Refactored the core UI into a highly dense, non-scrolling 3-column desktop layout with persistent dice/logs.
- [x] **Phase 7.0: Map & VTT**: Shared battlemaps, grid-snapping, and persistent tokens.
- [x] **Phase 7.1: Interactive Rolls**: Click-to-roll stats/skills with DDB-style UI indicators and advantage logic.
- [x] **Phase 7.5: Atmospheric Systems**: Synchronized Soundboard and Dynamic Multi-Buff console.
- [x] **Phase 7.6: Session Finale**: Automated AI recaps and cinematic session closure UI.
- [x] **Phase 6.0: Combat Commander**: Monster Library, Spawning, and Fog of War (Initiative).
- [x] **Phase 5.5: DM Command Center**: God-Eye View, Master Overrides, and AI Lore Console.
- [x] **Animated Dice Tray**: Integrated real-time physics-style dice rolling for the entire table.
- [x] **Phase 5.0: Homebrew & Smart Gear**: Integrated LLM parsing for item passives.
- [x] **Tailwind Refactor**: Successfully transitioned `PartyDashboard` and `CharacterSheetModal` to Tailwind CSS.
- [x] **Spellcasting Tracker**: Interactive spell slots and concentration management.
- [x] **DDB Re-Sync Engine**: Robust sync logic that preserves local data.
- [x] **Docker Binary Fix**: Resolved `better-sqlite3` crashes in Alpine environment.
