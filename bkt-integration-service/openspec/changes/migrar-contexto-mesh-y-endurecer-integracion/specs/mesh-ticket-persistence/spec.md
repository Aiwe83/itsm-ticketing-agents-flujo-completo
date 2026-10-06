## ADDED Requirements

### Requirement: Use meshId as the only active integration context
The service MUST obtain a non-empty `meshId` from the required `MESH_ID` environment variable and MUST persist it in new tickets, executions and mappings. New active documents MUST NOT persist `tenantId`, `projectId` or `itsmId`.

#### Scenario: Service starts without mesh context
- **WHEN** `MESH_ID` is missing or empty
- **THEN** environment validation fails before the HTTP server starts

#### Scenario: Ticket is accepted
- **WHEN** a valid Jira ticket is processed
- **THEN** its raw, translated and execution documents contain the configured `meshId`
- **AND** none contains the three removed context fields

### Requirement: Resolve mappings by meshId
The mapping repository MUST select mappings using `meshId` and MUST NOT use the removed context identifiers.

#### Scenario: Mappings exist for another mesh
- **WHEN** MongoDB contains mappings for more than one mesh
- **THEN** a ticket is transformed only with mappings whose `meshId` equals the configured `MESH_ID`

### Requirement: Maintain deterministic one-to-one ticket persistence
The raw document in `itsm_tickets` and translated document in `tickets` MUST use the same deterministic `_id` formatted as `${meshId}:${ticketKey}`. Repeated deliveries MUST update those documents without creating duplicates.

#### Scenario: First valid delivery is processed
- **WHEN** Jira key `PA-205` is accepted under mesh `mesh-a`
- **THEN** one raw and one translated document exist with `_id` equal to `mesh-a:PA-205`

#### Scenario: Delivery is repeated
- **WHEN** the same Jira key is processed again under the same mesh
- **THEN** exactly one raw and one translated document remain
- **AND** both still share the deterministic `_id`

### Requirement: Use the persisted raw-ticket lifecycle
The raw ticket MUST be stored with `status: persisted`, changed to `translated` only after the translated upsert succeeds, and changed to `failed` when mapping or translated persistence fails after raw persistence.

#### Scenario: Translation succeeds
- **WHEN** raw persistence, mapping and translated persistence all succeed
- **THEN** the raw document ends in `translated`

#### Scenario: Mapping fails
- **WHEN** the raw document was persisted but mapping fails
- **THEN** the raw document ends in `failed`
- **AND** the orchestrator is not invoked for that attempt

#### Scenario: Orchestrator fails after translation
- **WHEN** the translated document was persisted and the orchestrator later fails
- **THEN** the raw document remains `translated`
- **AND** the orchestrator error is recorded in the execution

### Requirement: Keep attempt and stored-ticket identifiers distinct
Each processing attempt MUST keep its own `Execution._id`, while `storedTicketId` MUST identify the shared raw/translated `_id`. The existing HTTP `executionId` response field MUST continue to identify the execution record for compatibility.

#### Scenario: Successful request returns correlation data
- **WHEN** a ticket is accepted
- **THEN** the response `executionId` refers to the execution document
- **AND** the ticket result `storedTicketId` refers to `${meshId}:${ticketKey}`
- **AND** the two values are not treated as interchangeable internally

