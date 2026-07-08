# Interactive Rolls & Roll Visibility

## Overview

Interactive rolls turn Arcane Ally character sheets into live tabletop controls. Players and DMs can roll from ability scores, saving throws, skills, weapons, and the dice tray while the server routes the result to the right audience.

## Current Roll Types

- **Ability checks, saving throws, skills, and initiative** use `RollableStat.tsx`.
- **Freeform dice pools** use `DiceRoller.tsx`.
- **Weapon attacks and damage** use character action components and emit structured roll metadata.
- **DM-requested saves** are issued from `DmAutomationPanel.tsx` and can auto-resolve pending effects.

## Visibility Modes

| Mode | Full result visible to | Intended use |
|---|---|---|
| `public` | Everyone | Normal table rolls |
| `private` | DM and rolling player | Player-visible private checks |
| `secret` | DM only, masked player acknowledgement | Player chooses or DM requests a hidden result |
| `super_secret` | DM only, no player acknowledgement | Fully hidden DM-only resolution |

The client persists the selected roll visibility in `localStorage` under `arcane_roll_visibility`.

## Server-Side Hidden Rolls

Secret and super-secret rolls are generated through `server_dice_roll` rather than client-side dice math. The backend validates the dice shape, rolls the dice, applies advantage/disadvantage when requested, and then routes the event through `server/lib/rollVisibility.js`.

This prevents hidden totals from being visible in browser state or developer tools before the DM receives them.

## Pending Save Resolution

DM-requested saves are stored in `pending_saves` with a `roll_visibility` value. When the matching save roll arrives:

1. The server compares the result against the pending DC.
2. Pass/fail effects are applied through the effect engine.
3. The pending save row is deleted.
4. `save_resolved` is emitted according to the pending visibility mode.

Legacy blind-roll responses also respect the stored pending save visibility.

## Technical Implementation

- **Client components**: `DiceRoller.tsx`, `RollableStat.tsx`, `DmAutomationPanel.tsx`, `DMRollFeed.tsx`
- **Client types**: `client/src/types/effects.ts` (`RollVisibility`)
- **Server routing**: `server/lib/rollVisibility.js`
- **Socket handlers**: `dice_roll`, `server_dice_roll`, `dm_request_save`, `save_resolved`, `secret_roll_ack`
- **Database**: `pending_saves.roll_visibility`
- **Tests**: `server/test/rollVisibility.test.js`

## DM Roll Feed

The DM roll feed groups private, secret, and super-secret rolls as non-public rolls. Secret modes show lock/visibility metadata to the DM while preventing public broadcast.
