# TODO

A living document for the *DnD Party Sync* project, outlining upcoming features, bug fixes, and architectural optimizations.

## 🔜 Current Sprint: Map & VTT (Phase 7.0)

- [ ] **Map Viewer**: Shared battlemaps via websockets with basic token positioning.
- [ ] **Fog of War (Maps)**: Implement dynamic vision tracking from the DM's perspective.
- [ ] **Dynamic Buff System**: UI to apply buffs like "Bless" or "Haste" to multiple targets via the Action Log.
- [ ] **Condition Tooltips**: Add mechanical hover-states for conditions in the Character Sheet.

## 🔮 Future Enhancements

- [ ] **Voice Integration**: Proximity-based chat using WebRTC.
- [ ] **Soundboard**: DM-triggered atmospheric music and sound effects synced across the party.

## ✅ Completed

- [x] **Phase 6.0: Combat Commander**: Monster Library, Spawning, and Fog of War (Initiative).
- [x] **Phase 5.5: DM Command Center**: God-Eye View, Master Overrides, and AI Lore Console.
- [x] **Animated Dice Tray**: Integrated real-time physics-style dice rolling for the entire table.
- [x] **Phase 5.0: Homebrew & Smart Gear**: Integrated LLM parsing for item passives and homebrew assignment.
- [x] **Tailwind Refactor**: Successfully transitioned `PartyDashboard` and `CharacterSheetModal` to full Tailwind CSS.
- [x] **Spellcasting Tracker**: Interactive spell slots and concentration management.
- [x] **DDB Re-Sync Engine**: Robust sync logic that preserves local data.
- [x] **Docker Binary Fix**: Resolved `better-sqlite3` crashes in Alpine environment.
