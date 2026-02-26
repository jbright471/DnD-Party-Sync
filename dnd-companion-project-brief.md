# DnD Party Sync — Project Brief
> A personal self-hosted companion app to D&D Beyond for real-time party state management

---

## Project Overview

Build a self-hosted web app that acts as a real-time party sync layer alongside D&D Beyond. 
The goal is to eliminate manual stat adjustments during sessions — when one party member 
does something to another (healing, status effects, inspiration, equipment changes), the 
target's stats update automatically for everyone at the table.

This is a personal use app, not a production release. Prioritize simplicity, reliability, 
and ease of self-hosting over scale.

---

## Core Concept

A **Party State Engine** — a live shared state of the party that all players and the DM 
can see and interact with in real time from their own devices (phone or laptop browser).

---

## Tech Stack

### Frontend
- **React** (with Vite for fast dev setup)
- **Tailwind CSS** for styling
- **Socket.io client** for real-time updates
- Dark fantasy theme — dark backgrounds, parchment/gold accents

### Backend
- **Node.js** with **Express**
- **Socket.io** for WebSocket real-time sync (chosen over SSE because the app is bidirectional — players send actions AND receive state updates, and the DM approval queue adds further two-way communication that Socket.io handles cleanly in one system)
- **SQLite** via better-sqlite3 (simple, file-based, easy to back up)

### LLM Layer
- **Ollama** running locally (model: llama3 or mistral)
- Accessed via Ollama's REST API (http://localhost:11434)
- Used to resolve spell/item mechanical effects into structured JSON

### Infrastructure
- **Docker Compose** to run everything together
- Services: frontend, backend, ollama
- Single `docker-compose up` should start the whole app

---

## Phase 1 Features (Build First)

### 1. Party Dashboard
- Shows all party members in a grid/list
- Each member card displays:
  - Name, Class, Level
  - Current HP / Max HP (with visual HP bar)
  - AC
  - Active conditions/status effects (e.g. Blessed, Poisoned, Concentrating)
  - Inspiration token (yes/no)
  - Spell slots remaining (by level)
- All data updates live via WebSockets for all connected players

### 2. Action Logger
- Simple input panel where any player or DM can log an action
- Example actions:
  - "Member A casts Cure Wounds on Member B — heals 10 HP"
  - "Member B is now Poisoned"
  - "DM gives Member C Inspiration"
- The app parses the action (via LLM or rule engine) and auto-applies the effect
- A scrollable action log shows the history of the session

### 3. Status Effect Tracker
- Apply conditions from the standard DnD 5e condition list (Blinded, Charmed, Frightened, Poisoned, etc.)
- Each condition shows its mechanical effect as a tooltip
- Conditions can have optional duration (in rounds) that count down automatically
- Concentration spells tracked separately — auto-flag if caster takes damage

### 4. Inspiration Passing
- DM can award Inspiration to any member with one click
- Member can use/spend their Inspiration token
- Updates live across all players

### 5. D&D Beyond Character Importer
- "Import from D&D Beyond" button that accepts a character sheet URL
- Fetches character JSON from the unofficial community API and seeds the SQLite database
- Auto-populates: name, class, level, max HP, AC, spell slots, and equipment
- Manual entry fallback form available in case the importer breaks (the unofficial API can change without warning)
- Keep importer logic isolated in its own module so it's easy to update if D&D Beyond changes their structure

---

## Phase 2 Features (Build After Phase 1 is Stable)

### 5. Equipment Manager
- Each character has an equipment list
- Toggle equip/unequip on any item
- On equip: app auto-calculates and applies stat changes (AC, attack bonus, ability score changes, resistances)
- Item data stored in DB — LLM can be queried to resolve what a custom/homebrew item does
- Attunement slot tracking (max 3 attuned items)

### 6. DM Checkpoint Queue (Optional Mode)
- DM has a toggle to enable "Approval Mode" — off by default for casual sessions
- When enabled, player-submitted actions don't apply instantly — they appear in a DM queue with a checkmark or X
- DM approves or rejects each action before it propagates to the party state
- Useful for boss fights or moments where the DM wants tighter control
- When disabled, actions apply instantly as normal

### 7. LLM Rules Assistant
- Chat panel in the app where players/DM can ask rules questions
- Context-aware: knows the current party state when answering
- Examples:
  - "What does Bless do right now for our party?"
  - "Member A is concentrating on Web — what happens if they take 15 damage?"
  - "Does the Cloak of Protection stack with my Shield spell?"
- Powered by local Ollama LLM

### 8. LLM Action Resolver
- Instead of hardcoding every spell/item interaction, pass the description to Ollama
- Ask Ollama to return a structured JSON object describing what stats change:
```json
{
  "targets": ["memberB"],
  "effects": [
    { "stat": "hp", "change": 10 },
    { "stat": "conditions", "add": ["Blessed"], "duration_rounds": 10 }
  ]
}
```
- Backend validates and applies the JSON to party state
- Fallback to manual override if LLM result seems wrong
- UI must show a distinct "Rolling the bones..." loading state while waiting for Ollama to return — prevents double-submissions and gives players clear feedback

---

## Phase 3 Features (Future)

- Initiative tracker with turn order management
- Encounter builder for DM
- Session recap generator (LLM summarizes the action log at end of session)
- Shared party notes / quest log

---

## Data Models

### Character
```
id, name, class, level, max_hp, current_hp, ac, 
spell_slots (JSON), conditions (JSON array), 
inspiration (boolean), concentration_spell (string|null),
equipment (JSON array)
```

### Session
```
id, campaign_name, date, party (array of character ids), active (boolean)
```

### ActionLog
```
id, session_id, timestamp, actor, action_description, effects_applied (JSON)
```

### Item
```
id, name, type, description, stat_effects (JSON), requires_attunement (boolean)
```

---

## Self-Hosting Setup

The app should run fully with:
```bash
git clone <repo>
cd dnd-party-sync
docker-compose up
```

Access at `http://localhost:3000` (or local network IP for friends to join on same WiFi)

Docker Compose services:
- `frontend` — React app served via nginx on port 3000
- `backend` — Node/Express API + Socket.io on port 3001
- `ollama` — Ollama LLM server on port 11434
- Shared volume for SQLite database file and easy backup

---

## Design Direction

- Dark mode first
- Color palette: deep navy/black backgrounds, gold/amber accents, red for damage, green for healing
- Mobile-friendly — players will use this on their phones at the table
- Clean and fast — no loading spinners during sessions, everything feels instant

---

## What to Build First

Start with just the **Party Dashboard + Action Logger** with hardcoded/manual stat changes 
(no LLM yet). Get the real-time sync working perfectly first. Once players can see each 
other's HP update live, the core loop is proven and everything else builds on top of that.

---

## Notes

- This is personal use only, no auth system needed for now (or simple PIN access per campaign)
- Prioritize a working prototype over perfect code
- SQLite is fine — this will never have more than ~6 concurrent users
- Keep it fun — this is a passion project!
