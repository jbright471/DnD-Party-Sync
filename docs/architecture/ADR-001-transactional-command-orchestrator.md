# ADR-001: Transactional Command Orchestrator

## Status

Accepted

## Context

Arcane Ally synchronizes high-frequency state across multiple players through REST, Socket.io, SQLite, an effects engine, and reconnect snapshots. A retried command could previously run more than once, and multi-target effects used several idempotency and broadcast patterns. The deployment remains a self-hosted modular monolith with one SQLite writer.

## Options considered

| Option | Benefits | Costs |
|---|---|---|
| Campaign version only | Simple strict ordering | Unrelated edits cause avoidable conflicts |
| Per-aggregate versions only | Precise write conflicts | No total ordering for reconnect deltas |
| Campaign clock plus affected aggregates | Ordered reconnects and precise conflicts | Larger envelopes and more metadata |
| Event sourcing | Complete replay model | Excessive migration and operational complexity |

## Decision

Use a transaction-script orchestrator inside the existing modular monolith. Each command carries a UUID, an expected campaign version, and expected versions for all affected aggregates. An `IMMEDIATE` SQLite transaction checks the receipt and versions, executes every mutation, increments the campaign and affected aggregates, appends a general audit event, stores the command result, and appends one state delta.

The post-commit callback emits one canonical role-projected `state_delta`. A repeated UUID with identical content returns the stored result without rerunning the callback. Existing domain-specific broadcasts may coexist temporarily while UI listeners migrate, but they are outside the stable integration contract. Public v1 automation contracts expose a small stable core; evolving data is limited to `x-`-namespaced extensions.

## Trade-offs

- Clients must retain campaign and aggregate versions and explicitly resolve conflicts.
- State deltas currently include projected snapshots for compatibility, which are larger than minimal patches.
- Compatibility boundaries keep legacy handlers safe while allowing incremental conversion to explicit command handlers.
- External AI, import, PDF, report, and backup work cannot execute inside a SQLite transaction; it is calculated before the final atomic write.

## Consequences

- Multi-character effects, their audit records, versions, and reconnect metadata cannot partially commit.
- Retries do not repeat mutations or post-commit delivery.
- Reconnect clients have a monotonically ordered campaign stream and can detect retention gaps.
- The stable schema becomes a compatibility obligation; experimental capabilities must remain namespaced until promoted.

## Revisit triggers

Revisit the SQLite transaction-script model if Arcane Ally moves to multiple writer processes, campaign delta volume regularly exceeds retention, or snapshot-sized deltas become a measurable bandwidth constraint.
