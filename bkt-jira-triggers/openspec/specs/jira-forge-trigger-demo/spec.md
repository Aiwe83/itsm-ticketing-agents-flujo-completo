# jira-forge-trigger-demo Specification

## Purpose
TBD - created by archiving change add-jira-forge-trigger-demo. Update Purpose after archive.
## Requirements
### Requirement: Standalone Jira Forge Demo Project
The system SHALL provide a standalone Jira Forge demo project that is separate from `integration-service` and owns its own manifest, package metadata, source files, tests, documentation, and evidence.

#### Scenario: Demo is isolated from integration-service
- **WHEN** the implementation is inspected
- **THEN** no source file SHALL import from `integration-service`
- **AND** no implementation change SHALL be made inside the `integration-service` repository
- **AND** the `POST /api/v1/issues` endpoint SHALL remain unchanged

#### Scenario: Demo has its own project structure
- **WHEN** the standalone demo is implemented
- **THEN** it SHALL include its own `package.json`, `manifest.yml`, TypeScript configuration, test configuration, source folder, documentation folder, and evidence folder

### Requirement: Jira Issue Trigger Capture
The system SHALL configure Jira Forge triggers to capture Jira issue creation and update events in a development Jira Cloud site.

#### Scenario: Final manifest subscribes to required events
- **WHEN** the final `manifest.yml` is inspected
- **THEN** it SHALL include `avi:jira:created:issue`
- **AND** it SHALL include `avi:jira:updated:issue`
- **AND** it SHALL use a single function handler for the demo trigger

#### Scenario: Temporary spike events are removed
- **WHEN** final validation is performed
- **THEN** any temporary phase-0 event subscriptions used only for payload-shape observation SHALL be removed from the final manifest

#### Scenario: Jira trigger can be observed
- **WHEN** a test issue is created or updated in the development Jira site after deploy and install
- **THEN** the demo SHALL produce evidence showing a real trigger invocation for the event

### Requirement: No Outbound Integration During Demo
The system MUST remain in a no-egress at-rest state unless an outbound connection is explicitly declared for an active `forge-to-integration-service` demo. When egress is active, it MUST be limited to the approved `integration-service` HTTPS destination, backed by Forge runtime variables, and followed by a return to the at-rest state after evidence capture.

#### Scenario: Manifest has no egress
- **WHEN** the manifest is inspected outside an active `integration-service` demo
- **THEN** it MUST NOT declare `permissions.external`
- **AND** it MUST NOT declare `remotes`

#### Scenario: Egress is limited to the integration-service demo
- **WHEN** the manifest declares `remotes` or `permissions.external.fetch.backend` for TICK-17
- **THEN** it MUST declare exactly the approved HTTPS destination for `integration-service`
- **AND** the outbound send MUST use Forge runtime configuration for the service base URL and API key
- **AND** secrets MUST NOT be hardcoded in source files, manifest comments, repository docs, logs, or evidence

#### Scenario: Source does not fetch
- **WHEN** source files are inspected outside the active `forge-to-integration-service` capability
- **THEN** any outbound fetch path MUST be limited to the documented `forge-to-integration-service` client behavior
- **AND** it MUST send only the validated single-issue contract payload
- **AND** it MUST preserve sanitized logging and controlled failure handling

### Requirement: Sanitized Event Tracing
The system SHALL log only sanitized Jira event information using allowlisted fields and derived metadata.

#### Scenario: Sensitive Jira data is not logged
- **WHEN** an event contains summary text, description text, email addresses, display names, avatar URLs, attachment data, Atlassian host URLs, account identifiers, or unknown fields
- **THEN** the logged output SHALL NOT contain those raw values

#### Scenario: Unknown future fields are dropped
- **WHEN** an event contains an unrecognized field with a canary value
- **THEN** the sanitized output SHALL NOT contain the unknown key's raw value

#### Scenario: Changelog is minimized
- **WHEN** an updated issue event contains changelog items
- **THEN** the sanitized output SHALL include only safe changelog field metadata such as field names or field IDs
- **AND** it SHALL NOT include raw previous or new field values

### Requirement: Structured Handler Logs
The system SHALL emit three structured JSON log lines for each handled Jira trigger invocation.

#### Scenario: Handler emits three log records
- **WHEN** the handler receives a Jira issue event
- **THEN** it SHALL log `jira.event.received`
- **AND** it SHALL log `jira.event.shape`
- **AND** it SHALL log `jira.contract.payload.built`

#### Scenario: Handler correlates a single invocation
- **WHEN** the handler logs the three records for one invocation
- **THEN** each record SHALL include the same invocation-level correlation identifier

#### Scenario: Handler records event date source
- **WHEN** event date fields are available
- **THEN** the handler SHALL derive the event date from Jira fields in priority order
- **AND** it SHALL record the source used
- **AND** if no parseable Jira date exists, it SHALL fall back to the received time

### Requirement: Future Integration Contract Builder
The system SHALL build a local future `integration-service` issue request payload as a pure function and SHALL NOT send it.

#### Scenario: Builder creates one issue request
- **WHEN** a valid Jira issue event with key and summary is processed
- **THEN** the builder SHALL return an ok result
- **AND** the request SHALL contain an `issues` array with exactly one item

#### Scenario: Builder rejects missing required data
- **WHEN** the event is missing issue fields, issue key, or summary
- **THEN** the builder SHALL return a non-ok result with a specific reason
- **AND** it SHALL NOT emit a payload marked valid

#### Scenario: Builder follows local contract constraints
- **WHEN** strings exceed known contract limits or contain forbidden control characters
- **THEN** the builder SHALL normalize them according to the local contract snapshot
- **AND** it SHALL preserve tab, newline, and carriage return characters where permitted

### Requirement: Tests Prove Safety and Contract Behavior
The system SHALL include automated tests that prove sanitizer, contract builder, and handler behavior.

#### Scenario: Canary values cannot leak
- **WHEN** poisoned fixtures contain unique canary values
- **THEN** tests SHALL assert that captured console output and sanitized objects do not contain those canaries

#### Scenario: Contract output is validated
- **WHEN** contract-builder tests run
- **THEN** valid builder output SHALL pass the local schema
- **AND** invalid source data SHALL produce explicit failure reasons

#### Scenario: Handler logging is deterministic enough to verify
- **WHEN** handler tests capture console output
- **THEN** they SHALL verify the three expected event names, shared correlation identifier, and absence of forbidden content

### Requirement: Documentation and Evidence
The system SHALL provide documentation that allows a reviewer to understand, run, validate, and evaluate the demo without reading local planning documents.

#### Scenario: README maps acceptance criteria
- **WHEN** a reviewer opens `README.md`
- **THEN** it SHALL include a table mapping the five acceptance criteria to concrete artifacts and verification steps

#### Scenario: Runbook documents Forge workflow
- **WHEN** a reviewer reads the runbook documentation
- **THEN** it SHALL explain Forge login, deploy, install, tunnel, logs, expected delays, and manifest redeploy requirements

#### Scenario: Future integration is described but not implemented
- **WHEN** a reviewer reads the future integration documentation
- **THEN** it SHALL describe transport, auth storage, idempotency, rate-limit, and roadmap considerations
- **AND** it SHALL state that the demo does not execute the integration

#### Scenario: Evidence is captured after real validation
- **WHEN** Forge deploy/install and Jira event generation are completed
- **THEN** real sanitized log output SHALL be stored under `docs/evidence/` with date and issue reference metadata

