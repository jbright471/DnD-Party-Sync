# Changelog

All notable changes to the **DnD Party Sync** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to Semantic Versioning.

## [Unreleased]

### Added
- Phase 3.5: Advanced Character Sheet Importer.
- Integrated `better-sqlite3` database architecture with resilient JSON column storage.
- Multi-strategy D&D Beyond API importer (Internal API + Public Scraping fallback).
- Tabbed `CharacterSheetModal.jsx` for deep viewing of Stats, Equipment, Traits, and Backstory.
- `roles.md` documentation to specify Antigravity agent personas (_@frontend-weaver_, _@db-architect_, _@lore-keeper_, etc).

### Changed
- Conformed frontend websocket connection to utilize Vite proxy instead of hardcoded typical hostnames to ensure Portainer compatibility.
- Implemented robust error catching on React components parsing deeply nested stringified JSON characters.
