# Automation Policies & Combat History

## Overview

Arcane Ally keeps table-saving automation under DM control while preserving a clear record of what changed. Campaign policies are server-authoritative and enabled by default, so upgrading does not silently change an existing campaign's behavior.

Completed encounters are stored as read-only timeline archives. The live table receives only the active encounter's events, while DMs can search or export older encounters from the Combat Timeline.

## DM Workflow

### Configure Automation

1. Open **DM Dashboard**.
2. Click **Automation** in the header.
3. Select **Policies**.
4. Change a switch or concentration-check mode.

Changes save immediately and apply to the next matching action. Disabling a policy does not reverse state already applied.

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

### Browse Combat History

1. Open **DM Dashboard**.
2. Expand **Combat Timeline** in the right column.
3. Use the history selector to choose **Current timeline** or a completed encounter.
4. Search by actor, target, event type, spell, condition, or explanation text.
5. Use the download control to export the selected timeline as Markdown.

Ending combat archives the active session with its encounter name, event count, total rounds, and timestamps. Archived timelines are read-only: undo and clear controls remain available only for the current timeline.

## Storage Model

- `campaign_state.automation_rules` stores normalized campaign policy JSON.
- `combat_sessions` stores active and archived encounter metadata.
- `effect_events.combat_session_id` assigns each event to its encounter.
- Existing installations receive migration-safe defaults with all policies enabled.
- Events created outside an active encounter remain unscoped and continue to appear in the current out-of-combat timeline.

Arcane Ally retains encounter archives in SQLite until the host deliberately manages or replaces the database. Back up the database before manual retention or pruning work.

## API Reference

### `GET /api/automation/rules`

Returns the normalized campaign policy object.

### `PATCH /api/automation/rules`

Accepts a partial policy object. Unknown keys and invalid values are ignored; omitted policies retain their current values.

```json
{
  "concentrationChecks": "prompt",
  "turnTriggers": false
}
```

`concentrationChecks` accepts `automatic` or `prompt`. Other policy values are booleans.

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

## Self-Hosting Notes

Native Node modules must match the runtime that loads them. When bind-mounting the entire `server/` directory into an Alpine container, isolate `/app/server/node_modules` with a container volume. Do not share host-built `better-sqlite3` binaries with Alpine.

Production containers should install dependencies while building the image and run `npm start` without reinstalling packages on every restart.
