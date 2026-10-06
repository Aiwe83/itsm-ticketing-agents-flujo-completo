## MODIFIED Requirements

### Requirement: Version Jira field mappings as a catalog
The system MUST define a versioned catalog for Jira to internal-ticket mappings.
The catalog MUST be organized by `tenantId`, `projectId`, and `itsmId`.
The catalog MUST use JSON as the future source of truth for MongoDB loading.
The catalog MAY include a Markdown summary for human review, but Markdown MUST NOT be the source used for automated loading.

#### Scenario: Catalog is grouped by context
- **WHEN** mappings are documented for a specific tenant, project, and ITSM context
- **THEN** the catalog stores them under a context-specific folder
- **AND** the context identity is explicit enough to generate MongoDB `mappings` documents

#### Scenario: JSON is the loading source
- **WHEN** a future loading process imports mappings
- **THEN** it reads `catalog.json`
- **AND** it does not parse `catalog.md`

### Requirement: Define mappings field by field
The system MUST document one mapping per relevant source field.
The system MUST NOT document a generic mapping for the whole Jira `fields` object.
Each mapping MUST include `sourceField`, `targetField`, `transformer`, `required`, `description`, and `options`.
Each mapping SHOULD include documentary evidence under `_evidence`.

#### Scenario: Mapping has the minimum required shape
- **WHEN** a mapping is added to the catalog
- **THEN** it includes `sourceField`
- **AND** it includes `targetField`
- **AND** it includes `transformer`
- **AND** it includes `required`
- **AND** it includes `description`
- **AND** it includes `options`

#### Scenario: Generic field mapping is rejected
- **WHEN** a proposed mapping points from `fields` to a broad internal object
- **THEN** the catalog rejects it
- **AND** the field must be split into individual mappings

### Requirement: Track mapping evidence and validation state
The system MUST distinguish confirmed mappings from mappings pending validation.
The system MUST document the evidence source for each mapping decision.
The system MUST allow mappings based on `ticket-example`, `mapping-example`, or `translated-ticket-example` evidence.

#### Scenario: Mapping is confirmed
- **WHEN** a mapping has enough evidence from the available examples
- **THEN** `_evidence.confidence` is `confirmed`
- **AND** `_evidence.notes` explains the reason briefly

#### Scenario: Mapping needs validation
- **WHEN** a field looks relevant but lacks enough evidence
- **THEN** `_evidence.confidence` is `pending-validation`
- **AND** the notes describe what must be confirmed before loading it into MongoDB

### Requirement: Generate MongoDB-compatible mapping documents
The catalog MUST preserve the data needed to create MongoDB `mappings` documents.
The catalog MUST preserve `sourceField`, `targetField`, `transformer`, `required`, `description`, `options`, `tenantId`, `projectId`, and `itsmId`.
Documentary fields prefixed with `_` MUST NOT be inserted into MongoDB.

#### Scenario: Documentary fields are excluded from MongoDB payload
- **WHEN** a future loader prepares a mapping document for MongoDB
- **THEN** it removes `_evidence`
- **AND** it preserves the fields required by the `Mapping` model

### Requirement: Keep translated status aligned with Jira naming
The catalog MUST use `content.status` as the internal target for Jira status.
The catalog MUST NOT introduce or recover `content.statusSp`.

#### Scenario: Status mapping uses the current target field
- **WHEN** Jira status is mapped
- **THEN** the target field is `content.status`
- **AND** no catalog entry uses `content.statusSp`

### Requirement: Exclude fields generated after Jira intake
The catalog MUST exclude fields that are generated later by internal processing when they do not come from the Jira intake payload.
The catalog MUST mark uncertain fields as pending validation instead of inventing mappings.

#### Scenario: Generated diagnostic fields are not mapped from Jira
- **WHEN** a field appears only after internal processing
- **THEN** the catalog does not map it as a Jira source field
- **AND** any related need is recorded as pending validation rather than a confirmed mapping
