# Contributing to Arcane Ally

Thank you for helping improve Arcane Ally. Keep changes focused, testable, and safe for public self-hosting.

## Development Setup

Use Node.js 20 or newer and install from the committed lockfiles.

```bash
cd server
npm ci
npm test
npm start
```

```bash
cd client
npm ci --legacy-peer-deps
npm run dev
```

The checked-in Vite proxy targets the container service `dnd-party-sync-backend:3001`. For host-only development, point both proxy targets in `client/vite.config.ts` to `http://localhost:3001`.

## Before Opening a Pull Request

Run:

```bash
cd server
npm test -- --maxWorkers=1
npm run lint
npm audit --audit-level=high
```

```bash
cd client
npm run lint
npm run build
npm audit --audit-level=high
```

Then verify the affected workflow in a browser at desktop and mobile width.

## Change Guidelines

- Follow existing React, Express, Socket.io, and rules-engine patterns.
- Keep base-sheet data separate from session-state mutations.
- Route every new REST or Socket.io mutation through the shared command boundary. Async handlers must calculate external work first and use an explicit transactional commit for their final database writes.
- Identify every affected aggregate, preserve the caller's UUID across retries, and return version conflicts instead of silently overwriting newer state.
- Treat `state_delta` as the canonical integration broadcast; apply role-safe projection before delivery and keep legacy domain events compatibility-only.
- Version public automation changes through `server/contracts/`. Stable schema fields require a compatible v1 addition or a new negotiated major version; experimental fields belong under an `x-`-prefixed extension key.
- Apply role-safe projections before broadcasting private combat state.
- Add focused tests for shared rules, transaction rollback, replay behavior, version conflicts, contract validation, policy boundaries, authentication, and data retention.
- Update the README, Arcane Codex, changelog, and relevant `docs/` file when behavior changes.
- Do not rewrite historical parser files under `files/` unless the task specifically concerns them.

## Privacy Checklist

Before committing, confirm that the diff does not contain:

- Real `.env` values, PINs, tokens, or API keys
- SQLite databases, journals, or backups
- Character PDFs or private exports
- Personal filesystem paths, LAN addresses, hostnames, or infrastructure names
- Private keys, certificates, or production Compose/Portainer configuration

Also confirm no runtime artifact is tracked:

```bash
git status --short --ignored
git ls-files | grep -E '(\.db|\.sqlite|\.sqlite3|\.pdf|\.pem|\.key|\.p12|\.pfx)$'
git diff --cached --check
```

The tracked-file scan should print nothing. Do not stage ignored runtime data merely to bypass this safeguard.

Use generic placeholders in public examples.

## Commit and Pull Request Notes

- Explain the user-visible behavior and why the change is needed.
- List verification commands and any remaining test gaps.
- Call out migrations, changed defaults, security boundaries, or deployment impact.
- Keep unrelated refactors out of the same change.
