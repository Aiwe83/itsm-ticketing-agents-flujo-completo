## ADDED Requirements

### Requirement: Execution records dispatched execution ids
The system SHALL persist on the Execution record the list of `storedTicketId` values (the `execution_id`s per the orchestrator contract) that were dispatched to the orchestrator.

#### Scenario: Dispatched tickets are recorded
- **WHEN** a ticket is processed and the orchestrator is dispatched
- **THEN** the Execution document contains `dispatchedExecutionIds` with the `storedTicketId` of the translated ticket

#### Scenario: No dispatch leaves the field absent
- **WHEN** a ticket fails before any orchestrator dispatch
- **THEN** the Execution document has no `dispatchedExecutionIds` value

### Requirement: Traceability persistence is synchronous
The system SHALL await the persistence of `dispatchedExecutionIds` before returning the response, so a traceability failure is visible to the caller.

#### Scenario: Traceability write failure surfaces in the response
- **WHEN** the repository fails to persist `dispatchedExecutionIds`
- **THEN** the request fails with the traceability error instead of silently proceeding

### Requirement: Orchestrator contract is documented
The system SHALL document that `execution_id` in the orchestrator payload is the `_id` of the persisted `itsm_tickets` ticket (`storedTicketId = ${meshId}:${ticketKey}`).

#### Scenario: Contract comment present
- **WHEN** the orchestrator payload serializer is inspected
- **THEN** a comment documents the `execution_id` source contract
