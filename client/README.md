# Arcane Ally Client

React/Vite frontend for Arcane Ally, the player and DM-facing tabletop companion UI.

## Stack

- React 19 + TypeScript
- Vite 7
- Tailwind CSS v4
- shadcn/ui + Radix UI primitives
- Socket.io client for real-time party state
- TanStack Query for server-backed data flows

## Common Commands

```bash
npm install
npm run dev
npm run lint
npm run build
```

The Vite dev server runs on `http://localhost:5173` by default. It expects the backend API and Socket.io gateway to be available on the server port, normally `3001`.

## App Entry Points

- `src/App.tsx` - route layout, socket toasts, pending save/secret roll listeners
- `src/context/GameContext.tsx` - shared party state normalization and resource permissions
- `src/pages/CharacterSheet.tsx` - primary character sheet experience
- `src/pages/DmDashboard.tsx` - DM command center
- `src/pages/AppGuidebook.tsx` - in-app documentation hub
- `src/components/DiceRoller.tsx` - global/embedded dice tray with visibility controls
- `src/components/RollableStat.tsx` - clickable ability, save, skill, and initiative rolls
- `src/components/DMRollFeed.tsx` - DM roll stream with non-public visibility grouping
- `src/components/DmAutomationPanel.tsx` - DM automation tools, including save requests

## Roll Visibility

The client supports four roll modes:

| Mode | Who sees the full result? | Player feedback |
|---|---|---|
| Public | Everyone | Full result |
| Private | DM and rolling player | Full result |
| Secret | DM only | Masked "Fate sealed" acknowledgement |
| Super-secret | DM only | No acknowledgement |

Secret and super-secret rolls use the `server_dice_roll` socket event so the result is generated on the backend and never exposed in the browser before routing.

## Mobile Builds

Capacitor helpers are available for future mobile packaging:

```bash
npm run build:mobile
npm run cap:sync
npm run cap:android
npm run cap:ios
```

## Validation

Before publishing frontend changes, run:

```bash
npm run lint
npm run build
npm audit --audit-level=high
```
