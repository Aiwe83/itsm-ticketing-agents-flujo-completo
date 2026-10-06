## ADDED Requirements

### Requirement: Send the agreed flat orchestrator payload
For each successfully translated ticket, the service MUST send one flat JSON object containing exactly the business fields `rol`, `ticket_id`, `mesh_id` and `execution_id`.

#### Scenario: Translated ticket is dispatched
- **WHEN** Jira ticket `PA-205` is translated under mesh `mesh-a`
- **THEN** the orchestrator receives `ticket_id` equal to `PA-205`
- **AND** receives `mesh_id` equal to `mesh-a`
- **AND** receives `execution_id` equal to `mesh-a:PA-205`
- **AND** receives `rol` from `ORCHESTRATOR_ROLE`

#### Scenario: Removed context is inspected
- **WHEN** the outgoing body is captured by a mock
- **THEN** it contains no `tenantId`, `projectId`, `itsmId` or `messages` wrapper

### Requirement: Keep naming conventions explicit at the boundary
Application code, TypeScript interfaces and internal parameters MUST use English camelCase. The names `rol`, `ticket_id`, `mesh_id` and `execution_id` MUST exist only in the external orchestrator DTO and serializer because they are mandated by the consumer contract.

#### Scenario: Internal DTO is reviewed
- **WHEN** the orchestrator payload is assembled
- **THEN** internal values use names such as `role`, `ticketId`, `meshId` and `storedTicketId`
- **AND** the serializer converts them to the external field names once

### Requirement: Preserve asynchronous delivery tracing
The Jira POST MUST NOT wait for the orchestrator response. A failed asynchronous delivery MUST be recorded against the correct execution record without changing a successfully translated ticket to failed.

#### Scenario: Orchestrator is slow
- **WHEN** the orchestrator response remains pending
- **THEN** `POST /api/v1/issues` returns its normal `201` after persistence and dispatch scheduling

#### Scenario: Orchestrator rejects the ticket
- **WHEN** the asynchronous request fails
- **THEN** the execution records the sanitized failure
- **AND** the persisted ticket remains translated

