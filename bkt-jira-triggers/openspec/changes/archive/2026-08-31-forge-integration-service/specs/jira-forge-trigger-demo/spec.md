## MODIFIED Requirements

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
