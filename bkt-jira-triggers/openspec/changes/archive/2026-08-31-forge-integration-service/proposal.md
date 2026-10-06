## Why

TICK-17 asks for a real end-to-end demonstration of the Jira ticket flow:

```text
Jira issue created/updated -> Forge trigger -> POST /api/v1/issues -> integration-service -> sanitized evidence
```

The existing Forge demo already proves Jira event capture, payload building, and sanitized logging. The business question has moved from "can Forge observe Jira events?" to "can the deployed Forge trigger send a real Jira ticket to `integration-service` and prove the service accepted and processed it?".

This change keeps the two repositories separate. The Forge app remains in `triggers`; `integration-service` remains the backend destination. Repository fusion, UI work, production rollout, and service refactors are outside this change.

## What Changes

- Make the existing Forge-to-service capability execution-ready for TICK-17.
- Use the already implemented Forge HTTP path to send one validated Jira issue to `POST /api/v1/issues`.
- Configure Forge egress with `remotes` and `permissions.external.fetch.backend` only for the approved HTTPS destination used during the demo.
- Configure runtime values through Forge variables: service base URL, API key, and optional API key header name.
- Preserve correlation from Forge to `integration-service` through `correlationId` / `X-Request-Id`.
- Treat HTTP status and response body semantics as separate: HTTP `201` alone is not success unless `successIntegration=true` and `tickets[0].success=true`.
- Keep logs and evidence sanitized: no API keys, tokens, emails, display names, descriptions, or raw ticket title in logs/evidence.
- Save new evidence from a real created/updated Jira ticket execution.
- Restore the project to its at-rest state after the demo by removing temporary egress/variables.

## Capabilities

### Added Capabilities

- `forge-to-integration-service`: Sends a validated single-issue Jira payload from Forge to `integration-service`, correlates the request across both systems, classifies the response truthfully, and captures sanitized evidence.

### Modified Capabilities

- `jira-forge-trigger-demo`: Relaxes the previous absolute "no outbound integration" rule only for an active, explicitly configured `integration-service` demo. At rest, the demo remains without egress.

## Impact

- Primary repository: `triggers`.
- Primary OpenSpec change: `openspec/changes/connect-forge-trigger-to-integration-service/`.
- Runtime/config areas: `manifest.yml`, Forge variables, Forge deploy/install state, reachable HTTPS endpoint.
- Evidence area: `docs/evidence/forge-to-integration-service-<YYYY-MM-DD>.txt`.
- External systems: Jira Cloud development site, Forge development environment, local or development `integration-service`, and optional HTTPS tunnel/gateway.
- Out of scope: UI, repository fusion, production rollout, large service refactors, storing secrets in repo files, and archiving this OpenSpec change before evidence exists.
