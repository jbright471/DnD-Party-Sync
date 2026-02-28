# TODO

A living document for the *DnD Party Sync* project, outlining upcoming features, bug fixes, and architectural optimizations.

## 🔜 Current Sprint (Phase 5.0)

- [ ] **Homebrew Entity Integration**: Connect custom-made Items and Spells directly to Player Character Cards.
- [ ] Implement robust mobile-first styling for the `CharacterSheetModal.jsx`.
- [ ] Transition from inline styling in the `CharacterSheetModal.jsx` component over to comprehensive Tailwind CSS classes.

## 🔮 Future Phases

- [ ] **Phase 6.0: Map Viewer** 
  - Shared battlemaps via websockets with basic token positioning.
- [ ] **Phase 6.5: Fog of War**
  - Implement dynamic vision tracking from the DM's perspective down to the Party.

## ✅ Completed

- [x] **Phase 4.0: Advanced Rules & UI**: Integrated 5e rules engine and premium dashboard components.
- [x] **HTML Entity Decoded**: Fixed double-escaping bug in character names.
- [x] **Layout-Aware PDF Import**: Upgraded to `pdftotext` for reliable character scraping.
- [x] Deep-test the SQLite websocket caching for heavy session loads.
- [x] Automate daily DB backups via container `cron` instead of manual API triggering.
- [x] Refine the Dark Fantasy aesthetics across the `PartyDashboard`.
