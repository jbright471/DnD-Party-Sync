# Player Preview & Command Safety

## Preview the App as a Player

Player-State Preview helps a DM answer, "What can this player see right now?" without signing in as that player or changing campaign state.

1. Open **DM Dashboard** and enter the DM PIN.
2. Find the character in **God-Eye View**.
3. Click the **monitor icon** beside the character's notes icon.
4. Arcane Ally opens a separate tab with a permanent **Previewing as _Character_** banner.
5. Leave that tab open while troubleshooting. It updates as the campaign changes.

The preview works for connected and disconnected characters. It is read-only and shows the selected character's sheet, visible party summaries, encounter order, permitted monster health, relevant effects, current permissions, party notes, shared loot, and revealed maps.

Hidden monsters, undiscovered or DM-only markers, monster stat blocks, boss phases, private prep notes, pending imports, and DM controls are removed by the server before the snapshot is sent. They are not merely hidden with CSS.

Preview links expire after 15 minutes and bind to the first tab that opens them. Open a new preview from the DM Dashboard after expiration. The link token is stored in the URL fragment so normal HTTP request logs do not receive it.

## Why an Action Does Not Run Twice

Browsers and wireless connections sometimes resend a command when an acknowledgement is lost. Arcane Ally gives each state-changing action a command UUID and stores the result in the same database transaction as the game-state change.

On the first delivery:

1. The server checks the UUID, campaign version, and versions of every affected character, monster, or other aggregate.
2. The rules mutation, receipt, aggregate versions, campaign clock, audit record, and reconnect delta commit together.
3. After commit, the server acknowledges the command and emits one canonical role-safe state delta.

On a retry with the same ID and payload, the server returns the stored result without changing state again. If the same ID is reused with different data, the server rejects it as a conflict.

The browser's offline HP queue keeps an entry until the server acknowledges it. A timeout leaves the entry queued; reconnecting resends the same ID. A permanent rules rejection is removed instead of retrying forever.

## Coverage

The shared boundary covers all in-process REST mutations and registered state-changing Socket.io events, including:

- damage, healing, and temporary HP
- spell-slot use and unified spell casting
- starting or dropping concentration
- applying or removing conditions
- single- and multi-target buffs
- hit-die use, short rests, and long rests
- party-loot claims and approval requests
- character, encounter, map, marker, note, quest, automation, homebrew, and world changes
- dice, initiative, combat, voting, pending-action, and permission commands

Bulk effects use one command UUID across all targets and roll back as a unit if any target is missing or fails. Routes that depend on D&D Beyond, Ollama, PDF parsing, report generation, or backup services finish that external work first; the final database mutation still uses an explicit atomic command boundary. The receipt does not prevent an upstream service from being called again before a retry reaches that final write.

Legacy domain broadcasts may coexist with the canonical delta while older UI listeners are migrated. Automation clients should consume `state_delta` and the v1 schemas instead of depending on those internal event payloads.

## Version Conflicts and Reconnects

- `STALE_CAMPAIGN_VERSION` means another command committed first. Fetch missed deltas and recalculate before retrying.
- `STALE_AGGREGATE_VERSION` means a specific target changed. Refresh that target before retrying.
- `COMMAND_CONFLICT` means the UUID was reused for different content; generate a new UUID for a genuinely new action.
- An identical retry returns the original result with `replayed: true` and does not emit the canonical delta again.

The client remembers the last campaign version and asks for ordered deltas after reconnecting. If retained history no longer covers that version, the server responds with `resyncRequired` and sends a fresh role-safe snapshot.

## Storage and Retention

- `processed_commands` stores command type, actor scope, payload hash, result, and commit time.
- `aggregate_versions` stores the version of each affected aggregate.
- `campaign_clock` orders every committed mutation.
- `command_aggregates` and `command_audit_events` preserve version and provenance metadata.
- `state_deltas` retains the newest 10,000 reconnect entries by default.
- Committed receipts older than 30 days are pruned daily.
- A row cap retains the newest 50,000 receipts by default.

These tables contain operational command metadata and results, not DM credentials. They are part of the private runtime SQLite database and are excluded from the public repository.
