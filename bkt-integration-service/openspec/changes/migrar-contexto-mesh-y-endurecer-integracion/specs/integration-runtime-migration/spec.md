## ADDED Requirements

### Requirement: Use the new MongoDB database name
The active application configuration MUST connect to the MongoDB database `integration-service`. The former database `caf_agents` MUST remain untouched during migration and the validation window.

#### Scenario: New runtime starts
- **WHEN** the migrated configuration is loaded
- **THEN** all application collections are read from and written to `integration-service`

### Requirement: Provide a safe dry-run and apply migration
The project MUST provide separate dry-run and apply commands. Dry-run MUST perform all validations without writing. Apply MUST require explicit confirmation of the target database and MUST be idempotent.

#### Scenario: Dry-run is executed
- **WHEN** an operator runs the dry-run against `caf_agents`
- **THEN** it reports source counts, planned inserts, updates, unchanged documents and conflicts
- **AND** neither database is modified

#### Scenario: Apply is repeated
- **WHEN** apply has completed successfully and is executed again with the same inputs
- **THEN** migrated documents are reported as unchanged
- **AND** no duplicate ticket or mapping is created

### Requirement: Migrate all related collections consistently
The migration MUST transform `itsm_tickets`, `tickets`, `executions` and `mappings` as one validated dataset. It MUST replace context fields, recalculate ticket IDs, update execution references, convert known dates to BSON `Date` and preserve execution record IDs.

#### Scenario: Valid ticket pair is migrated
- **WHEN** source raw and translated documents represent the same Jira key
- **THEN** destination documents share `${meshId}:${ticketKey}`
- **AND** execution ticket references point to that new ID

#### Scenario: One-to-one relation is inconsistent
- **WHEN** source data contains duplicate or ambiguous raw/translated relations
- **THEN** dry-run reports a conflict
- **AND** apply does not silently choose a document

### Requirement: Keep Docker naming scalable and consistent
Docker Compose MUST use project name `integration-service` and application service name `integration-service`. The Mongo service MUST remain `mongo`, the legacy volume MUST stay available as backup, and the active runtime MUST use a fresh volume when the previous database name would collide by case on the same host. No fixed `container_name` MUST be introduced.

#### Scenario: Compose configuration is rendered
- **WHEN** `docker compose config --services` is executed
- **THEN** it lists `mongo` and `integration-service`

#### Scenario: Application image is rebuilt
- **WHEN** the deployment is recreated with build and force-recreate
- **THEN** the running service uses the current source and new database configuration
- **AND** removed legacy ingestion routes remain unavailable

#### Scenario: Legacy database name exists in the previous volume
- **WHEN** the old volume still contains the historical uppercase database name
- **THEN** the active compose setup mounts a fresh Mongo volume for `integration-service`
- **AND** the legacy volume remains untouched as backup

### Requirement: Preserve rollback capability
The migration MUST leave `caf_agents` and its backup intact until validation is accepted. Rollback MUST consist of restoring the previous image and configuration without requiring reverse mutation of the new database.

#### Scenario: Validation fails after cutover
- **WHEN** an acceptance check fails
- **THEN** operations can point the previous service back to `caf_agents`
- **AND** the source data remains available unchanged

### Requirement: Keep active documentation consistent with the new context
Active documentation, fixtures and pending OpenSpec changes MUST use `meshId` and the new runtime names. Completed OpenSpec changes MUST remain historical and may be marked as belonging to the previous context model without rewriting their original decisions.

#### Scenario: Active references are scanned
- **WHEN** implementation validation searches active code, tests, configuration and documentation
- **THEN** no active runtime dependency on `tenantId`, `projectId`, `itsmId`, their environment variables or `caf_agents` remains
- **AND** historical references are explicitly identified as non-operative

