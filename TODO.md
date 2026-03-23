# TODO

A living document for the *DnD Party Sync* project, outlining upcoming features, bug fixes, and architectural optimizations.

## 🔜 Current Sprint: Phase 12.1 — Polish & Expansion

- [ ] **Populate `character.attacks` from DDB Importer**: `ActionsPanel` currently falls back to example weapons. Parse weapon attack actions from the DDB JSON payload during import and write to the `attacks` field.
- [ ] **Per-Skill Proficiency in Schema**: `StatChecks` uses base ability modifier only. Extend `Character` type to include proficiency bitmask per skill and populate from DDB import. The proficiency dot on `RollableStat` is ready to accept the `proficient` prop.
- [ ] **Voice Proximity (Auto-Volume)**: Auto-adjust peer volume based on token distance on the active battlemap (builds on Phase 11 voice groundwork).
- [ ] **World Map: Replace Overworld**: Allow the DM to swap the world map image without losing existing markers.
- [ ] **Push Notifications**: Capacitor local notifications for DM whispers and turn alerts when the app is backgrounded.
- [ ] **Saving Throws in Automation**: Allow presets to specify a save (type + DC). Server holds the effect pending; players roll and report pass/fail before the effect commits.
- [ ] **Automation: Spatial Aura Radius**: Auto-resolve targets within N grid squares using battlemap token positions (currently manual target selection).

## ✅ Completed
*(All recent completed features have been migrated to the CHANGELOG)*
