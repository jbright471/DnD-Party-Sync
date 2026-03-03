# TODO

A living document for the *DnD Party Sync* project, outlining upcoming features, bug fixes, and architectural optimizations.

## 🔜 Current Sprint: Advanced Integrations (Phase 11.0)

- [ ] **World Map (Global Overworld)**: A high-level map linking multiple battlemaps with fast-travel markers.
- [ ] **Voice Integration**: Proximity-based chat using WebRTC.
- [ ] **Mobile App Wrapper**: Capacitor/React Native wrapper for a true native feeling on mobile devices.

## ✅ Completed

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
