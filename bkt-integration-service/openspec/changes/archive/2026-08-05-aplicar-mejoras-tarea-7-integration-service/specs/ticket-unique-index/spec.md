## ADDED Requirements

### Requirement: Unique meshId + itsmTicketId index on tickets
The system SHALL create a unique index on `{ meshId, itsmTicketId }` in the `tickets` collection, named `meshId_1_itsmTicketId_1`.

#### Scenario: Index exists after ensure
- **WHEN** `ensureDatabaseIndexes` runs against a `tickets` collection without duplicates
- **THEN** the index `meshId_1_itsmTicketId_1` exists with `unique: true`

#### Scenario: Index creation is idempotent
- **WHEN** `ensureDatabaseIndexes` runs twice
- **THEN** only one `meshId_1_itsmTicketId_1` index exists

### Requirement: Duplicate-safe index creation
The system SHALL skip creating the unique index when duplicate `{ meshId, itsmTicketId }` pairs already exist, logging a warning instead.

#### Scenario: Duplicates present skip the index
- **WHEN** the `tickets` collection already contains duplicate `{ meshId, itsmTicketId }` pairs
- **THEN** a warning is logged and the unique index is NOT created
