## MODIFIED Requirements

### Requirement: Align the Jira mapping catalog with Datos basicos
The system MUST align the versioned Jira mapping catalog with the 27 fields defined by the functional form section `1.- Datos basicos`.
The system MUST account for each functional field even when the field is not a direct MongoDB mapping.

#### Scenario: Every basic-data field has a decision
- **WHEN** the catalog is reviewed against `Datos basicos`
- **THEN** each of the 27 functional fields is present in the decision matrix
- **AND** each field has one of these states: `mapped`, `pending-validation`, `derived`, `parametrized`, or `excluded`
- **AND** the decision explains why the field is mapped or not mapped

### Requirement: Reflect the corrected 27-field form inventory
The system MUST use the corrected field inventory from the functional form.
The system MUST include `Hora del incidente` and `Usuario o numero de persona afectada`.
The system MUST NOT replace those fields with unrelated parametrization fields.

#### Scenario: Corrected field list is reviewed
- **WHEN** the `Datos basicos` matrix is generated
- **THEN** it includes fields 26 and 27 as `Hora del incidente` and `Usuario o numero de persona afectada`
- **AND** it keeps `Usuarios informados` and `Reasignacion` out of the 27-field inventory unless later confirmed as fields from this section

### Requirement: Do not invent Jira custom fields
The system MUST NOT create mappings that use unconfirmed Jira `customfield_*` identifiers.
The system MUST mark fields as `pending-validation` when the functional field is known but the Jira source field is not confirmed.

#### Scenario: Functional field lacks a confirmed Jira source
- **WHEN** a field from `Datos basicos` needs a Jira custom field
- **AND** no payload or Jira metadata confirms the `customfield_*` id
- **THEN** the catalog marks the field as `pending-validation`
- **AND** no Mongo-compatible mapping is generated for that field yet

### Requirement: Preserve field-by-field mapping discipline
The system MUST continue defining mappings one field at a time.
The system MUST NOT define a generic mapping for the whole Jira `fields` object.

#### Scenario: A broad fields mapping is proposed
- **WHEN** a proposed mapping uses `fields` as a generic source for a full section
- **THEN** the catalog rejects the proposal
- **AND** the section is split into individual field decisions

### Requirement: Keep status naming aligned with the current internal model
The system MUST use `content.status` as the destination for Jira status.
The system MUST NOT reintroduce `content.statusSp`.

#### Scenario: Jira status is mapped
- **WHEN** Jira status is included in the catalog
- **THEN** the target field is `content.status`
- **AND** no mapping uses `content.statusSp`

### Requirement: Separate priority from business urgency until validated
The system MUST NOT assume that Jira priority is the same as the business fields `Es Urgente` or `Grado de urgencia`.
The system MUST document `fields.priority.name -> content.severityLevel` as a separate decision unless business validation confirms equivalence.

#### Scenario: Severity and urgency are reviewed
- **WHEN** the catalog compares `fields.priority.name` with `Es Urgente` and `Grado de urgencia`
- **THEN** it keeps the current priority mapping separate
- **AND** it records the urgency fields as `pending-validation` until their source fields and meaning are confirmed

### Requirement: Keep unresolved fields out of direct mappings
The system MUST distinguish confirmed direct payload mappings from unresolved fields.
The system MUST NOT load unresolved fields as direct MongoDB mappings unless a concrete Jira source field is confirmed.

#### Scenario: Field source is unknown
- **WHEN** a field such as `Pais afectado`, `Aplicacion afectada`, `Entorno`, `Codigo proyecto`, `Hora del incidente`, or `Usuario afectado` lacks a confirmed Jira source
- **THEN** the catalog marks it as `pending-validation`
- **AND** it does not create a direct mapping for MongoDB

### Requirement: Keep attachments outside regular mappings
The system MUST keep attachments outside the regular field mapping catalog.
The system MUST document attachments as an excluded regular mapping because their content is processed by the attachment flow and stored under `content.attachedDocuments`.

#### Scenario: Attachment field is reviewed
- **WHEN** `Adjuntos` is reviewed from `Datos basicos`
- **THEN** it is marked as `excluded` from regular mappings
- **AND** the reason references the attachment processing flow

### Requirement: Keep the catalog grouped by context
The system MUST confirm whether the functional form belongs to the existing `tenantId/projectId/itsmId` context before changing `catalog.json`.
The system MUST create a separate context folder if the functional form belongs to a different Jira context.

#### Scenario: Context is not confirmed
- **WHEN** the form context is unclear
- **THEN** the catalog update is blocked from changing the existing context as confirmed data
- **AND** the uncertainty is recorded as a validation question
