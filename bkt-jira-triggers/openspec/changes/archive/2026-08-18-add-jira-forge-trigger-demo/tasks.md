## 1. Phase 0 - Forge Readiness and Empirical Spike

- [x] 1.1 Confirm local prerequisites: Node.js, npm, git, Forge CLI version, and `forge whoami` status.
- [x] 1.2 Ask the user to complete `forge login` if Forge is not authenticated.
- [x] 1.3 Verify whether the current Forge CLI supports the planned Node runtime before finalizing `manifest.yml`.
- [x] 1.4 Create a minimal temporary spike handler that logs only top-level event/context key shapes. Done: the `jira.event.shape` line reports `eventKeys`, `issueKeys`, `issueFieldKeys` and `contextKeys` for every invocation.
- [x] 1.5 Deploy/install the spike in a Jira Cloud development site and trigger real Jira issue events. Done: deployed and installed on `pablodefranchi.atlassian.net`, project `DTJF`. Real created and updated events captured.
- [x] 1.6 Capture observed payload-shape evidence under `docs/evidence/` and use it to guide final fixtures. Done: `docs/evidence/dtjf-trigger-real.log`. The real payload carried `creator`, `reporter`, `fixVersions`, `associatedUsers`, `atlassianId`, `permissions` and `contextToken`, none of which the fixtures contained and none of which reached the built message.
- [x] 1.7 Remove any temporary spike-only event subscriptions before final implementation completion.

## 2. Project Skeleton and Tooling

- [x] 2.1 Create the standalone Forge project files: `package.json`, `.gitignore`, `.env.example`, `tsconfig.json`, `jest.config.js`, `eslint.config.mjs`, and `.prettierrc`.
- [x] 2.2 Add npm scripts for typecheck, lint, test, and Forge lint where applicable.
- [x] 2.3 Install only required dependencies for TypeScript, Jest, ESLint, Prettier, Forge compatibility, and local contract validation.
- [x] 2.4 Run `npm run typecheck`, `npm run lint`, and `npm test` as the phase gate.

## 3. Manifest and Source Structure

- [x] 3.1 Create final `manifest.yml` with issue-created and issue-updated triggers, one function, and `read:jira-work`.
- [x] 3.2 Ensure `manifest.yml` does not declare `permissions.external` or `remotes`.
- [x] 3.3 Create `src/index.ts` as a thin Forge entrypoint that delegates to the handler.
- [x] 3.4 Create `src/types.ts` with local Jira event and future issues-request types derived from observed evidence and documented contract needs.
- [x] 3.5 Run the phase gate: `npm run typecheck`, `npm run lint`, and `npm test`.

## 4. Fixtures and Sanitization

- [x] 4.1 Create observed-shape-based test fixtures for issue-created and issue-updated events.
- [x] 4.2 Add poisoned fixture values for summary, email, host URL, display name, description, attachment, unknown field, and custom field canaries.
- [x] 4.3 Implement `src/sanitize.ts` using allowlist copying and derived metadata.
- [x] 4.4 Implement `findForbiddenContent` or equivalent test helper to detect forbidden values and keys.
- [x] 4.5 Add `no-pii.test.ts` proving canaries and forbidden content do not appear in sanitized output or captured logs.
- [x] 4.6 Run the phase gate and confirm sanitizer coverage expectations.

## 5. Local Future Contract Builder

- [x] 5.1 Implement `src/contract.ts` with a local snapshot of the future `integration-service` issues request schema and source-date note.
- [x] 5.2 Implement `buildIssuesRequest(event, { initiatedBy })` as a pure function that returns ok or explicit failure reason.
- [x] 5.3 Enforce exactly one issue per request, required issue key, required non-empty summary, length limits, and control-character normalization.
- [x] 5.4 Add `contract.test.ts` for valid payloads, missing key, missing summary, missing fields, truncation, control characters, and schema validation.
- [x] 5.5 Run the phase gate.

## 6. Handler Behavior

- [x] 6.1 Implement `src/handler.ts` without direct imports from Forge-specific modules.
- [x] 6.2 Emit exactly three JSON log records per invocation: `jira.event.received`, `jira.event.shape`, and `jira.contract.payload.built`.
- [x] 6.3 Add one correlation identifier per invocation and reuse it across all three log records.
- [x] 6.4 Derive event date from Jira updated/created fields and fall back to received time while recording the source.
- [x] 6.5 Record projected future correlation fields without treating `executionId` as available in this phase.
- [x] 6.6 Add `handler.test.ts` for log count, event names, shared correlation ID, event-date fallback, contract-valid output, and no sensitive content.
- [x] 6.7 Run the phase gate.

## 7. Forge Validation and Evidence

- [x] 7.1 Run `forge lint` and resolve manifest/runtime issues within scope. Done: `No issues found.` The earlier silent failure was the missing `app.id`, which `forge register` writes.
- [x] 7.2 Verify manifest/source absence of `remotes`, `external`, and `fetch`.
- [x] 7.3 Deploy and install the app in development after human Forge/Jira prerequisites are satisfied. Done: `forge install list` reports `Up-to-date` on the target site. Registration required a Developer Space id, which the CLI does not mention until it fails.
- [x] 7.4 Trigger at least one issue-created and one issue-updated event in the development Jira site. Done: both event types observed. Note: one ticket produced four invocations, not two, and the update event was logged before the creation event despite happening after it.
- [x] 7.5 Capture real sanitized Forge log evidence under `docs/evidence/` with date and issue reference metadata. Done: four evidence files, indexed in `docs/evidence/README.md`. Zero occurrences of the ticket title, the person's name or their email across all of them.
- [x] 7.6 If real payload lacks required fields, document the finding and keep the builder failure behavior instead of adding outbound Jira API reads.

## 8. Documentation

- [x] 8.1 Create `README.md` as the evaluator entry point with the acceptance-criteria table.
- [x] 8.2 Create `docs/01-eventos-permisos-limitaciones.md`.
- [x] 8.3 Create `docs/02-datos-minimos-y-correlacion.md`.
- [x] 8.4 Create `docs/03-propuesta-integracion-futura.md` describing but not implementing transport, auth, idempotency, rate limits, and phase-2 roadmap.
- [x] 8.5 Create `docs/04-runbook-y-hallazgos.md` with runbook, tunnel/log caveats, now-vs-later table, and unresolved findings.

## 9. Final Checks Before Handoff

- [x] 9.1 Run `npm run typecheck`, `npm run lint`, `npm test`, and `forge lint`. Done: all four clean. 28 tests across 4 suites, and `forge lint` reports `No issues found.`
- [x] 9.2 Confirm `Select-String` checks for `remotes|external|fetch` in `manifest.yml` and `fetch(` in `src/` are empty.
- [x] 9.3 Confirm no implementation file references or imports `integration-service` except documentation that explains the future boundary.
- [x] 9.4 Confirm `integration-service` worktree status is unchanged if it is present locally.
- [x] 9.5 Update this `tasks.md` by marking completed tasks only after apply work is actually done.
