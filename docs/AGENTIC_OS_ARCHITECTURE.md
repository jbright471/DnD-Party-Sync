# Agentic OS Architecture Record

## Arcane Ally R1-E — REST authorization capsule

Status: implemented and repository-verified; not deployment-released.

R1-E sits on top of the R1-D Socket.io recipient/capability boundary. It does not redesign sessions or grant companion/cast REST privileges.

### Authority boundary

- Public bootstrap is limited to `POST /api/auth/dm` and `GET /api/health`.
- Every classified production REST route requires the single current revocable DM session. Identity is resolved centrally from Bearer or `X-DM-Token` credentials validated by the server.
- Player companion and encounter-cast authority remains on the R1-D Socket.io capability path. A server-validated player/cast access grant is explicitly forbidden from REST.
- Unclassified `/api` prefixes fail closed before routers, body parsing, uploads, file reads, database mutations, or AI calls.
- The browser has one same-origin credential boundary. Protected map/file and export responses are fetched with the DM session and exposed to rendering/download only through temporary blob URLs; credentials never enter URLs, and protected API responses are not service-worker cached.
- REST denial evidence is persistent but data-minimized: fixed event type, server-derived role, safe route class, denied outcome, direct-peer address, and fixed reason. Attacker-controlled request material is excluded.

The authoritative route inventory and status contract are in [REST_ACCESS_MATRIX.md](REST_ACCESS_MATRIX.md). Automated source coverage prevents a new production mount or inline API prefix from silently becoming public.

### Excluded changes

R1-E does not add companion/cast REST endpoints, redesign DM sessions, change dependencies or lockfiles, provision certificates, mutate firewalls/Tailscale, probe a public endpoint, alter the canonical checkout, or push/merge/deploy.

### Deployment-specific release gates

1. Back up the target database and confirm the `security_audit_events.route_class` additive migration on the target revision.
2. Build and start the actual production process from the expected revision; verify internal and intended private/public health endpoints report that revision through the deployment owner’s normal mechanism.
3. Re-run the production REST matrix against the deployed process, including DM replacement/revocation, map/file blob rendering, authenticated export, access-grant rejection, unclassified denial, audit redaction, and no-side-effect checks.
4. Confirm the reverse proxy preserves the intended Origin contract and has deployment-side rate limiting/source-address semantics. Terminate HTTPS or constrain access to the approved private overlay before any broader exposure.
5. Confirm direct backend exposure, host firewall posture, Tailscale policy, backups, audit retention/permissions, and rollback are owned and approved outside this capsule.
