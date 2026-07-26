# Self-Hosting & Upgrades

Arcane Ally is a local-first D&D companion intended for a trusted table network. Read [SECURITY.md](../SECURITY.md) before making a deployment remotely accessible.

## Components

| Component | Default | Responsibility |
|---|---:|---|
| Frontend | `5173` in development | React UI, same-origin API calls, Socket.io client |
| Backend | `3001` | Express API, Socket.io gateway, rules processing |
| SQLite | `server/dnd.db` unless `DB_PATH` is set | Campaign and session state |
| Ollama | `11434` by convention | Optional AI parsing and generation |

D&D Beyond imports and Open5e searches require internet access when those features are used. Ollama prompts are sent to the configured `OLLAMA_URL`.

## Environment

Copy `.env.example` or `server/.env.example` to `server/.env` and replace the sample values.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | No | `3001` | Backend HTTP and Socket.io port |
| `DM_PIN` | Yes for DM use | `1234` fallback | Replace before inviting players |
| `JSON_BODY_LIMIT` | No | `15mb` | Maximum JSON payload; map images use base64 JSON |
| `OLLAMA_URL` | Only for AI features | Code fallback may differ by environment | Set explicitly for predictable behavior |
| `OLLAMA_MODEL` | Only for AI features | `mistral-small:24b` | Must match a model installed on the configured Ollama host |
| `DB_PATH` | No | `server/dnd.db` | Use a persistent mounted path in containers |

Never commit a real `.env`, database, character PDF, certificate, private key, or host-specific Compose file.

## First-Run Data

The public repository is a blank slate. It does not contain a database, character records, maps, notes, loot, or combat history. On first backend start, Better-SQLite3 creates the database at `DB_PATH` and `server/schema.js` applies the current schema and safe upgrade migrations.

After the UI loads, create or import the first character. Opening **DM Dashboard** presents the DM PIN login; a missing or expired token does not expose protected dashboard controls. See [First Run](./FIRST_RUN.md) for the complete checklist.

## Development Topology

Install exactly from the committed lockfiles:

```bash
cd server
npm ci
npm start
```

```bash
cd client
npm ci --legacy-peer-deps
npm run dev
```

The checked-in `client/vite.config.ts` uses `http://dnd-party-sync-backend:3001` for `/api` and `/socket.io`, matching the current container-network topology. If both processes run directly on one host, change both proxy targets to `http://localhost:3001` for that development environment.

Do not run a dependency resolver on every container restart. Build dependencies into the image, or use `npm ci` with the committed lockfile in a development container. Keep `node_modules` in a container volume when bind-mounting `server/` into Alpine so host-built `better-sqlite3` binaries are not reused.

## Production Topology

Use three network responsibilities:

1. Serve the built frontend over HTTPS with a static web server or reverse proxy.
2. Proxy `/api` and `/socket.io` to the backend on port `3001`, including WebSocket upgrades.
3. Keep SQLite and Ollama on private, persistent services that are not exposed publicly.

The repository Dockerfile builds `client/dist` and the backend, but its final command starts only the backend. Express currently does not serve the copied frontend files. A production deployment therefore needs a separate static frontend service or reverse-proxy configuration.

The repository intentionally does not include a public `docker-compose.yml`. Deployment files commonly contain private mount paths, addresses, and infrastructure names; maintain them outside the public repository.

## Data and Backups

The active database is whichever file `DB_PATH` resolves to. Before upgrading:

1. Confirm the active `DB_PATH` inside the running backend environment.
2. Stop or quiesce the backend, or use SQLite's online backup command.
3. Copy the database to a dated backup outside the application working tree.
4. Verify the backup opens with SQLite before changing the deployment.

Arcane Ally runs schema migrations during backend startup. The transactional command release adds command receipts, aggregate versions, a campaign clock, command-to-aggregate records, general audit events, and retained state deltas. Keep the pre-upgrade database until the new version has been exercised successfully.

## Upgrade Checklist

1. Back up the active database and private deployment configuration.
2. Pull or deploy the reviewed application revision.
3. Run `npm ci` in the server and `npm ci --legacy-peer-deps` in the client, or rebuild immutable images.
4. Run server tests/lint and the client lint/build.
5. Restart the backend and frontend services.
6. Confirm `/api/health` returns `200`.
7. Confirm `/api/v1/contracts` reports contract `1.0.0`, and `/api/v1/contracts/state/version` returns the campaign and aggregate versions.
8. Reconnect a client and confirm it catches up through deltas or receives a fresh projected snapshot when `resyncRequired` is true.
9. Confirm anonymous DM history requests return `401` and a fresh DM login can load Automation and Combat Timeline.
10. Confirm a normal map image uploads successfully within `JSON_BODY_LIMIT`.
11. Confirm the repository lockfiles remain unchanged after service restart.

## Remote Access

Arcane Ally does not provide a complete internet-facing identity system. For remote play:

- Use HTTPS.
- Put the app behind a VPN, identity-aware proxy, or reverse-proxy authentication.
- Do not expose the backend, SQLite file, or Ollama port directly.
- Restrict firewall access to the proxy and trusted administration paths.
- Use a strong `DM_PIN` and rotate it if it is shared accidentally.

WebRTC microphone access generally requires HTTPS except on `localhost`.
On an insecure LAN origin, Arcane Ally explains this requirement and disables the unavailable Join Voice action.

## Health Checks

`GET /api/health` returns process uptime and Node memory metrics. The Docker healthcheck also fails when the endpoint is unavailable, returns a non-200 response, or reports more than 500 MB of used V8 heap.
