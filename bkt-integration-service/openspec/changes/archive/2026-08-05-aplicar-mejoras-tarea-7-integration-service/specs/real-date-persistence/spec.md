## ADDED Requirements

### Requirement: Raw ticket timestamps are real Dates
The system SHALL persist `createdAt` and `updatedAt` on `itsm_tickets` documents as MongoDB Date values.

#### Scenario: Raw ticket read without lean
- **WHEN** a raw ITSM ticket is read back from the database without `.lean()`
- **THEN** `createdAt` and `updatedAt` are instances of `Date`

### Requirement: Translated ticket timestamps are real Dates
The system SHALL persist `createdAt` and `updatedAt` on `tickets` documents as MongoDB Date values.

#### Scenario: Translated ticket read without lean
- **WHEN** a translated ticket is read back from the database without `.lean()`
- **THEN** `createdAt` and `updatedAt` are instances of `Date`

### Requirement: Execution timestamps are real Dates
The system SHALL persist `startTime` and `endTime` on `Execution` documents as MongoDB Date values.

#### Scenario: Execution read without lean
- **WHEN** an Execution document is read back from the database without `.lean()`
- **THEN** `startTime` and `endTime` are instances of `Date`
