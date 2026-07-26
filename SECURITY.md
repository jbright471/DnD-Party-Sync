# Security Policy

## Supported Version

Security fixes target the latest Arcane Ally release and the current default branch. Older self-hosted revisions should be upgraded before troubleshooting a security issue.

## Trust Model

Arcane Ally is designed for a trusted home or table network. It does not currently provide:

- Individual user accounts or tenant isolation
- Built-in TLS termination
- Rate limiting or brute-force protection
- Comprehensive authorization on every REST and Socket.io mutation
- A hardened public-internet deployment profile

The DM PIN and session token protect selected DM workflows. Role-safe socket projections prevent hidden combat information from being broadcast to the wrong view. Neither mechanism replaces network-level access control.

Transactional command UUIDs prevent accidental duplicate execution and version checks reject stale writes. They are not secrets, authentication credentials, replay-protection against an unauthorized network client, or substitutes for route authorization. Do not expose the contract state endpoints as though they were an identity boundary.

## Safe Deployment Checklist

- Replace the sample `DM_PIN` before inviting players.
- Keep `.env`, SQLite databases, character PDFs, private keys, certificates, and deployment files with real addresses out of Git.
- Keep runtime `data/`, `uploads/`, `backups/`, maps, and character exports outside public commits.
- Use HTTPS and a VPN, identity-aware proxy, or reverse-proxy authentication for remote play.
- Do not directly expose the backend port, SQLite storage, or Ollama port to the public internet.
- Restrict file permissions on the database and backups.
- Back up the active `DB_PATH` before upgrades.
- Keep Node.js and npm dependencies updated, and review `npm audit` results before releases.

## DM Session Tokens

DM-authenticated REST requests use `Authorization: Bearer <token>` or `X-DM-Token: <token>`. A successful `POST /api/auth/dm` login replaces the previous token. This means another DM browser may need to sign in again.

Tokens are stored in browser local storage and in the campaign database. Treat browser profiles and database backups as sensitive.

The DM Dashboard validates a saved token before rendering protected controls. Invalid or expired tokens are removed and the host is returned to the DM PIN login. This protects selected DM features but does not change Arcane Ally's trusted-network deployment model.

Player-State Preview links require an authenticated DM session to create, expire after 15 minutes, and bind to the first tab that opens them. Their tokens are placed in the URL fragment rather than the HTTP request path. The preview uses a separate read-only Socket.io namespace and receives a server-generated player projection; hidden monsters, undiscovered markers, pending imports, and DM-only controls are not sent to that tab.

## Data Leaving the Host

| Feature | Destination |
|---|---|
| AI parsing and generation | The configured `OLLAMA_URL` |
| D&D Beyond import/sync | D&D Beyond services |
| SRD compendium search | Open5e API |
| Voice chat | WebRTC peers and configured network traversal infrastructure |

Review those services and their privacy policies before using them with sensitive campaign material.

## Reporting a Vulnerability

For sensitive reports, use GitHub's private vulnerability reporting or a private Security Advisory when available. Do not publish working exploit details, secrets, or private campaign data in a public issue.

For non-sensitive hardening suggestions, open a GitHub issue with reproduction steps, affected version, impact, and a proposed mitigation when possible.
