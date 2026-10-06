# CHANGELOG

All notable changes documented. Format: [Keep a Changelog](https://keepachangelog.com/), [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `scripts/format-logs.js`, reached through `npm run logs`. Raw `forge logs` output is
  one line of JSON per event: correct for a machine, unreadable for a person. The
  formatter groups the four lines of each invocation by `correlationId` and prints
  them as four named steps, translating error codes into prose. It also runs
  `forge logs` itself, so a forgotten pipe can no longer produce the raw dump. A
  summary counts titles appearing in clear, which must always be zero.
- A reference document on the trigger's variables and events, answering the
  question the other documents assumed: for each variable and each event, **who
  defines its name**. Three groups — Atlassian's manifest schema, what Jira delivers
  inside the event, and what this project invented. The practical consequence is that
  a missing name from the first two groups is never something to fix in `src/`.
  Mirrored into the research document as section 12.
- Verified on real data that the Jira changelog does not leak field values. This is
  the place information most easily escapes, because Jira stores both the previous
  and the new value of every modified field. The trace contains zero occurrences of
  `from`, `to`, `fromString` or `toString` — only the field name survives.
- The manual test guide now maps every acceptance criterion in the task brief to the
  test that demonstrates it, so the claim can be checked rather than trusted.
- Read `integration-service`'s source end to end and confirmed its contract matches
  this project's outbound client with zero incompatibilities: same limits on `key`
  and `fields.summary`, same single-issue-per-request rule, same "a 201 is not
  success by itself" semantics. One new finding: its `201` response echoes the full
  input payload back, untruncated summary included — this client does not re-log it
  today, but no test asserted that yet.
- A decision-complete implementation plan for connecting to `integration-service` for
  real, covering architecture, manifest and variable configuration, exact payload,
  error handling, correlation, log sanitization, automated and manual tests, evidence,
  risks, rollback, and acceptance criteria. Reviewed twice by a multi-perspective
  process before finalizing.
- **The plan was executed for real (TICK-17).** A real ticket (`DTJF-17`) was created
  and updated twice in the test project; all three invocations reached
  `integration-service` over HTTPS, all three returned `201` with
  `successIntegration: true` and `tickets[0].success: true`, and the Forge
  `correlationId` matched the service's `X-Request-Id` on every one. Sanitized
  evidence saved under `docs/evidence/forge-to-integration-service-2026-08-29.txt`.
  The repository was reverted to its at-rest, no-egress state afterward, and
  `integration-service` was not modified.
- **The `connect-forge-trigger-to-integration-service` change is archived.** All 24
  tasks are done, and its capability is now a promoted main spec at
  `openspec/specs/forge-to-integration-service/` (five requirements). Found already
  archived while syncing project docs — not run in this session.
### Changed
- `scripts/format-logs.js` no longer prints middle dots (`·`); plain hyphens survive
  terminals that mangle non-ASCII output. Issue type `Error` now renders as
  `Incidencia` in the readable report, matching the term used elsewhere.
- Added Spanish-language explanatory comments across every file in `src/`: a short
  header on what each file is for, plus inline notes on the branches that are not
  self-evident from the code alone (fail-closed on missing runtime config, why a
  `201` is not treated as success by itself, why the service's response body is
  never re-logged in full). No behavior changed; `typecheck`, `lint`, and all 28
  tests were re-run green afterward.
- The manual test guide now opens with the sentence it has to demonstrate and numbers
  the four steps against it. Activating the outbound flow moved from an appendix to
  *Paso 0*, because without it the demo stops precisely where the sentence ends.
- Test 4 no longer asks anyone to kill the tunnel live. It reads the recorded failure
  instead, which leaves the setup standing for whatever comes after. Killing the
  tunnel is documented as a variant, with the warning that it only makes sense last.
- The manual test guide was restructured to lead with the flow rather than the
  installation. A five-perspective review found the same defect from every angle:
  it demonstrated that an installation had succeeded, not what the trigger does.
  283 of 627 lines were CLI plumbing and the one test that proves anything started
  62% of the way in. The flow is now drawn as a pipeline on the first screen, the
  test that fires the trigger is first, and the installation sequence is a reference
  appendix. Three commands are marked as never to be run live.

### Fixed
- Documented that `main` is an orphan branch rather than an ancestor of the working
  branch. It carries a single commit — the state published to the remote — and does
  not contain the log formatter or its npm script, so checking it out removes
  `npm run logs` from the working tree. Nothing is lost, but the failure looks like a
  broken project rather than a branch on a different history. It cost a demo.
- `npm run logs <file> --compact` silently ignored `--compact`. Everything not placed
  after `--` is consumed by npm, so the long report was printed instead of the summary
  with no indication that the flag had been dropped. Every invocation in the
  documentation now uses the `--` form, and the rule is stated where commands are copied.
- Pipe detection in the formatter hung forever on Windows. A pipe there is neither a
  FIFO nor a regular file; what separates it from a terminal is that it stops being a
  character device.
- The events document claimed two `jiraEventTypeName` subtypes. Three have been observed:
  `issue_updated` appears alongside `issue_generic` for the same declared event,
  depending on which field was touched. Logic should not rest on the subtype.
- Two promoted OpenSpec specs quietly contradicted each other: one forbade declaring
  `remotes`/`fetch` outright, the other required exactly that, and neither delta ever
  reconciled the two. `openspec validate` does not catch this — it checks structure,
  not cross-spec semantics. Fixed with a `MODIFIED` delta on the older spec. The
  `connect-forge-trigger-to-integration-service` change also had two stale numbers
  fixed: five failure modes (there are six) and three trace lines (there are four).

### Not done, after evaluation
- **Closing the loop against a stand-in receiver.** It was built and it worked: the
  local receiver exposed through a tunnel, verified end to end with a real HTTP POST
  returning the exact contract. Reverted deliberately — declaring `remotes` turns the
  connection from *described* into *executed*, which is precisely what acceptance
  criterion 5 excludes. The path is proven and needs no new code if it is ever wanted.

### Gap closed
- A ticket carrying a **long description and an attachment** was processed from real
  Jira (`DTJF-2`). Ten markers were planted — an invented name, email, phone, IBAN,
  amount, the description marker, the attachment marker, the filename and two words
  from the title. **Zero reached the trace.**

  The reason is more interesting than the sanitizer working: **Jira does not deliver
  those fields to a trigger.** The real `issueFieldKeys` is a reduced set — `created`,
  `creator`, `fixVersions`, `issuetype`, `project`, `reporter`, `status`, `summary`,
  `updated`. No `description`, no `attachment`, no custom fields. That is why
  `descriptionPresent` reports `false` for a ticket whose description is long.

  Two barriers, not one: Jira does not send it, and the allowlist would not pass it.
  The attachment leaves only `{"field":"Attachment","fieldId":"attachment",
  "fieldtype":"jira"}` — that something was attached, never what.

  Scoped caveat: this holds for the default trigger payload.
  `payload.include.propertyPaths` can request more fields; if used, repeat the check.

  The trace of that ticket is kept as evidence.

## [0.3.0] - 2026-08-17 — Deployed to a real Jira and verified end to end

The milestone of this release: **Jira fires the trigger on its own.** Until now the
handler had only ever been invoked by hand from a local script.

App version deployed to Forge: `2.1.0`. Site: a personal Atlassian instance,
project `DTJF`. No corporate data involved.

### Added
- Version control. The project was not a git repository; a baseline commit was taken
  before touching anything. Internal working files are excluded via `.git/info/exclude`
  (local only, not `.gitignore`), so they stay on disk and out of history.
- `.forgeignore`, so the deployment package excludes build output, tests, working
  documentation and backups. Verified by pattern simulation: the eleven files Forge
  needs are included, everything else is not.
- `scripts/demo-local.js` scenarios `listen` and `send`, which keep a local HTTP
  receiver alive on a fixed port so the outgoing request can be inspected in a browser.
  Deliberately kept out of the `all` scenario registry: `listen` never terminates and
  would hang the suite.
- The main evidence file — the real trace, twenty log lines from a
  live Jira instance.
- `contexto_para_proyectos/pruebas-manuales-forge-real.md` — twelve step-by-step
  manual tests, from a clean checkout to watching the trigger fire, each with the
  command to copy, the real captured output, and what it proves.
- Project filter, verified in both directions.

### Changed
- `manifest.yml`: removed the `environment` block, `permissions.external.fetch` and
  `remotes`. None were needed and two were invalid — `environment` is not part of the
  documented manifest schema, and `remotes[].baseUrl` does not support variable
  interpolation. Their removal is also what keeps this phase inside the task's scope.
- `manifest.yml`: added `filter.expression` scoped to one project, plus
  `onError: RECEIVE_AND_LOG`. Written only after observing a real event, to avoid a
  syntactically valid expression that silently never matches.
- Documentation realigned with the task brief. The integration proposal previously claimed the
  `integration-service` connection was already implemented; the brief asks for it to
  be documented without doing it yet, and acceptance criterion 5 requires it described
  but not executed.
- The design documents now carry findings that could only come from a
  real deployment.

### Fixed
- Stale hook wiring in local settings referenced scripts that had been deleted,
  producing a missing-file error at the end of every turn.
- Two documentation links pointed at a file that no longer exists.

### Security
- No token, API key or secret is written to the repository, documentation, logs,
  evidence files or commit messages.
- Verified against the real trace: zero occurrences of the ticket title, the person's
  name or their email address. The title appears only as `[redacted:N]`, the actor only
  as a truncated hash.
- **The allowlist design held against reality.** The real payload carried fields the
  fixtures never contained — `creator`, `reporter`, `fixVersions`, `associatedUsers`,
  `atlassianId`, `permissions`, `contextToken`. None reached the built message. Nobody
  had to anticipate them.
- The app declares one scope, `read:jira-work`, and no egress at all. It cannot write
  to Jira and does not send data anywhere.

### Findings worth carrying forward
- **Event delivery is unordered.** The update event was logged before the creation
  event, despite happening after it.
- **One ticket produced three invocations.** Creating it and moving it once was enough.
  Without deduplication that would be three sends of the same ticket.
- **`forge logs` serves entries with a delay.** A narrow query run immediately after an
  action returned nothing for an event that had in fact fired. Widen the window before
  concluding anything.
- **Fields are not guaranteed.** `priorityName` arrived `null` because the test project
  has no priority field configured.
- **`forge register` requires a Developer Space** and does not say so until it fails.
- **A first deployment can already be a major version.** Declaring `read:jira-work` for
  the first time was enough to reach 2.0.0.

### Not done, deliberately
- The connection to `integration-service` is described but not executed, per the task
  brief. The client exists and is tested locally; it has never run against the service.
- Nothing proves this works in the corporate Jira. The test site is personal: no
  corporate proxy, no admin-consent friction, a different field schema.

## [0.1.0] - 2026-08-14

### Added
- Local implementation complete: TypeScript event handlers, PII sanitization, test suite
- Event handlers: issue-created, issue-updated
- Sanitization layer (`sanitize.ts`) with PII canary tests
- Test suite validation: typecheck ✅, lint ✅, tests ✅
- Documentation suite: design docs, integration proposal, runbook, evidence structure
- graphify AST indexing for codebase navigation
- OpenSpec change staged (not yet archived)
- Acceptance criteria table in README

### Changed
- Initial scaffolding → functional demo codebase

### Security
- PII scrubbing enforced via test canaries
- No credentials, tokens, or sensitive data in source
- Event payloads validated for future agent system integration

### Notes
- **Status at the time**: local validation green, Forge deployment blocked pending
  authentication. Superseded by 0.3.0, where the deployment was completed.
- **Demo Scope**: Captures events, sanitizes, builds payload. No outbound integration.

## [0.0.1] - 2026-08-13

### Added
- Project initialization
- Forge app manifest
- Node.js project structure (TypeScript)
- graphify integration
- Development scripts (build, lint, test)

### Notes
- Project skeleton only at this version
