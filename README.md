# DnD Party Sync

A containerized, real-time companion application for managing D&D campaigns, combat encounters, and character sheets. Built around a dark fantasy aesthetic and specifically designed with a skill-first architectural approach to synchronize DMs and Players seamlessly.

> *Scribe the chronicles, roll the bones, and sync the party.*

## Architecture

**Frontend:** React (Vite) + Tailwind CSS + Socket.io-client
**Backend:** Node.js + Express + Socket.io
**Logic:** 5e Rules Engine (`rulesEngine.js`) for automated math & gear passives
**Database:** SQLite (`better-sqlite3`) with persistent Session States & Homebrew Inventory
**Deployment:** Docker + Portainer + Cloudflare Tunnels (Optimized for Local SSD)
**AI Integration:** Local Ollama API (`gemma3:27b`) for creative lore, item parsing, and PDF extraction

## Features

- **🎮 DM Command Center:** PIN-secured orchestrator dashboard with God-Eye party views and master stat overrides.
- **🎲 Animated Dice Tray:** Real-time synchronized dice rolling with physics-inspired animations and D&D math.
- **👹 Combat Commander:** Pre-built encounter library and on-the-fly monster spawning with initiative integration.
- **🌫️ Combat Fog of War:** Hide/Reveal combatants and obscure monster HP (Ghosting) for players.
- **🔮 Creative AI Lore Master:** Dedicated creative console for generating evocative room descriptions, NPCs, and loot.
- **🛡️ Equipment Manager:** Equip/Unequip items in real-time with automatic stat recalculation.
- **🪄 Spellcasting Layer:** Interactive spell slot tracking and active concentration management.
- **🔄 Hybrid Sync Engine:** Re-sync with D&D Beyond while preserving local homebrew items and buffs.
- **📊 Advanced Party Dashboard:** Mobile-first Tailwind UI with animated HP bars and status indicators.

## Setup & Deployment

1. Clone the repository.
2. Initialize `docker compose up --build -d`.
3. The Vite frontend runs on port `5173` and the Express backend runs on `3001` (accessible via proxy `3002` externally).
4. For AI integrations, ensure the local Ollama instance URL is correctly mapped in your environment files (defaulting to port `11436` for Tesla P40 optimization).

*Refer to the /server and /client directories for specific `npm` commands during development.*
