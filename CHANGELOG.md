# Changelog

All notable changes to the **DnD Party Sync** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to Semantic Versioning.

## [1.2.0] - 2026-02-28

### Added
- **5e Rules Engine**: Core logic for damage resolution, healing, AC calculation, and concentration DCs.
- **Advanced UI Suite**: Premium geometric `CharacterCard`, `InitiativeTracker`, and `ConcentrationAlert` components.
- **Layout-Preserving PDF Importer**: Switched to `pdftotext -layout` for accurate D&D Beyond PDF extraction.
- **Session State Persistence**: Volatile character resources (temp HP, slots) now persist in a dedicated database table.
- **Real-time Concentration Tracking**: Automated checks triggered by damage events.

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
