## 1. Explore

- [x] 1.1 Confirmar el modelo real de `Mapping`.
- [x] 1.2 Confirmar transformadores soportados: `copy`, `mapToString`, `severity`.
- [x] 1.3 Confirmar colecciones actuales: `mappings`, `itsm_tickets`, `tickets`, `executions`.
- [x] 1.4 Confirmar ejemplos usados como referencia para mappings y tickets.

## 2. Proposal Artifacts

- [x] 2.1 Crear `proposal.md` con objetivo, alcance, no-alcance, impacto y validaciones.
- [x] 2.2 Crear `design.md` con estructura de `docs/mappings`, formato JSON, reglas de evidencia y carga futura.
- [x] 2.3 Crear `tasks.md` con las tareas pendientes para implementar el catalogo despues.
- [x] 2.4 Crear delta spec en `specs/jira-mapping-catalog/spec.md`.
- [x] 2.5 Mantener el cambio aislado en `openspec/changes/catalogo-mappings-jira-campo-a-campo/`.

## 3. Apply

- [x] 3.1 Crear `docs/mappings/README.md`.
- [x] 3.2 Crear `docs/mappings/contexts/pilot-local/catalog.json`.
- [x] 3.3 Crear `docs/mappings/contexts/pilot-local/catalog.md`.
- [x] 3.4 Documentar un mapping por cada campo relevante.
- [x] 3.5 Marcar cada mapping como `confirmed` o `pending-validation`.
- [x] 3.6 Evitar `content.statusSp` y usar `content.status`.
- [x] 3.7 No cargar mappings en MongoDB automaticamente.
- [x] 3.8 No tocar codigo salvo que se apruebe despues un script de carga separado.

## 4. Validation

- [x] 4.1 Validar que `catalog.json` es JSON valido.
- [x] 4.2 Validar que cada mapping tiene `sourceField`, `targetField`, `transformer`, `required`, `description` y `options`.
- [x] 4.3 Validar que no existe `targetField: content.statusSp`.
- [x] 4.4 Validar que no hay duplicados para el mismo `targetField` sin decision explicita.
- [x] 4.5 Validar que las claves `_evidence` no se insertan en MongoDB.
- [x] 4.6 Confirmar que MongoDB no se modifica en esta fase.
- [x] 4.7 No ejecutar `/opsx-verify`.
