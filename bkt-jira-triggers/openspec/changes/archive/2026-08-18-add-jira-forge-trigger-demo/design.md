## Context

This project is a standalone Jira Forge investigation. The source task asks for a technical demo that proves Jira Forge can detect Jira issue events through triggers and documents how those events could later connect to `integration-service`.

The production `integration-service` remains out of scope. It already owns ingestion, translation, persistence, and agent orchestration. This demo must not import that repository, call its endpoint, alter its `POST /api/v1/issues` contract, or move sensitive Jira content outside the Forge execution/logging evidence.

The implementation plan favors empirical evidence first: verify Forge login, runtime support, trigger payload shape, Jira development-site permissions, and event delivery behavior before building the final handler and documentation.

## Goals / Non-Goals

**Goals:**

- Build a standalone TypeScript Jira Forge demo with `manifest.yml`, trigger entrypoint, handler, sanitization, contract builder, tests, runbook, and evidence folder.
- Capture Jira issue-created and issue-updated events in a Jira Cloud development site.
- Log exactly three structured JSON lines per invocation: sanitized event metadata, observed event shape, and locally built future contract payload.
- Build a local representation of the future `integration-service` request body for exactly one issue, validate it, and never send it.
- Prove that logs and generated evidence do not expose Jira free text, email addresses, Atlassian host URLs, attachments, unknown custom fields, or invented canary values.
- Document current capability, known limitations, future integration options, authentication/storage recommendations, idempotency risks, rate-limit risks, and validation commands.

**Non-Goals:**

- Do not modify `integration-service`.
- Do not change `POST /api/v1/issues`.
- Do not add a GUI.
- Do not send real data to external endpoints.
- Do not configure Forge egress, `permissions.external`, `remotes`, or `fetch` in this phase.
- Do not archive this OpenSpec change until apply and verification are complete and explicitly authorized.

## Decisions

### Standalone Forge Project

Create the demo as its own project folder with its own package metadata and Forge manifest.

Rationale: keeping Forge trigger research separate avoids mixing uncertain event behavior with the production ingestion service. The output remains reviewable and disposable if Forge constraints block the approach.

Alternative considered: add triggers directly to `integration-service`. Rejected because the task is investigative and the current service contract must remain stable.

### Spec-Driven Rather Than Quick-Fix

Use a spec-driven OpenSpec change.

Rationale: the plan introduces a new capability with runtime setup, security boundaries, tests, documentation, external Jira Cloud validation, and future integration decisions. That is broader than a small correction.

Alternative considered: quick-fix. Rejected because quick-fix would hide important safety and acceptance criteria.

### Empirical Spike Before Final Implementation

Run a phase-0 Forge spike after apply authorization and human Forge login.

Rationale: important uncertainties must be resolved before final code: Forge CLI login, runtime support, handler resolution, real payload shape, Jira site permissions, and tunnel/log behavior.

Alternative considered: implement fully from documentation first. Rejected because Jira event payload shape and Forge runtime details are exactly what the demo must prove.

### Minimal Final Trigger Set

The final manifest subscribes only to `avi:jira:created:issue` and `avi:jira:updated:issue`.

Rationale: these two events satisfy the task while keeping blast radius and logs small.

Temporary exception: phase 0 may temporarily subscribe to additional Jira issue event families only to inspect `Object.keys` through tunnel output, then must revert to the two final events before completion.

### No Egress By Construction

Do not declare `permissions.external`, `remotes`, or `fetch`.

Rationale: absence of egress configuration is the structural guarantee that the prototype cannot call `integration-service` or other external systems in this phase.

Alternative considered: implement a disabled or mocked fetch. Rejected because it weakens the proof that no outbound integration happens.

### Allowlist Sanitization

Sanitize by copying only known safe fields and deriving metadata from sensitive fields.

Rationale: allowlist behavior prevents future or unknown Jira fields from leaking into logs without needing a rule for every possible field.

Sensitive values such as summary, description, account identifiers, display names, emails, avatars, attachments, host URLs, and `customfield_*` values must not be copied to logs.

### Local Contract Builder

Implement a pure builder that creates and validates the future `integration-service` payload but does not send it.

Rationale: the task requires defining minimum data for a future integration. Executable validation is stronger evidence than prose, while still respecting the non-integration boundary.

The builder must produce an `issues` array with exactly one element, enforce key and summary requirements, strip forbidden control characters while preserving tab/newline/carriage return, truncate configured lengths, and return an explicit failure reason instead of emitting knowingly invalid payloads.

### Testing and Evidence

Use Jest tests for sanitizer, contract builder, and handler logs. Capture real Forge logs into `docs/evidence/` during final validation.

Rationale: tests prove local behavior; evidence proves real Jira/Forge event capture. Both are required for the acceptance criteria.

## Risks / Trade-offs

- Forge CLI is not logged in -> human must run `forge login` before deploy/install/tunnel validation.
- Jira development site or admin consent blocks installation -> record the blocker in documentation; do not fake evidence.
- Forge CLI 13.0.0 may not support `nodejs24.x` -> verify in phase 0 and choose the supported runtime before final manifest.
- Jira trigger payload may not include required issue fields such as summary -> builder must return `MISSING_SUMMARY` and documentation must record this as a valid investigation result.
- OneDrive path with spaces may affect `npm install` or Forge bundling -> attempt in place first; if failures are erratic, move the whole project once to `C:\dev\triggers` and copy final deliverables back once.
- `forge logs` delivery can lag and does not show tunnel output -> document the difference and capture the correct evidence source.
- Local contract copy can drift from `integration-service` -> include source notes and mark the future integration contract as a local snapshot for this demo.
- At-least-once delivery can duplicate events in a future integration -> document deduplication and idempotency requirements, but do not implement future delivery.

## Migration Plan

No production migration is required.

Apply implementation steps only after explicit authorization:

1. Resolve phase-0 Forge prerequisites and observed payload shape.
2. Create local project/tooling and quality gates.
3. Implement fixtures, sanitizer, contract builder, handler, and final manifest.
4. Deploy/install/tunnel/log in a Jira development site and capture evidence.
5. Complete documentation and final validation.

Rollback is deletion of the standalone demo artifacts. No production system is modified.

## Open Questions

- Which Jira Cloud development site will be used for Forge install and event generation?
- Does the current Forge CLI version support `nodejs24.x`, or must the manifest use another supported runtime?
- Does the real trigger event include `fields.summary`, `fields.issuetype`, `fields.status`, `fields.created`, and `fields.updated`?
- Does the development site require admin consent for `read:jira-work`?
- What is the confirmed rate-limit configuration of the future `integration-service` environment?
