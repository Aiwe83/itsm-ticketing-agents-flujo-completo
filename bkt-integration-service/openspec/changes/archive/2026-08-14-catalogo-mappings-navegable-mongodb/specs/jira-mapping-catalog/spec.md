## ADDED Requirements

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
