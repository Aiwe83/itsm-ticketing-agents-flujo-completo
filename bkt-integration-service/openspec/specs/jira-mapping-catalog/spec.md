# jira-mapping-catalog Specification

## Purpose

TBD - created by archiving change completar-catalogo-mappings-alta-solucion-impacto-imputacion. Update Purpose after archive.
## Requirements
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

### Requirement: Provide a MongoDB review projection for the mapping catalog

The catalog capability MUST support creating a separate MongoDB review projection of the versioned Jira mapping catalog.
The review projection MUST be stored outside the operative `mappings` collection.
The review projection MUST be regenerated from versioned files and MUST NOT become the source of truth.

#### Scenario: Review projection is generated from Git

- **WHEN** the review projection is generated
- **THEN** the generator reads the versioned mapping catalog and functional model files
- **AND** MongoDB receives a navigable projection for review
- **AND** Git remains the source of truth for mapping decisions

#### Scenario: Review projection is separate from operative mappings

- **WHEN** a reviewer opens MongoDB Compass
- **THEN** the catalog review documents are visible in `mapping_catalog_review`
- **AND** operative mappings remain in `mappings`
- **AND** the runtime service does not read `mapping_catalog_review`

### Requirement: Prevent review documents from being executed as operative mappings

The review projection MUST prevent its documents from being applied by the runtime mapping engine.
Every review document MUST use a non-operational sentinel mesh identifier.
The operative mesh identifier MUST NOT be written into review documents.

#### Scenario: Review document has sentinel mesh

- **WHEN** a review document is inserted or updated
- **THEN** it uses `meshId: REVIEW-NOT-OPERATIONAL`
- **AND** it does not use the runtime mesh identifier
- **AND** it cannot be selected by the operative mapping query for real tickets

### Requirement: Represent mapping review data by document type

The review projection MUST distinguish the purpose of each document with `docType`.
Supported document types MUST include `field`, `model-reference`, `gotcha`, and `example-ticket`.

#### Scenario: Reviewer filters by document type

- **WHEN** a reviewer filters `mapping_catalog_review` by `docType`
- **THEN** they can inspect fields, functional references, gotchas, and the example ticket independently
- **AND** each document type remains understandable in MongoDB Compass

### Requirement: Preserve loadable mapping preview without loading it

Confirmed review field documents SHOULD include `futureMapping` to show the Mongo-compatible mapping that could be loaded later.
The system MUST NOT insert `futureMapping` into the operative `mappings` collection during this review-projection task.

#### Scenario: Confirmed field shows future mapping

- **WHEN** a confirmed field is shown in `mapping_catalog_review`
- **THEN** the document includes `futureMapping`
- **AND** the operative `mappings` collection remains unchanged

### Requirement: Keep review projection safe and idempotent

The review projection MUST be loaded idempotently.
The implementation MUST NOT use `drop()` as part of this task.
The implementation MUST prove that the operative `mappings` collection is unchanged before and after loading the review projection.

#### Scenario: Seed is run repeatedly

- **WHEN** the generated seed is executed multiple times
- **THEN** it updates the same review documents by `_id`
- **AND** it does not create duplicates
- **AND** it does not delete the collection

#### Scenario: Operative mappings are protected

- **WHEN** the review projection is loaded
- **THEN** a before/after comparison of `mappings` shows no content changes
- **AND** `POST /api/v1/issues` continues to work as before

### Requirement: Preserve status target naming in the review projection

The review projection MUST continue using `content.status`.
The review projection MUST NOT include `content.statusSp` in confirmed, pending, excluded, blocked, preview, or example mapping data.

#### Scenario: Status target is checked in review projection

- **WHEN** the generated review seed is validated
- **THEN** no document contains `targetField: "content.statusSp"`
- **AND** any status mapping continues to point to `content.status`

### Requirement: Expose functional model sections in the review projection

The mapping catalog review projection MUST expose functional model sections as readable `model-reference` documents.
Each generated `model-reference` document SHOULD include a `body` field with the sanitized section text when the source section is available.
The review projection MUST keep these documents outside the operative `mappings` collection.

#### Scenario: Functional section is opened in Compass

- **WHEN** a reviewer filters `mapping_catalog_review` by `docType: "model-reference"`
- **THEN** the reviewer can open a document for a functional section
- **AND** the document includes enough readable text to understand that section without opening the source Markdown file
- **AND** the document uses `meshId: "REVIEW-NOT-OPERATIONAL"`

### Requirement: Represent functional notes separately from design notes

The mapping catalog review projection MUST represent notes extracted from the functional model as `gotcha` documents with `scope: "functional"`.
Design warnings or technical review warnings MUST remain distinguishable as `gotcha` documents with `scope: "design"`.

#### Scenario: Functional notes are reviewed

- **WHEN** a reviewer filters `mapping_catalog_review` by `docType: "gotcha"` and `scope: "functional"`
- **THEN** the reviewer sees notes extracted from the functional model
- **AND** those notes include their source section or source path when available
- **AND** they are not mixed with design-only warnings

#### Scenario: Design warnings are reviewed

- **WHEN** a reviewer filters `mapping_catalog_review` by `docType: "gotcha"` and `scope: "design"`
- **THEN** the reviewer sees technical or design warnings about the catalog and review projection
- **AND** those warnings remain separate from functional-model notes

### Requirement: Keep the review projection non-operational

The review projection MUST remain a documentary view and MUST NOT become runtime input.
All generated review documents MUST use the sentinel `meshId: "REVIEW-NOT-OPERATIONAL"`.
The operative `mappings` collection MUST remain unchanged by review projection generation.

#### Scenario: Review projection is generated

- **WHEN** the review seed is generated from versioned files
- **THEN** every generated document uses `meshId: "REVIEW-NOT-OPERATIONAL"`
- **AND** no generated document is eligible for the operative mapping query
- **AND** the operative `mappings` collection remains unchanged

### Requirement: Preserve status naming in generated review documents

The review projection MUST continue using `content.status` as the target field for Jira status.
Generated review documents MUST NOT introduce or restore `content.statusSp`.

#### Scenario: Review seed is checked for deprecated status naming

- **WHEN** the generated review seed is inspected
- **THEN** no document contains `targetField: "content.statusSp"`
- **AND** any status mapping preview continues to point to `content.status`

### Requirement: Load the review projection idempotently

The review projection seed MUST be safe to execute repeatedly.
The seed MUST use deterministic document identifiers and idempotent updates.
The seed MUST NOT call `drop()` as part of normal loading.

#### Scenario: Seed is executed more than once

- **WHEN** the generated seed is executed multiple times
- **THEN** MongoDB updates the same review documents by `_id`
- **AND** duplicate review documents are not created
- **AND** the collection is not dropped

### Requirement: Document known drift between the catalog and operative mappings

The catalog documentation SHALL record explicitly any known divergence between how a field is
classified in `catalog.json` and whether that same field is loaded in the operative `mappings`
collection in MongoDB. The catalog MUST NOT promote a divergent field to `confirmed` solely
because it is already loaded operationally; promotion still requires resolving the underlying
ambiguity (source subpath, field shape, or business meaning).

#### Scenario: Operative mapping is not yet confirmed in the catalog

- **WHEN** a field is loaded and active in the `mappings` collection but its evidence in
  `catalog.json` is insufficient to mark it `confirmed`
- **THEN** `catalog.json` records the divergence explicitly (for example in `notes[]`)
- **AND** the field remains `pending-validation` in `pendingCandidates`
- **AND** the field is not inserted into the `mappings` array of `catalog.json` as `confirmed`

#### Scenario: Reviewer checks operative mapping count

- **WHEN** a reviewer reads `docs/mappings/README.md` or
  `docs/mappings/Cantidad_campos_pendientes_implementacion.md` to find how many mappings are
  really loaded in MongoDB
- **THEN** the documented count matches what is actually loaded in the `mappings` collection
- **AND** any field loaded operationally without being `confirmed` in `catalog.json` is called out
  separately from the clean confirmed set

### Requirement: Distinguish the review projection from disposable data

Project documentation SHALL make clear that `mapping_catalog_review` is a review-only projection
of the mapping catalog, not disposable test data, so it is not deleted by mistake.

#### Scenario: Reader considers deleting the review projection

- **WHEN** someone reviewing MongoDB Compass considers deleting the `mapping_catalog_review`
  collection because it looks like test data
- **THEN** project documentation (`docs/README.md` and
  `docs/mappings/evidence/pilot-local/README.md`) explains what the collection is for and that it
  should not be deleted
- **AND** the documentation clarifies that the collection is separate from the operative `mappings`
  collection and safe to regenerate from versioned files without any runtime impact

