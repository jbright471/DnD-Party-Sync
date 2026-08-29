# Autonomous Change Workflow Pilot

## Purpose

This branch is the review base for a scheduled Arcane Ally implementation pilot. It begins from the exact application revision deployed on Bastet on 2026-08-29. It is deliberately separate from GitHub `main` because the deployed release and current `main` have unrelated Git histories that require a human-led reconciliation.

The pilot may turn one evidence-backed product-brief item into a tested GitHub pull request. It may not merge, deploy, modify live campaign data, or change the baseline branch directly.

## Authority boundary

The scheduled worker may:

- Read the latest dated brief under the separate product-brief checkout.
- Select exactly one bounded, reproducible defect or low/medium-complexity improvement.
- Create one disposable Git worktree and an `automation/arcane-ally-YYYYMMDD-<slug>` branch from `origin/automation/arcane-ally-live-baseline`.
- Add or change narrowly related source, tests, and durable documentation.
- Run repository tests and builds in the disposable worktree.
- Commit, push the new branch, and open a pull request against `automation/arcane-ally-live-baseline`.

The scheduled worker must not:

- Push to, merge into, rebase, reset, or force-update `main`, the live baseline, or a release branch.
- Deploy, restart, or reconfigure Bastet, Docker, the LAN application, Tailscale, n8n, the NAS, or any other service.
- Read or modify live databases, campaign state, uploads, environment files, credentials, private keys, or deployment configuration.
- Add dependencies, perform schema/data migrations, change authentication/authorization, or broaden network exposure.
- Combine more than one product outcome in a run.
- Continue when the base is dirty, the latest brief is stale, another pilot pull request is open, tests are unsafe or failing, or the requested behavior is ambiguous.

## Review and evidence

Before editing, the worker creates a bounded R1 task description and requests the Agentic OS Gemini reviewer when it is available. Gemini advice cannot approve or execute work. Codex remains responsible for repository inspection, implementation, diff review, tests, and the final stop/proceed decision.

Every pull request must include:

- The selected brief and evidence.
- The exact baseline commit.
- Scope and files changed.
- Tests and builds run with results.
- Security, privacy, data, and deployment impact.
- Rollback instructions.
- Any missing verification or reason the change should not be merged yet.

GitHub Actions independently repeats client tests/build and server tests. During the pilot, a human reviews and merges the pull request and deployment remains a separate manual operation.

## Promotion criteria

Do not consider automatic merging until at least two consecutive pilot pull requests:

1. stayed within the declared scope;
2. passed local and GitHub checks;
3. required no corrective follow-up for security, data, or deployment behavior; and
4. were manually reviewed and merged without rollback.

Automatic deployment requires a separate design, tested backup/rollback path, Bastet health gates, and post-deployment observation window. It is not part of this pilot.
