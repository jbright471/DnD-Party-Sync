# Arcane Ally — DnD Party Sync (Unified)

A high-performance, containerized companion application for D&D 5e. This project merges the beautiful UI of *Dungeon Automaton* with the robust, local-first backend and rules engine of *DnD Party Sync*.

## 🚀 The Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Radix UI.
- **Backend:** Node.js (Express), Socket.io (Real-time Sync), Better-SQLite3.
- **AI Layer:** Local Ollama integration for PDF parsing and item passive extraction.
- **Deployment:** Docker & Docker Compose (Optimized for Portainer).

## ✨ Key Features
- **Real-time Synchronization:** Every HP change, condition, and dice roll is broadcasted instantly to the entire party.
- **Advanced 5e Rules Engine & Automations:** Automatic AC calculation, alongside a real-time Party Effect Engine that manages auras, group strikes, and conditions on a combat timeline.
- **Interactive World Map & Voice:** Shared overworld with DM-controlled discovery and built-in WebRTC voice communication.
- **AI-Powered Gear:** Forge homebrew items and let the AI "extract" mechanics directly from the description.
- **D&D Beyond Integration:** Import characters via PDF or URL and re-sync without losing local homebrew modifications.
- **Cross-Platform:** Available as a web app optimized for desktop, and packaged as a native mobile app via Capacitor.

## 🛠️ Self-Hosting (Portainer / Docker)
The project is built to run entirely on your local hardware with no external cloud dependencies (Supabase has been removed).

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
- `/client`: The TypeScript React frontend.
- `/server`: The Node.js backend & Rules Engine.
- `/data`: SQLite database persistence.
- `/files`: Legacy logic snapshots and integration guides.
