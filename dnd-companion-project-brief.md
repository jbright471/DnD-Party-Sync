# DnD Party Sync — Project Brief
> A personal self-hosted companion app to D&D Beyond for real-time party state management

---

## Project Overview

Build a self-hosted web app that acts as a real-time party sync layer alongside D&D Beyond. 
The goal is to eliminate manual stat adjustments during sessions — when one party member 
does something to another (healing, status effects, inspiration, equipment changes), the 
target's stats update automatically for everyone at the table.

---

## Core Concept: The Asymmetrical Experience

The app is split into two distinct experiences:
1.  **The Adventurer's View (Mobile-First)**: A streamlined, immersive sheet for tracking personal stats, inventory, and spells. Now includes a high-fidelity animated dice tray.
2.  **The DM Command Center (Desktop-Optimized)**: A "God-Eye" dashboard for orchestrating combat, overriding player stats, spawning monsters from a library, and generating AI lore.

---

## Tech Stack

### Frontend
- **React** (Vite) + **Tailwind CSS** (v4)
- **Socket.io client** for zero-latency updates.

### Backend
- **Node.js** with **Express**
- **SQLite** via better-sqlite3 for persistent state.

### LLM Layer
- **Ollama** (mistral-small:24b)
- Used for PDF extraction, item parsing, creative lore generation, and real-time rules assistance. Features robust multi-strategy JSON extraction, request timeouts, and auto-correcting validation to safely bridge raw LLM outputs into strictly-typed game mechanics.

---

## Completed Architecture (Phase 12.0+)

### 🎮 DM Orchestrator
- **Master Overrides:** One-click HP and condition management for all players.
- **AI Lore Master:** Dedicated creative console with session history and creative DM presets.
- **Combat Commander:** Encounter library to save/load monster groups. Supports "Fog of War" (hiding entities) and "HP Ghosting" (hiding exact health from players).

### 🎲 Dice & Rules
- **Animated Tray:** Real-time synchronized dice rolls with tumbling animations.
- **Smart Rules:** Automated AC, Modifiers, and Concentration DCs. Recalculates state instantly when equipment is toggled.

### 🔄 Hybrid Sync Logic
- Multi-strategy importer (DDB API + Scraping + PDF).
- "Local-First" merging: Re-syncing from DDB preserves local homebrew gear and buffs.

---

## Next Goals: Phase 7.0

- **Map Viewer:** Shared battlemaps with token positioning.
- **Dynamic Vision:** DM-controlled Fog of War for maps.
- **Advanced Buffing:** UI to apply multi-target buffs (Bless, Haste).
