## Why

The project needs a separate Jira Forge demo to prove that Jira issue events can be captured through Forge triggers before any integration work is added to `integration-service`.

This change keeps the investigation isolated from the production ingestion, translation, persistence, and agent orchestration flow. It reduces risk while producing evidence, documentation, and a future integration contract that can be reviewed before implementation.

## What Changes

- Create an independent Jira Forge TypeScript prototype in this project, separate from `integration-service`.
- Add a Forge manifest with Jira issue-created and issue-updated triggers, a single function handler, and the minimum Jira read scope.
- Implement a small handler that records sanitized event metadata, observed payload shape, and the locally built future `POST /api/v1/issues` request payload without sending it.
- Add allowlist-based sanitization to avoid logging Jira free text, email addresses, account display data, host URLs, attachments, or unknown fields.
- Add a pure contract builder that validates the future `integration-service` request shape for exactly one issue, preserving the known validation constraints locally.
- Add tests for sanitization, contract building, and handler log behavior, including poisoned fixtures with canary values.
- Add documentation for events, permissions, limitations, minimum data, correlation, future integration, runbook steps, evidence capture, and acceptance criteria.
- Do not add network egress, `permissions.external`, `remotes`, or `fetch` usage in this phase.
- Do not modify `integration-service` or its `POST /api/v1/issues` endpoint.

## Capabilities

### New Capabilities

- `jira-forge-trigger-demo`: Demonstrates Jira Forge trigger capture for issue events, sanitized tracing, local future contract construction, and documented integration boundaries.

### Modified Capabilities

- None.

## Impact

- Affected project: this standalone demo folder only.
- Affected runtime/tooling: Forge CLI, Node.js, npm, TypeScript, Jest, ESLint, Prettier.
- Affected files to be created during apply: `manifest.yml`, package/tooling config, `src/` implementation and tests, `docs/` documentation, `docs/evidence/` captured evidence, and `README.md`.
- External systems: Jira Cloud development site for Forge deploy/install/tunnel/log verification.
- Out of scope: `integration-service`, any production endpoint, UI, real sensitive Jira data, API key storage, outbound HTTP calls, and archive operations.
