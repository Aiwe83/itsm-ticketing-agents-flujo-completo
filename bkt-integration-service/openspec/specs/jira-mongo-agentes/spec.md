## Purpose
Definir el flujo de ingestion de un unico ticket Jira, su persistencia bruta, traduccion mediante mappings y trazabilidad de la notificacion posterior.

## Requirements

### Requirement: Accept exactly one Jira ticket per request
The system MUST accept `POST /api/v1/issues` requests that contain exactly one ticket inside `issues`.
The system MUST reject requests with zero tickets or more than one ticket.
The system MUST reject legacy payloads that do not follow the Jira ticket shape expected by the current validator.

#### Scenario: One Jira ticket is accepted
- **WHEN** the request body contains exactly one Jira ticket in `issues`
- **THEN** the request is accepted for processing

#### Scenario: Empty or batched input is rejected
- **WHEN** the request body contains zero tickets or more than one ticket
- **THEN** the system returns a validation error

### Requirement: Persist the raw Jira ticket before translation
The system MUST store the incoming Jira ticket in `itsm_tickets` before applying mappings.
The stored raw document MUST preserve the original ticket content so the request can be audited later.

#### Scenario: Raw ticket is stored first
- **WHEN** a valid Jira ticket is received
- **THEN** the original ticket is persisted in `itsm_tickets` before translation starts

#### Scenario: Raw ticket remains auditable after translation failure
- **WHEN** translation fails after the raw ticket was stored
- **THEN** the raw ticket remains persisted for traceability

### Requirement: Translate Jira fields using mappings
The system MUST translate the raw ticket using MongoDB mappings and store the result in `tickets`.
The translated ticket MUST use Jira-aligned field names, including `status` instead of `statusSp`.

#### Scenario: Translated ticket uses Jira-aligned naming
- **WHEN** a ticket is translated successfully
- **THEN** the translated ticket is stored with `status` and not `statusSp`

#### Scenario: Translation is driven by mappings
- **WHEN** a field is present in the mapping configuration
- **THEN** the system uses that mapping to populate the translated ticket

### Requirement: Notify the orchestrator without blocking the HTTP response
The system MUST trigger the agent/orchestrator notification after persistence and translation.
The HTTP response MUST not wait for the orchestrator to finish.
The system MUST record the execution result in `executions` so the attempt remains traceable.

#### Scenario: The request returns before the orchestrator finishes
- **WHEN** the orchestrator is still processing the notification
- **THEN** the ingestion request can already return its HTTP response

#### Scenario: The execution records the orchestration outcome
- **WHEN** the orchestrator succeeds or fails
- **THEN** the corresponding execution record captures that result
