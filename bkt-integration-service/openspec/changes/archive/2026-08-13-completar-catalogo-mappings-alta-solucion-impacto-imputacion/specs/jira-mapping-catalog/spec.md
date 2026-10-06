## ADDED Requirements

### Requirement: Expand the Jira mapping catalog by functional sections
The system MUST support extending the Jira to internal-ticket mapping catalog by functional sections from the approved functional model.
The catalog MUST represent each relevant field from `Alta`, `Solucion`, `Impacto`, and `Imputacion` as an individual decision before it can become a loadable mapping.
The catalog MUST NOT use a generic mapping for a complete section.

#### Scenario: Functional section is reviewed field by field
- **WHEN** a new functional section is added to the mapping catalog
- **THEN** each field in that section is documented independently
- **AND** each field has an explicit decision of `confirmed`, `pending-validation`, or `excluded`
- **AND** only confirmed fields can be promoted to loadable mappings

#### Scenario: Section-level mapping is rejected
- **WHEN** a proposed mapping attempts to map a whole functional section or the whole Jira `fields` object
- **THEN** the catalog rejects that mapping
- **AND** the section must be split into individual field decisions

### Requirement: Require evidence for confirmed mappings
The catalog MUST require verifiable evidence before a Jira field is marked as a confirmed mapping.
Confirmed mappings MUST include a concrete Jira source path, an internal target path, a transformer, requiredness, description, options, and evidence notes.
The catalog MUST NOT invent `customfield_XXXXX` identifiers.

#### Scenario: Confirmed customfield has evidence
- **WHEN** a mapping uses a Jira `customfield_XXXXX`
- **THEN** the catalog includes evidence proving the field identity and structure
- **AND** the mapping includes the exact `sourceField` path to read
- **AND** the mapping includes the agreed `targetField`

#### Scenario: Customfield lacks evidence
- **WHEN** a customfield candidate does not have enough evidence
- **THEN** it remains outside the loadable mappings
- **AND** it is documented as `pending-validation`

### Requirement: Keep pending and excluded candidates separate from loadable mappings
The catalog MUST keep `pending-validation` and `excluded` candidates separate from mappings that can be loaded into MongoDB.
Only mappings classified as `confirmed` MAY appear in the loadable mapping list.

#### Scenario: Pending field is not loadable
- **WHEN** a functional field is still pending validation
- **THEN** it is documented in the section matrix
- **AND** it does not appear as a loadable mapping in `catalog.json`

#### Scenario: Excluded field is documented but not loaded
- **WHEN** a field is excluded from regular mappings
- **THEN** the exclusion reason is documented
- **AND** no MongoDB-compatible mapping is produced for that field

### Requirement: Exclude unsupported child collections from regular mappings
The catalog MUST document when a functional section requires child collections or array expansion that the current mapping engine does not support.
The catalog MUST NOT create partial regular mappings that imply full support for unsupported child collections.
`timeEntries[]` MUST remain blocked from regular loadable mappings until a dedicated implementation is approved.

#### Scenario: Imputation requires time entries
- **WHEN** the `Imputacion` section contains `timeEntries[]`
- **THEN** the catalog documents the limitation of the current mapping engine
- **AND** no regular loadable mapping is created for `timeEntries[]`
- **AND** the pending decision explains the future implementation needed

### Requirement: Preserve current status naming
The catalog MUST use `content.status` as the destination for Jira status.
The catalog MUST NOT introduce or restore `content.statusSp`.

#### Scenario: Jira status is mapped
- **WHEN** a Jira status field is represented in the catalog
- **THEN** the destination is `content.status`
- **AND** no mapping uses `content.statusSp`

### Requirement: Document unresolved decisions explicitly
The catalog MUST record unresolved mapping decisions in human-readable matrices.
Each pending decision MUST describe the evidence or functional confirmation required to complete it.

#### Scenario: Field cannot be resolved yet
- **WHEN** a field from `Alta`, `Solucion`, `Impacto`, or `Imputacion` cannot be confirmed
- **THEN** the section matrix records why it remains pending
- **AND** the matrix states what evidence is needed before promotion to `catalog.json`
