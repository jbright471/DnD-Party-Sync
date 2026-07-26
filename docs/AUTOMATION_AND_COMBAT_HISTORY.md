# Automation Policies & Combat History

## Overview

Arcane Ally keeps table-saving automation under DM control while preserving a clear record of what changed. Campaign policies are server-authoritative and migration-safe, so upgrading does not silently enable destructive resource tracking.

Completed encounters are stored as read-only timeline archives. The live table receives only the active encounter's events, while DMs can search or export older encounters from the Combat Timeline.

## DM Workflow

### Configure Automation

1. Open **DM Dashboard**.
2. Enter the host's DM PIN when prompted.
3. Click **Automation** in the header.
4. Select **Policies**.
5. Change a switch or concentration-check mode.

Changes save immediately and apply to the next matching action. Disabling a policy does not reverse state already applied.

Policy edits and automation-triggered state changes pass through the same transactional command boundary as manual actions. Cross-character effects commit every target, audit record, version update, and reconnect delta together or roll back as a unit.

| Policy | Enabled behavior |
|---|---|
| Apply Unconscious at 0 HP | Adds `unconscious` when damage reduces a character to 0 HP |
| Clear Unconscious After Healing | Removes `unconscious` when healing raises HP above 0 |
| Concentration Cleanup | Drops concentration and linked buffs at 0 HP |
| Concentration Checks | Chooses an automatic server roll or a prompted table-resolved check |
| Condition Duration Ticks | Decrements timed conditions at the start of the affected turn |
| Initiative Sync | Inserts party members into encounters and accepts their initiative rolls |
| Turn Triggers | Runs enabled start-of-turn and end-of-turn presets |
| Aura Processing | Runs enabled aura presets in their configured phase |
| Reactive Item Handlers | Enables curated reactions such as `retributive_healing` |
| Bloodied Detection | Marks living combatants and logs threshold crossings; defaults to 50% of maximum HP |
| Modifier Propagation | Applies temporary buffs and auras to calculated stats, rolls, and damage |
| Ammunition Tracking | Consumes ammunition explicitly linked to a weapon attack; disabled by default |
| Combat History Retention | Keeps all archives, the newest number of encounters, or a configured number of days |

Bloodied detection and modifier propagation are enabled by default. Ammunition tracking is opt-in because existing weapon and inventory names may not be linked yet.

### Link Ammunition to a Weapon

1. Open the character sheet and go to **Actions**.
2. Add or edit a manual weapon.
3. Under **Properties**, select **Ammunition**.
4. Enter **Inventory Ammunition Name** exactly as it appears in the character inventory, such as `Arrows` or `Bolts`.
5. Set **Used per Attack**, then save the weapon.
6. As DM, open **Automation -> Policies** and enable **Ammunition Tracking**.

Only an attack roll from an explicitly linked weapon consumes ammunition. Arcane Ally does not guess based on weapon type. If the item is missing or its quantity is too low, the player and DM receive an error and the inventory is not changed.

### Browse Combat History

1. Open **DM Dashboard**.
2. Expand **Combat Timeline** in the right column.
3. Use the history selector to choose **Current timeline** or a completed encounter.
4. Search by actor, target, event type, spell, condition, or explanation text.
5. Use the download control to export the selected timeline as Markdown.

Ending combat archives the active session with its encounter name, event count, total rounds, and timestamps. Archived timelines are read-only: undo and clear controls remain available only for the current timeline.

To limit stored history, open **Automation -> Policies -> Combat History**, choose **Keep Encounters** or **Keep Days**, and enter the amount. Pruning applies only to archived encounters and their timeline events. The current encounter and out-of-combat events are not removed.

## Storage Model

- `campaign_state.automation_rules` stores normalized campaign policy JSON.
- `combat_sessions` stores active and archived encounter metadata.
- `effect_events.combat_session_id` assigns each event to its encounter.
- Existing installations receive migration-safe defaults. Ammunition tracking remains disabled and combat history remains unlimited until a DM changes them.
- Events created outside an active encounter remain unscoped and continue to appear in the current out-of-combat timeline.

Arcane Ally retains encounter archives in SQLite until a DM selects a retention policy or the host deliberately manages the database. Back up the database before manual database work.

## API Reference

### `GET /api/automation/rules`

Returns the normalized campaign policy object.

This and the other DM history/automation endpoints require the current DM token as `Authorization: Bearer <token>` or `X-DM-Token: <token>`.

`POST /api/auth/dm` creates that token after a valid PIN login. Each successful login replaces the previously stored token, so another DM tab may receive `401 Unauthorized` until it signs in again.

`GET /api/auth/dm/status` validates a stored token when the DM Dashboard opens. An invalid token returns `401`, is removed by the client, and shows the PIN form instead of partially loading protected panels.

### `PATCH /api/automation/rules`

Accepts a partial policy object. Unknown keys and invalid values are ignored; omitted policies retain their current values.

```json
{
  "concentrationChecks": "prompt",
  "turnTriggers": false,
  "bloodiedThresholdPercent": 50,
  "ammunitionTracking": true,
  "modifierPropagation": true,
  "timelineRetentionMode": "encounters",
  "timelineRetentionValue": 20
}
```

`concentrationChecks` accepts `automatic` or `prompt`. `timelineRetentionMode` accepts `unlimited`, `encounters`, or `days`. Threshold and retention values are numbers; the remaining policy values are booleans.

### `GET /api/combat-sessions`

Returns active and archived combat sessions ordered newest first. The optional `limit` parameter is capped at 100.

### `GET /api/effect-timeline`

Returns the latest page of events in chronological display order.

| Parameter | Purpose |
|---|---|
| `sessionId` | Select an archived or active combat session |
| `beforeId` | Load events older than the supplied event ID |
| `limit` | Page size from 1 to 500; default 200 |
| `targetId` | Restrict events to one target |
| `eventType` | Restrict events to one event type |

Without `sessionId`, the endpoint selects the active combat session. If no encounter is active, it returns unscoped out-of-combat events.

The timeline is append-oriented rather than delete-on-undo: reversing an action adds a correction record and marks the original as reversed. Archived sessions are read-only.

## Self-Hosting Notes

Native Node modules must match the runtime that loads them. When bind-mounting the entire `server/` directory into an Alpine container, isolate `/app/server/node_modules` with a container volume. Do not share host-built `better-sqlite3` binaries with Alpine.

Production containers should install dependencies while building the image and run `npm start` without reinstalling packages on every restart.
