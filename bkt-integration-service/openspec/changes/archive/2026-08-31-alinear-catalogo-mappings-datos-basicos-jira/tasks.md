## 1. Explore

- [x] 1.1 Confirmar que existe un catalogo previo en `docs/mappings`.
- [x] 1.2 Confirmar que el catalogo previo esta agrupado por contexto.
- [x] 1.3 Confirmar el modelo real de `Mapping`.
- [x] 1.4 Confirmar transformadores soportados: `copy`, `mapToString`, `severity`.
- [x] 1.5 Confirmar colecciones actuales: `mappings`, `itsm_tickets`, `tickets`, `executions`.
- [x] 1.6 Revisar la seccion `1.- Datos basicos` del DOCX funcional.
- [x] 1.7 Identificar los 27 campos funcionales corregidos.
- [x] 1.8 Decidir que conviene `spec-driven`, no `quick-fix`, porque afecta contrato documental y futuro criterio de carga.

## 2. Proposal

- [x] 2.1 Crear `.openspec.yaml` con `schema: spec-driven`.
- [x] 2.2 Crear `proposal.md` con objetivo, alcance, no-alcance, impacto, validaciones y preguntas abiertas.
- [x] 2.3 Crear `design.md` con matriz funcional corregida, reglas de estado, reglas de catalogo y riesgos.
- [x] 2.4 Crear `tasks.md` separando Explore, Proposal, Future Apply y Validation.
- [x] 2.5 Crear delta spec en `specs/jira-mapping-catalog/spec.md`.

## 3. Future Apply

- [x] 3.1 Actualizar `basic-data-matrix.md` dentro del contexto de `docs/mappings` con los 27 campos corregidos.
- [x] 3.2 Actualizar `docs/mappings/README.md` para explicar que `Datos basicos` es la referencia funcional de intake.
- [x] 3.3 Actualizar `catalog.md` para indicar que `Tipo de incidencia`, `Referencia` y `Descripcion` son los tres campos cubiertos directamente.
- [x] 3.4 Anotar en `catalog.json` que `fields.issuetype.name -> ticketType` procede de un desplegable cerrado del formulario.
- [x] 3.5 Documentar como `pending-validation` los campos sin `sourceField` real confirmado.
- [x] 3.6 Documentar la diferencia entre `content.severityLevel` y los campos `Es Urgente` / `Grado de urgencia`.
- [x] 3.7 Mantener adjuntos fuera de mappings regulares y documentarlos como flujo de `content.attachedDocuments`.
- [x] 3.8 No inventar IDs `customfield_*`.
- [x] 3.9 No cargar MongoDB automaticamente.
- [x] 3.10 No tocar `src/`.

## 4. Validation

- [x] 4.1 Validar que los 27 campos corregidos de `Datos basicos` aparecen en la matriz.
- [x] 4.2 Validar que solo los campos con evidencia suficiente quedan como mappings confirmados.
- [x] 4.3 Validar que no existe `targetField: "content.statusSp"`.
- [x] 4.4 Validar que no se inventa ningun `customfield_*`.
- [x] 4.5 Validar que los adjuntos quedan excluidos de mappings regulares.
- [x] 4.6 Validar que prioridad Jira y urgencia funcional quedan separadas.
- [x] 4.7 Validar que MongoDB no se modifica en esta fase.
- [x] 4.8 Validar que no se modifica `src/`.
- [x] 4.9 No ejecutar `/opsx-verify`.
