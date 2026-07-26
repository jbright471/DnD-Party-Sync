# Automation Contracts v1

Arcane Ally exposes a stable automation core at `GET /api/v1/contracts`. The registry lists every public schema, stable calculated-stat key, effect type, and supported automation hook. Individual JSON Schemas are available at `GET /api/v1/contracts/:name`.

## Registry endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/contracts` | Registry version, capabilities, and schema links |
| `POST /api/v1/contracts/negotiate` | Select a mutually supported schema version |
| `GET /api/v1/contracts/:name` | Retrieve one published JSON Schema |
| `GET /api/v1/contracts/state/version` | Read the campaign clock and all aggregate versions |
| `GET /api/v1/contracts/state/deltas?afterVersion=N` | Read ordered reconnect deltas after version `N` |

Socket.io clients use `negotiate_automation_contract` and `request_state_deltas`, then receive `automation_contract_negotiated`, `state_delta_batch`, and live `state_delta` messages.

## Command envelope

Every stable automation command envelope uses a UUID, the current campaign version, and the expected version of every affected aggregate:

```json
{
  "commandId": "123e4567-e89b-42d3-a456-426614174000",
  "commandType": "effect.party.apply",
  "schemaVersion": "1.0.0",
  "expectedCampaignVersion": 14,
  "expectedAggregateVersions": {
    "character:7": 3,
    "initiative:12": 8
  },
  "actor": { "type": "dm", "id": "DM" },
  "payload": {
    "targets": [
      { "id": 7, "type": "character" },
      { "id": 12, "type": "monster" }
    ],
    "effects": [{ "type": "damage", "value": 6, "damageType": "fire" }],
    "actor": "DM"
  }
}
```

Send REST idempotency keys in the envelope or the `Idempotency-Key` header. Legacy socket payloads receive a generated command ID, but integrations should retain and reuse their UUID when retrying.

Compatibility REST requests may also send `X-Expected-Campaign-Version`; expected aggregate versions remain in the request body. Successful mutation responses expose `X-Command-ID` and `X-Campaign-Version`, and a stored replay adds `Idempotency-Replayed: true`.

## Version conflicts

- `STALE_CAMPAIGN_VERSION` means another committed command changed campaign state. Refresh deltas before retrying.
- `STALE_AGGREGATE_VERSION` means at least one target changed. Recalculate the command against current target state.
- Reusing a command ID with different content returns `COMMAND_CONFLICT`.
- Reusing the same command ID and content returns the stored result with `replayed: true`; it does not mutate or broadcast again.

Current version metadata is available at `GET /api/v1/contracts/state/version`. Reconnect clients can request ordered deltas with `GET /api/v1/contracts/state/deltas?afterVersion=N` or the `request_state_deltas` socket event. A `resyncRequired` response means retained deltas no longer cover the requested version.

## Stability policy

Fields defined by the v1 schemas are stable for the v1 lifetime. Additive experimental data must live under `extensions` with an `x-`-prefixed key, such as `x-preview`. Experimental fields and hooks may change without a major contract version. Removing or changing a stable field requires a new major version and a negotiation period where both versions are supported.

## Transaction behavior

A command receipt, target mutations, per-aggregate versions, the campaign clock, general audit event, and reconnect delta commit in one SQLite `IMMEDIATE` transaction. Side effects run after commit. Multi-target effects fail as a unit when any requested target is invalid or any target application fails.

Synchronous legacy REST and socket mutations pass through compatibility boundaries with the same receipt and audit model. Flows that call D&D Beyond, Ollama, PDF parsing, report generation, or backup services perform those slow operations first and put only their final database changes inside the transaction.

The canonical post-commit integration message is `state_delta`. Existing domain-specific broadcasts may remain temporarily for UI compatibility and are not part of the stable v1 contract. Command UUIDs and version metadata do not authenticate a caller; authorization and trusted-network deployment requirements still apply.
