# Arcane Ally — DnD Party Sync (Unified)

A high-performance, containerized companion application for D&D 5e. This project merges the beautiful UI of *Dungeon Automaton* with the robust, local-first backend and rules engine of *DnD Party Sync*.

## 🚀 The Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Radix UI.
- **Backend:** Node.js (Express), Socket.io (Real-time Sync), Better-SQLite3.
- **AI Layer:** Local Ollama integration for PDF parsing, item parsing, loot generation, and lore generation.
- **Deployment:** Docker & Docker Compose (Optimized for Portainer).

## ✨ Key Features
- **Real-time Synchronization:** Every HP change, condition, and dice roll is broadcasted instantly to the entire party.
- **Advanced 5e Rules Engine & Automations:** Automatic AC calculation, alongside a real-time Party Effect Engine that manages auras, group strikes, and conditions on a combat timeline.
- **DM Command Center:** God-Eye View with live HP flash effects (damage/heal), DMRollFeed aggregating all dice rolls and HP changes, animated DM Queue toggle, and real-time party loot pool management.
- **Party Loot Pool:** DM drops items into a shared pool (from homebrew library or custom-created); players claim items directly to their inventory with real-time sync across all clients.
- **Interactive World Map & Voice:** Shared overworld with DM-controlled discovery and built-in WebRTC voice communication.
- **AI-Powered Gear:** Forge homebrew items with AI text extraction (QuickEquipParser), or drop AI-generated loot directly into the party pool.
- **D&D Beyond Integration:** Import characters via PDF or URL and re-sync without losing local homebrew modifications.
- **Cross-Platform:** Available as a web app optimized for desktop, and packaged as a native mobile app via Capacitor.

## 🎲 DM Dashboard Highlights
- **God-Eye View** — live character cards with animated HP bars, real-time damage (red) / heal (green) flash effects per card
- **DMRollFeed** — aggregated live feed of all player dice rolls, HP changes, and loot claims with filter toggles (ATK/DMG/SKILL/SAVE/INIT/HP/LOOT/PRIV)
- **Party Loot Pool** — drop items from the homebrew library or create new ones; players see and claim them in real-time
- **DM Queue Toggle** — custom animated switch with gold glow for approval mode

## 🛠️ Self-Hosting (Portainer / Docker)
The project is built to run entirely on your local hardware with no external cloud dependencies.

1. **Environmental Config:**
   Ensure your `.env` file points to your local Ollama instance:
   ```env
   OLLAMA_URL=http://your-ip:11434
   ```

2. **Launch:**
   ```bash
   docker-compose up --build -d
   ```

## 📂 Project Structure
- `/client` — TypeScript React frontend (pages, components, hooks, types)
- `/server` — Node.js backend, Rules Engine, socket handlers, REST routes
- `/data` — SQLite database persistence
- `/files` — Legacy logic snapshots and integration guides
