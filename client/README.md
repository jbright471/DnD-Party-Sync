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
npm ci --legacy-peer-deps
npm run dev
npm run lint
npm run build
```

The Vite dev server runs on `http://localhost:5173` by default. Its checked-in proxy targets `http://dnd-party-sync-backend:3001`, the backend service name used on the container network. For host-only development, change both proxy targets in `vite.config.ts` to `http://localhost:3001`.

## App Entry Points

- `src/App.tsx` - route layout, socket toasts, pending save/secret roll listeners
- `src/context/GameContext.tsx` - shared party state normalization and resource permissions
- `src/socket.ts` - contract negotiation, campaign-version tracking, and reconnect delta requests
- `src/types/automation-contracts.ts` - v1 command, effect, provenance, statistic, and state-delta types
- `src/pages/CharacterSheet.tsx` - primary character sheet experience
- `src/pages/DmDashboard.tsx` - DM command center
- `src/pages/AppGuidebook.tsx` - in-app documentation hub
- `src/components/DiceRoller.tsx` - global/embedded dice tray with visibility controls
- `src/components/RollableStat.tsx` - clickable ability, save, skill, and initiative rolls
- `src/components/DMRollFeed.tsx` - DM roll stream with non-public visibility grouping
- `src/components/DmAutomationPanel.tsx` - group effects, save requests, presets, auras, and campaign automation policies
- `src/components/EffectTimeline.tsx` - active and archived encounter history, filtering, pagination, export, and reversal controls

## Roll Visibility

The client supports four roll modes:

| Mode | Who sees the full result? | Player feedback |
|---|---|---|
| Public | Everyone | Full result |
| Private | DM and rolling player | Full result |
| Secret | DM only | Masked "Fate sealed" acknowledgement |
| Super-secret | DM only | No acknowledgement |

Secret and super-secret rolls use the `server_dice_roll` socket event so the result is generated on the backend and never exposed in the browser before routing.

## Automation Policies

DMs configure campaign behavior from **DM Dashboard -> Automation -> Policies**. The panel reads and updates `/api/automation/rules`; changes save immediately.

Policies cover zero-HP unconscious handling, recovery cleanup, concentration behavior, bloodied detection, modifier propagation, ammunition tracking, condition duration ticks, initiative synchronization, turn triggers, auras, curated reactive handlers, and combat-history retention.

Bloodied detection and modifier propagation are enabled by default. Ammunition tracking is disabled until the DM enables it and a manual weapon explicitly names its inventory ammunition. Combat history defaults to unlimited retention.

Automation and DM history requests use `dmFetch()`, which attaches the current `dm_token` as `X-DM-Token`. A new DM login rotates that token and can require other DM tabs to sign in again.

The DM route validates a stored token through `/api/auth/dm/status` before rendering the command center. Missing or expired sessions show the DM PIN form instead of loading protected panels with empty error responses.

## Transactional Commands and Reconnects

State-changing commands retain the same UUID when retried and may include the last observed campaign version plus expected versions for every affected aggregate. The server rejects stale expectations instead of overwriting newer state. UUIDs identify retries; they do not grant permission.

The socket negotiates automation contract v1 when it connects, tracks campaign and aggregate versions from `state_delta`, and requests all deltas after its last known campaign version. A `resyncRequired` response causes the server to send a fresh role-safe snapshot. New integration code should use the shared types in `src/types/automation-contracts.ts` and must not depend on transitional legacy broadcasts.

## Combat History

`EffectTimeline.tsx` shows the active combat session by default. When combat ends, the server archives that encounter and the timeline selector exposes it as a read-only history view. Archived events remain searchable and exportable; clear and reversal actions stay scoped to the current timeline. Retention policies prune archived encounters only.

Timeline requests accept `sessionId`, `beforeId`, `limit`, `targetId`, and `eventType` query parameters. The timeline browser loads 200 events per page and prepends earlier pages on request; Markdown export retrieves the complete selected history in batches of 500.

## Mobile Builds

Capacitor helpers are available for future mobile packaging:

```bash
npm run build:mobile
npm run cap:sync
npm run cap:android
npm run cap:ios
```

## Browser Permissions

Voice Chat requires `navigator.mediaDevices.getUserMedia`, which browsers expose on HTTPS and `localhost`. On an insecure LAN HTTP origin, the client shows the secure-context requirement and disables **Join Voice**. Other app features remain available.

## Validation

Before publishing frontend changes, run:

```bash
npm run lint
npm run build
npm audit --audit-level=high
```
