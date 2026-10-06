## ADDED Requirements

### Requirement: Maintain a complete basic-data field dictionary
The documentation MUST maintain one ordered dictionary entry for each of the 27 fields in the functional section `1.- Datos basicos`.
Each entry MUST use exactly one decision: `confirmed`, `pending-validation`, or `excluded`.

#### Scenario: Dictionary coverage is reviewed
- **WHEN** the Jira field dictionary is validated
- **THEN** it contains exactly the 27 functional fields in their documented order
- **AND** every field has one allowed decision

### Requirement: Resolve Jira fields from verifiable evidence
The documentation MUST NOT mark a Jira field as `confirmed` unless its Jira identifier, functional meaning, observed value shape, read path, and internal destination are supported by evidence.
A value observed without field metadata or functional confirmation MUST remain `pending-validation`.

#### Scenario: Custom field value is ambiguous
- **WHEN** a payload shows a value for `customfield_XXXXX` but does not identify its functional name
- **THEN** the field remains `pending-validation`
- **AND** no Mongo-compatible mapping is generated from that observation

#### Scenario: Custom field has complete evidence
- **WHEN** Jira metadata identifies the field name and schema
- **AND** a sanitized payload confirms its value shape
- **AND** its functional meaning and internal destination are confirmed
- **THEN** the dictionary marks the field as `confirmed`
- **AND** records the evidence and exact read path

### Requirement: Preserve evidence without sensitive data
Evidence files MUST exclude credentials, authorization headers, cookies, personal identities, real email addresses, sensitive comments, attachment content, and complete internal URLs.
Evidence MUST retain only the structural information required to justify field resolution.

#### Scenario: Jira response is prepared as evidence
- **WHEN** a real Jira response is selected for documentation
- **THEN** sensitive and personal values are removed or replaced before the file is versioned
- **AND** field identifiers, approved names, schemas, shapes, and synthetic values remain reviewable

### Requirement: Derive read paths from the observed Jira shape
Every confirmed field MUST declare a `readPath` compatible with its observed Jira structure.
Object options MUST read their `value`, while text, date, user, and array fields MUST document their own representation explicitly.

#### Scenario: Option field is confirmed
- **WHEN** a confirmed Jira field is represented as an object containing `value`
- **THEN** its read path ends in `.value`

#### Scenario: Person field representation is undecided
- **WHEN** it is not confirmed whether the consumer needs Jira account ID, display name, or email
- **THEN** the field remains `pending-validation`
- **AND** no person mapping is promoted to the catalog

### Requirement: Separate evidence candidates from consumable mappings
The field dictionary MUST contain confirmed, pending, and excluded decisions, while `catalog.json` mappings MUST contain only confirmed field mappings.
Pending and excluded entries MUST NOT be emitted as Mongo-compatible mappings.

#### Scenario: Pending field is reviewed
- **WHEN** a field lacks sufficient evidence
- **THEN** it remains visible in the dictionary and human review documents
- **AND** it is absent from the `mappings` array of `catalog.json`

### Requirement: Preserve field-by-field catalog rules
Every promoted mapping MUST represent one source field and one destination field.
The catalog MUST NOT introduce a generic mapping for the complete Jira `fields` object.

#### Scenario: Broad mapping is proposed
- **WHEN** a proposed mapping uses `fields` as the source for a complete internal section
- **THEN** the proposal is rejected
- **AND** the decision is split into individual field mappings

### Requirement: Preserve current status and attachment boundaries
Jira status MUST target `content.status` and MUST NOT target `content.statusSp`.
Attachments MUST remain excluded from regular mappings because they are processed by the attachment flow into `content.attachedDocuments`.

#### Scenario: Status mapping is validated
- **WHEN** the catalog mappings are checked
- **THEN** any Jira status mapping targets `content.status`
- **AND** no mapping targets `content.statusSp`

#### Scenario: Attachment decision is validated
- **WHEN** the `Adjuntos` field is reviewed
- **THEN** it is marked `excluded` from regular mappings
- **AND** its decision references the specialized attachment processing flow

### Requirement: Keep resolution scoped to the Jira context
Every evidence set and field dictionary MUST identify the mapping context to which it applies.
An identifier observed in one Jira project or issue type MUST NOT be confirmed for another context without supporting evidence.

#### Scenario: Evidence context does not match the catalog
- **WHEN** the project, issue type, or integration context of the evidence cannot be matched to the catalog
- **THEN** the affected fields remain `pending-validation`
- **AND** the existing context catalog is not changed

### Requirement: Keep the change documentary
This change MUST NOT modify application source code, MongoDB data, collections, credentials, or environment configuration.

#### Scenario: Documentation is applied
- **WHEN** all documentation tasks are completed
- **THEN** changes are limited to `docs/mappings` and this OpenSpec change
- **AND** no database operation or source-code modification has occurred
