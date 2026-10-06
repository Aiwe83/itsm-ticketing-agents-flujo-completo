## ADDED Requirements

### Requirement: Jira Fires The Trigger Unassisted
The system SHALL be deployed to a real Jira site such that Jira itself invokes the app when an issue is created or updated, with no local script involved.

#### Scenario: A real issue event produces a complete trace
- **WHEN** an issue is created or updated in the target project of a real Jira site
- **THEN** the app SHALL emit `jira.event.received`, `jira.event.shape`, `jira.contract.payload.built` and `jira.integration.response`
- **AND** all four lines SHALL share one `correlationId`
- **AND** the evidence SHALL be captured under `docs/evidence/`

#### Scenario: Event delivery order is not assumed
- **WHEN** several events are produced by one issue
- **THEN** the implementation MUST NOT depend on their arrival order
- **AND** the observed behaviour SHALL be recorded, including that an update event was logged before the creation event that preceded it

### Requirement: The Full Flow Reaches An Accepted Destination
The system SHALL demonstrate that a Jira issue event results in an outbound HTTP request that a destination accepts, without depending on `integration-service`.

#### Scenario: The request is sent and accepted
- **WHEN** an issue event is processed while a destination satisfying the contract is reachable
- **THEN** `jira.integration.response` SHALL report `sent: true`, `success: true` and status `201`
- **AND** `requestIdEcho` SHALL equal the `correlationId` of the same invocation

#### Scenario: The destination is not integration-service
- **WHEN** the demonstration destination is inspected
- **THEN** it SHALL be a stand-in receiver satisfying `POST /api/v1/issues` and returning `successIntegration` and `tickets[0].success` as `true`
- **AND** no implementation change SHALL be made inside `integration-service`

#### Scenario: Egress is declared explicitly and consented
- **WHEN** a destination is declared in the manifest
- **THEN** it SHALL appear under `remotes` with a literal URL, and under `permissions.external.fetch.backend`
- **AND** the resulting major version upgrade SHALL require explicit administrator consent naming the destination

### Requirement: Failure Is Classified, Never Thrown
The system SHALL convert every failure of the outbound call into a classified result, and SHALL distinguish failure modes rather than collapsing them.

#### Scenario: A destination that answers badly
- **WHEN** the destination resolves but returns an error status
- **THEN** the result SHALL report `sent: true`, `success: false` and `errorKind: HTTP` with the concrete status code
- **AND** no exception SHALL propagate

#### Scenario: Failure modes are distinguished
- **WHEN** the classification logic is inspected
- **THEN** it SHALL distinguish `CONFIG`, `NETWORK`, `TIMEOUT`, `HTTP` and `APPLICATION`
- **AND** a destination that does not resolve SHALL classify as `NETWORK`, not as `HTTP`

#### Scenario: A successful status code is not treated as success
- **WHEN** the destination answers `201` but reports internally that nothing was stored
- **THEN** the result SHALL be classified as `APPLICATION` failure

### Requirement: The Flow Is Reproducible Without Any External Dependency
The system SHALL provide a demo runner that exercises the whole path with no Forge session, no Jira site, no external service and no network.

#### Scenario: Offline scenarios cover the path
- **WHEN** the demo runner is executed with the aggregate scenario
- **THEN** it SHALL run creation, update, sanitisation, contract rejection, the five failure modes and a real outbound request to a local receiver
- **AND** it SHALL exit non-zero if any scenario fails

#### Scenario: Sanitisation failure breaks the run
- **WHEN** a poisoned event is processed and any planted marker appears in the trace
- **THEN** the runner SHALL exit non-zero

#### Scenario: Live-inspection scenarios do not block the aggregate run
- **WHEN** scenarios that run until interrupted are provided
- **THEN** they MUST NOT be included in the aggregate scenario registry

### Requirement: The Trigger Is Scoped To One Project
The system SHALL restrict invocation to a single Jira project, and the restriction SHALL be verified in both directions.

#### Scenario: The expression is written against an observed payload
- **WHEN** a project filter expression is added
- **THEN** the field it reads SHALL first have been confirmed present in a real event payload
- **AND** `onError` SHALL be configured so a failed evaluation is recorded rather than silently dropping the event

#### Scenario: Both directions are verified
- **WHEN** the filter is validated
- **THEN** an issue in the target project SHALL produce a trace
- **AND** an issue in a different project SHALL produce none
- **AND** the negative check SHALL be performed before the positive one

### Requirement: Sanitisation Holds Against Real Data
The system SHALL be verified against real Jira events, not only against fixtures.

#### Scenario: No sensitive value reaches the trace
- **WHEN** a real event is processed
- **THEN** the issue title SHALL appear only as `[redacted:N]`
- **AND** the actor SHALL appear only as a truncated hash
- **AND** the changelog SHALL retain field names but no field values

#### Scenario: Unanticipated fields are excluded by default
- **WHEN** a real payload carries fields absent from the fixtures
- **THEN** none of them SHALL reach the built message
- **AND** the allowlist design SHALL be the reason, requiring no change to accommodate them

#### Scenario: Description and attachment content is verified
- **WHEN** an issue carrying a long description and an attachment is processed
- **THEN** no planted marker from either SHALL appear in the trace
- **AND** the evidence SHALL record that the trigger payload does not carry these fields at all

### Requirement: Application Code Is Unchanged
This change SHALL be achieved without modifying application source.

#### Scenario: Source is untouched
- **WHEN** the diff against the baseline commit is inspected for the source folder
- **THEN** it SHALL be empty
