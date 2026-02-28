# DnD Party Sync

A containerized, real-time companion application for managing D&D campaigns, combat encounters, and character sheets. Built around a dark fantasy aesthetic and specifically designed with a skill-first architectural approach to synchronize DMs and Players seamlessly.

> *Scribe the chronicles, roll the bones, and sync the party.*

## Architecture

**Frontend:** React (Vite) + Vanilla CSS + Socket.io-client
**Backend:** Node.js + Express + Socket.io
**Logic:** 5e Rules Engine (`rulesEngine.js`) for automated math & validation
**Database:** SQLite (`better-sqlite3`) with persistent Session States
**Deployment:** Docker + Portainer + Cloudflare Tunnels
**AI Integration:** Local Ollama API (Gemma/Llama) for narrative recaps and action resolution

## Features

- **Automated 5e Rules Engine:** Real-time calculation of HP, AC, resistances, and concentration DCs.
- **Advanced Party Dashboard:** Geometric UI with animated HP bars, color-shifting status, and spell slot tracking.
- **PDF-to-Layout Importer:** High-fidelity character extraction using `pdftotext -layout` and structured LLM parsing.
- **Dynamic Initiative Tracker:** Combat ordering with integrated condition tokens and concentration indicators.
- **Concentration Alert System:** Automatic detection and modal prompts for concentration checks on damage.
- **Session Recaps:** Narrative summaries of your session's highlights using local AI.
- **Real-Time Data Sync:** Zero-latency updates for the entire party via Socket.io.

## Setup & Deployment

1. Clone the repository.
2. Initialize `docker-compose up -d`.
3. The Vite frontend runs on port `5173` and the Express backend runs on `3001` (accessible via proxy `3002` externally).
4. For AI integrations, ensure the local Ollama instance URL is correctly mapped in your environment files.

*Refer to the /server and /client directories for specific `npm` commands during development.*
