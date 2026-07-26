# Transactional Orchestrator and Contract Registry

## Goal
Make every state-changing command use one idempotent transaction model with campaign and aggregate versions, then publish a stable v1 automation contract with explicitly experimental extensions.

## Tasks
- [x] Extend SQLite command metadata for campaign versions, multi-aggregate versions, deltas, and general audit events. → Verify: production and test migrations create the same tables.
- [x] Replace the single-aggregate receipt helper with a reusable transaction orchestrator while preserving legacy callers. → Verify: replay, rollback, stale campaign, and stale aggregate tests pass.
- [x] Define and validate v1 command, effect, provenance, calculated-stat, and state-delta contracts. → Verify: valid fixtures pass and incompatible payloads return structured errors.
- [x] Migrate cross-player REST/socket effects to one command envelope and one post-commit state delta. → Verify: multi-target writes, audit, version increments, and replay are each exactly once.
- [x] Add reconnect delta retrieval and schema-version negotiation. → Verify: clients can request deltas after a known campaign version and detect a resync requirement.
- [x] Adapt legacy mutation boundaries to generate envelopes while clients migrate to explicit versions. → Verify: current UI behavior remains compatible and every registered mutation receives a command ID.
- [x] Document the architecture decision and public compatibility policy. → Verify: docs identify stable fields, extension rules, conflicts, and migration expectations.
- [x] Run focused tests, the full server suite, lint, and the client build. → Verify: all available checks pass or remaining pre-existing failures are recorded.

## Done When
- [x] Duplicate commands cannot apply state or broadcast twice.
- [x] Multi-target commands commit mutations, audit metadata, versions, and delta atomically.
- [x] Campaign ordering and affected-aggregate conflict checks are both enforced.
- [x] Stable v1 schemas are discoverable and experimental fields are namespaced.
