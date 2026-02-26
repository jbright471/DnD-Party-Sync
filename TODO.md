# TODO

A living document for the *DnD Party Sync* project, outlining upcoming features, bug fixes, and architectural optimizations.

## 🔜 Current Sprint

- [ ] Implement robust mobile-first styling for the `CharacterSheetModal.jsx`.
- [ ] Refine the Dark Fantasy Tailwind aesthetics across the `PartyDashboard`.
- [ ] Deep-test the SQLite websocket caching for heavy session loads.

## 🔮 Future Phases

- [ ] **Phase 4.0: Map Viewer** 
  - Shared battlemaps via websockets with basic token positioning.
- [ ] **Phase 4.5: Fog of War**
  - Implement dynamic vision tracking from the DM's perspective down to the Party.
- [ ] **Phase 5.0: Homebrew Entity Integration**
  - Connect custom-made Items and Spells directly to Player Character Cards dynamically.

## 🛠️ Backlog / Technical Debt

- [ ] Transition from inline styling in the `CharacterSheetModal.jsx` component over to comprehensive Tailwind CSS classes mapping the `tailwind.config.js` theme values.
- [ ] Automate daily DB backups via container `cron` instead of manual API triggering.
