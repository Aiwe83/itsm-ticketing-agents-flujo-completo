## ADDED Requirements

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
