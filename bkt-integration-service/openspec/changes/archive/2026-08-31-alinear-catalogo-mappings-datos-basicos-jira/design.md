## Context

El catalogo actual en `docs/mappings` documenta mappings Jira -> ticket interno agrupados por contexto:

```text
docs/mappings/contexts/pilot-local/
  catalog.json
  catalog.md
  basic-data-matrix.md
```

La estructura por contexto es correcta porque el servicio busca mappings por `tenantId`, `projectId` e `itsmId`.

El problema corregido por esta propuesta es funcional: el catalogo debe compararse contra el formulario real de intervenciones Jira, no solo contra un ticket de ejemplo de otro proyecto Jira.

## Current Technical Baseline

Modelo `Mapping` confirmado:

- `sourceField`
- `targetField`
- `required`
- `description`
- `createdBy`
- `updatedBy`
- `tenantId`
- `projectId`
- `itsmId`
- `transformer`
- `options`

Transformadores soportados:

- `copy`
- `mapToString`
- `severity`

Colecciones actuales:

- `mappings`
- `itsm_tickets`
- `tickets`
- `executions`

## Decision

La futura aplicacion debe actualizar la documentacion del catalogo para que cada campo de `1.- Datos basicos` tenga una decision explicita.

No se deben crear mappings definitivos para campos sin `sourceField` confirmado. Es preferible dejar un campo como `pending-validation` antes que inventar un `customfield_*`.

## Basic Data Fields

La matriz debe cubrir estos 27 campos, en el orden del formulario:

| # | Campo del formulario | Decision inicial |
|---|---|---|
| 1 | Pais afectado | pending-validation |
| 2 | Tipo de incidencia | mapped |
| 3 | Solicitante | pending-validation |
| 4 | Empresa | pending-validation |
| 5 | Departamento | pending-validation |
| 6 | Centro | pending-validation |
| 7 | Direccion general | pending-validation |
| 8 | Fecha / hora apertura | pending-validation |
| 9 | Compromiso de resolucion | pending-validation |
| 10 | Aplicacion afectada | pending-validation |
| 11 | Entorno | pending-validation |
| 12 | Responsable de la empresa externa | pending-validation |
| 13 | En garantia de proyecto | pending-validation |
| 14 | Codigo proyecto | pending-validation |
| 15 | Es Urgente | pending-validation |
| 16 | Motivo de urgencia | pending-validation |
| 17 | Grado de urgencia | pending-validation |
| 18 | Referencia | mapped |
| 19 | Descripcion | mapped |
| 20 | Resultado obtenido | pending-validation |
| 21 | Resultado esperado | pending-validation |
| 22 | Reproduccion del problema | pending-validation |
| 23 | Mensaje de error literal | pending-validation |
| 24 | Codigo de error | pending-validation |
| 25 | Adjuntos | excluded |
| 26 | Hora del incidente | pending-validation |
| 27 | Usuario o numero de persona afectada | pending-validation |

## Fields Covered Today

Solo estos campos tienen cobertura directa clara:

| Campo formulario | Mapping actual | Decision |
|---|---|---|
| Tipo de incidencia | `fields.issuetype.name -> ticketType` | Confirmado, con nota de enum funcional |
| Referencia | `fields.summary -> content.title` | Confirmado |
| Descripcion | `fields.description -> content.issueDescription` | Confirmado |

## Fields Pending Validation

Los otros campos no deben convertirse en mappings definitivos hasta confirmar el `sourceField` real de Jira.

Muchos probablemente seran `fields.customfield_XXXXX`, pero esos IDs no aparecen en los ejemplos disponibles. Deben confirmarse con:

- metadata real de Jira, por ejemplo `GET /rest/api/3/field`;
- `createmeta` del proyecto real;
- o un payload real de intake del proyecto correcto.

## Severity And Urgency

El catalogo actual tiene:

```text
fields.priority.name -> content.severityLevel
```

Eso no debe asumirse como equivalente a:

- `Es Urgente`
- `Motivo de urgencia`
- `Grado de urgencia`

Hasta validacion funcional, `content.severityLevel` queda como prioridad tecnica procedente de Jira, no como urgencia de negocio.

## Attachments

`Adjuntos` queda excluido del catalogo regular de mappings.

Motivo: los adjuntos ya se procesan mediante la logica de adjuntos y se guardan como texto plano en:

```text
content.attachedDocuments
```

No deben cargarse como mappings `sourceField -> targetField` normales.

## Catalog Update Rules For Future Apply

Cuando se autorice `/opsx-apply`:

- Actualizar `basic-data-matrix.md` con los 27 campos corregidos.
- Actualizar `catalog.md` para explicar que solo tres campos estan confirmados directamente.
- Actualizar `catalog.json` solo para notas o campos con evidencia suficiente.
- Anadir candidatos pendientes sin convertirlos en mappings Mongo definitivos.
- Mantener `content.status`, no `content.statusSp`.
- No crear mappings con `customfield_*` sin evidencia.
- No crear mappings genericos de `fields`.
- No modificar MongoDB.
- No tocar `src/`.

## Risks

- R1: El catalogo actual puede estar basado en ejemplos de otro proyecto Jira y no en el formulario funcional real.
- R2: Inventar `customfield_*` generaria mappings falsos.
- R3: Prioridad Jira y urgencia de negocio pueden ser conceptos distintos.
- R4: Algunos campos pueden estar calculados por Jira/SLA o por reglas externas.
- R5: Los adjuntos podrian confundirse con mappings normales si no se documenta su excepcion.
- R6: Si el formulario pertenece a otro contexto, no se debe mezclar con el contexto actual.

## Rollback

Como esta fase solo modifica artefactos OpenSpec, el rollback consiste en revertir:

```text
openspec/changes/alinear-catalogo-mappings-datos-basicos-jira/
```

No hay cambios de codigo, datos ni MongoDB que revertir.
