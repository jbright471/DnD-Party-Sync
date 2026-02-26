# DnD Party Sync

A containerized, real-time companion application for managing D&D campaigns, combat encounters, and character sheets. Built around a dark fantasy aesthetic and specifically designed with a skill-first architectural approach to synchronize DMs and Players seamlessly.

> *Scribe the chronicles, roll the bones, and sync the party.*

## Architecture

**Frontend:** React (Vite) + Tailwind CSS + Socket.io-client
**Backend:** Node.js + Express + Socket.io
**Database:** SQLite (`better-sqlite3`)
**Deployment:** Docker + Portainer + Cloudflare Tunnels
**AI Integration:** Local Ollama API (Llama3 / Mistral) via backend API

## Features

- **Party Dashboard:** Real-time synchronization of character HP, AC, Spells, and Conditions.
- **Deep Integrations (D&D Beyond):** Robust, multi-strategy scraping and API parsing to import full character datasets, auto-calculating ability score modifiers based on 5E rules.
- **Initiative Tracker:** Live combat ordering with DM controls to advance turns.
- **Session Recaps:** Local AI-generated narrative summaries based on logged session actions.
- **Real-Time Data Sync:** Socket.io ensures no player has to refresh their browser during a session.

## Setup & Deployment

1. Clone the repository.
2. Initialize `docker-compose up -d`.
3. The Vite frontend runs on port `5173` and the Express backend runs on `3001` (accessible via proxy `3002` externally).
4. For AI integrations, ensure the local Ollama instance URL is correctly mapped in your environment files.

*Refer to the /server and /client directories for specific `npm` commands during development.*
