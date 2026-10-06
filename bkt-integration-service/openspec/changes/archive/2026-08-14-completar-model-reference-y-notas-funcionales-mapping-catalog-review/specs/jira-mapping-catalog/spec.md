## ADDED Requirements

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
