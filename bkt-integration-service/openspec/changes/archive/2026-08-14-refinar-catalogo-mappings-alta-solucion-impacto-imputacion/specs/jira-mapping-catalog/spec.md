## ADDED Requirements

### Requirement: Audit Jira evidence before confirming functional mappings

The catalog MUST record whether Jira evidence exists for every field from Alta, Solucion, Impacto, and Imputacion before the field is classified as a confirmed mapping.
The catalog MUST treat `ejemplo_ticket.json` as the internal target shape and MUST NOT treat it as Jira source evidence.
The catalog MUST NOT confirm a `customfield_*` mapping without sanitized Jira evidence that proves the field identity and read path.

#### Scenario: Field has Jira evidence

- **WHEN** a functional field has sanitized Jira payload or Jira metadata evidence
- **THEN** the catalog records the evidence source
- **AND** the field can be evaluated for promotion to `confirmed`

#### Scenario: Field lacks Jira evidence

- **WHEN** a functional field only appears in the internal target example
- **THEN** the catalog keeps the field as `pending-validation`
- **AND** no loadable mapping is created for that field

#### Scenario: Customfield is proposed without proof

- **WHEN** a mapping proposes a `customfield_*` source without sanitized evidence
- **THEN** the catalog rejects confirmation of that mapping
- **AND** the field remains outside the loadable mappings

### Requirement: Document functional sections with human-readable matrices

The catalog MUST document Alta, Solucion, and Impacto in separate human-readable matrices.
Each matrix MUST include functional field name, Jira source candidate, internal target field, evidence availability, decision state, and review notes.
Imputacion MUST be documented separately when it depends on `timeEntries[]`.

#### Scenario: Section matrix is created

- **WHEN** a functional section is reviewed
- **THEN** its matrix lists every field from that section
- **AND** each field has a decision of `confirmed`, `pending-validation`, or `excluded`
- **AND** each field records whether evidence is available

#### Scenario: Imputation depends on time entries

- **WHEN** the Imputacion section requires `timeEntries[]`
- **THEN** the catalog documents the limitation in `imputacion-timeentries.md`
- **AND** the catalog does not represent the section as a normal flat mapping

### Requirement: Mark unsupported mapping shapes as engine-blocked

The catalog MUST mark fields that cannot be processed by the current declarative mapping engine with `engine-blocked: true`.
This marker MUST be separate from the evidence decision.
Fields marked as `engine-blocked: true` MUST NOT be inserted into the loadable `mappings` list.

#### Scenario: Array fan-out is required

- **WHEN** a field requires expanding source array elements into child objects
- **THEN** the field is marked with `engine-blocked: true`
- **AND** the field remains outside loadable mappings

#### Scenario: Field lacks evidence and is also blocked by engine

- **WHEN** a field has no Jira evidence and also requires an unsupported mapping shape
- **THEN** the catalog records both `pending-validation` and `engine-blocked: true`
- **AND** the notes explain both reasons separately

### Requirement: Verify confirmed mappings against sanitized Jira samples

The catalog MUST require every newly confirmed mapping to be checked against sanitized Jira evidence before it is treated as ready for loading.
The check MUST verify that the declared `sourceField`, `targetField`, and `transformer` produce the expected internal value.

#### Scenario: Confirmed mapping is checked

- **WHEN** a field is promoted to `confirmed`
- **THEN** the catalog records that the mapping was checked against sanitized Jira evidence
- **AND** the expected translated value is documented or referenced

#### Scenario: Mapping fails the check

- **WHEN** a proposed confirmed mapping does not produce the expected translated value
- **THEN** it is not promoted to loadable mappings
- **AND** the field remains `pending-validation` with a note explaining the mismatch

### Requirement: Keep MongoDB loading out of this catalog refinement

This catalog refinement MUST NOT modify MongoDB, runtime code, endpoints, Docker, environment variables, or OpenAPI contracts.
The catalog MUST keep future loadable mappings in documentation until a separate loading task is approved.
Documentary fields and evidence metadata MUST NOT be treated as MongoDB payload fields.

#### Scenario: Catalog is refined

- **WHEN** this change is applied
- **THEN** only documentation and catalog files under `docs/mappings/` are changed
- **AND** no MongoDB collection is created or updated
- **AND** no runtime application file is changed

#### Scenario: Future loader prepares MongoDB documents

- **WHEN** a later approved task prepares mapping documents for MongoDB
- **THEN** documentary fields such as evidence metadata are removed
- **AND** pending, excluded, and engine-blocked candidates are not inserted

### Requirement: Preserve status target naming

The catalog MUST continue using `content.status` as the target field for Jira status.
The catalog MUST NOT introduce `content.statusSp` in confirmed, pending, excluded, or engine-blocked entries.

#### Scenario: Status is searched in the catalog

- **WHEN** a reviewer searches all catalog files for `content.statusSp`
- **THEN** no catalog entry uses that target field
- **AND** Jira status remains represented as `content.status`
