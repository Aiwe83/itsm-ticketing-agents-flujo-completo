## 1. Evidence Audit

- [x] 1.1 Review `context_para_el_proyecto/datos_para_crear_proyecto/modelo_de_datos_mappeos/json_modelo_datos _1.md` and list every field from Alta, Solucion, Impacto, and Imputacion.
- [x] 1.2 Review `context_para_el_proyecto/datos_para_crear_proyecto/modelo_de_datos_mappeos/ejemplo_ticket.json` as the internal target model, not as Jira source evidence.
- [x] 1.3 Check the existing sanitized Jira evidence under `docs/mappings/evidence/pilot-local/`.
- [x] 1.4 For every functional field, record whether Jira evidence is available.
- [x] 1.5 Keep fields without evidence as `pending-validation`; do not invent `customfield_*`.

## 2. Section Matrices

- [x] 2.1 Create or update `docs/mappings/contexts/pilot-local/alta-data-matrix.md`.
- [x] 2.2 Create or update `docs/mappings/contexts/pilot-local/solucion-data-matrix.md`.
- [x] 2.3 Create or update `docs/mappings/contexts/pilot-local/impacto-data-matrix.md`.
- [x] 2.4 Create or update `docs/mappings/contexts/pilot-local/imputacion-timeentries.md` as a design note, not as a regular field matrix.
- [x] 2.5 Include field name, Jira source candidate, internal target field, evidence availability, decision state, `engine-blocked`, and notes in each review table.

## 3. Catalog Updates

- [x] 3.1 Update `docs/mappings/contexts/pilot-local/catalog.json` only with mappings that are confirmed by sanitized Jira evidence.
- [x] 3.2 Add unresolved fields to the pending candidate area instead of the loadable mappings list.
- [x] 3.3 Add excluded fields to the excluded area with a clear reason.
- [x] 3.4 Mark `timeEntries[]` and unsupported nested arrays with `engine-blocked: true`.
- [x] 3.5 Preserve `content.status` and ensure `content.statusSp` is not introduced anywhere.
- [x] 3.6 Update `docs/mappings/contexts/pilot-local/catalog.md` with a human-readable summary of the new decisions.

## 4. Evidence Documentation

- [x] 4.1 Extend `docs/mappings/evidence/pilot-local/jira-field-dictionary.json` with new sanitized field evidence when available.
- [x] 4.2 Mark each new evidence entry with its functional batch, such as `alta-solucion-impacto-imputacion`.
- [x] 4.3 Do not store tokens, credentials, personal data, internal URLs, raw comments, or sensitive payload fragments.
- [x] 4.4 Update `docs/mappings/README.md` with the rules for evidence, pending candidates, excluded fields, and future MongoDB loading.

## 5. Validation

- [x] 5.1 Validate that `catalog.json` is valid JSON.
- [x] 5.2 Validate that confirmed mappings include `sourceField`, `targetField`, `transformer`, `required`, `description`, `options`, and evidence notes.
- [x] 5.3 Validate that no confirmed mapping has an invented `customfield_*`.
- [x] 5.4 Validate that no catalog file contains `content.statusSp`.
- [x] 5.5 Validate that no duplicate `targetField` exists without an explicit documented decision.
- [x] 5.6 Validate that pending, excluded, and engine-blocked candidates are not included as loadable mappings.
- [x] 5.7 Confirm that this change does not modify `src/`, MongoDB, Docker, `.env`, endpoints, or `openapi.yaml`.
