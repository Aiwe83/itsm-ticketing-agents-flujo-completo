# Catalogo de mappings Jira - contexto local

Contexto:

- `meshId`: `6a323e68-6f87-403a-a87d-72da69fcde0d`

`catalog.json` es la fuente de verdad futura para cargar mappings en MongoDB. Este Markdown es solo una vista de revision.

## Resumen rapido

El catalogo se ha contrastado con el punto `1.- Datos basicos` del formulario Jira.

Resultado actual:

- 27 campos funcionales revisados.
- 3 campos de `Datos basicos` confirmados como mappings directos.
- 23 campos siguen como `pending-validation`.
- 1 campo queda `excluded`: `Adjuntos`.
- Los customfields observados `customfield_10147` y `customfield_10152` quedan documentados como candidatos, no como mappings definitivos.

## Ampliacion Alta, Solucion, Impacto e Imputacion

El segundo bloque revisado amplia el modelo funcional mas alla de `Datos basicos`.

La decision del catalogo sigue siendo conservadora: solo se cargan en `mappings` los campos confirmados con evidencia. Las secciones nuevas quedan documentadas en matrices humanas para poder revisarlas con negocio o con metadata Jira antes de promoverlas.

| Seccion    | Fichero                     | Resultado                                                                                                       |
| ---------- | --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Alta       | `alta-data-matrix.md`       | Reutiliza mappings confirmados existentes. El resto queda pendiente o excluido si requiere flujo especializado. |
| Solucion   | `solucion-data-matrix.md`   | Se separan campos que podrian venir de Jira de campos generados despues por procesamiento interno.              |
| Impacto    | `impacto-data-matrix.md`    | Campos clasificados como pendientes hasta tener customfields o metadata Jira confirmada.                        |
| Imputacion | `imputacion-timeentries.md` | `timeEntries[]` queda bloqueado porque es una coleccion hija y el motor actual no la expande.                   |

No se han añadido mappings nuevos en este batch porque no hay evidencia Jira suficiente para confirmar nuevos `sourceField`.

## Mappings consumibles

Estos son los unicos mappings que aparecen en el array `mappings` de `catalog.json`.

| Estado    | sourceField             | targetField                | transformer | required | Nota                                                                      |
| --------- | ----------------------- | -------------------------- | ----------- | -------- | ------------------------------------------------------------------------- |
| Confirmed | `key`                   | `itsmTicketId`             | `copy`      | true     | Identificador visible del ticket Jira.                                    |
| Confirmed | `fields.issuetype.name` | `ticketType`               | `copy`      | false    | Tipo de incidencia.                                                       |
| Confirmed | `fields.description`    | `content.issueDescription` | `copy`      | false    | Descripcion principal del ticket.                                         |
| Confirmed | `fields.summary`        | `content.title`            | `copy`      | true     | Referencia o titulo visible del ticket.                                   |
| Confirmed | `fields.status.name`    | `content.status`           | `copy`      | false    | Estado actual. No se usa el campo legacy `statusSp`.                      |
| Confirmed | `fields.priority.name`  | `content.severityLevel`    | `copy`      | false    | Prioridad tecnica Jira; no equivale automaticamente a urgencia funcional. |

Los mappings antiguos o candidatos sobre `fields.assignee.*` y `fields.components` quedan fuera del array `mappings` hasta confirmar forma y contrato interno.

## Tabla funcional de Datos basicos

| #   | Campo funcional                      | Campo Jira                     | Ruta                             | Destino interno                      | Estado             |
| --- | ------------------------------------ | ------------------------------ | -------------------------------- | ------------------------------------ | ------------------ |
| 1   | Pais afectado                        | Pendiente                      | Pendiente                        | `content.affectedCountry`            | pending-validation |
| 2   | Tipo de incidencia                   | `issuetype`                    | `fields.issuetype.name`          | `ticketType`                         | confirmed          |
| 3   | Solicitante                          | Pendiente                      | Pendiente                        | `content.requestorId`                | pending-validation |
| 4   | Empresa                              | Pendiente                      | Pendiente                        | `content.requestorCompany`           | pending-validation |
| 5   | Departamento                         | Pendiente                      | Pendiente                        | `content.requestorDepartment`        | pending-validation |
| 6   | Centro                               | Pendiente                      | Pendiente                        | `content.requestorCenter`            | pending-validation |
| 7   | Direccion general                    | Pendiente                      | Pendiente                        | `content.requestorDivision`          | pending-validation |
| 8   | Fecha / hora apertura                | Candidato: `created`           | `fields.created`                 | `content.openedAt`                   | pending-validation |
| 9   | Compromiso de resolucion             | Pendiente                      | Pendiente                        | `content.resolutionCommitment`       | pending-validation |
| 10  | Aplicacion afectada                  | Pendiente                      | Pendiente                        | `content.affectedApplication`        | pending-validation |
| 11  | Entorno                              | Candidato: `customfield_10147` | `fields.customfield_10147.value` | `content.environment`                | pending-validation |
| 12  | Responsable de la empresa externa    | Candidato: `assignee`          | Pendiente                        | `content.externalCompanyResponsible` | pending-validation |
| 13  | En garantia de proyecto              | Candidato: `customfield_10152` | `fields.customfield_10152.value` | `content.projectWarranty`            | pending-validation |
| 14  | Codigo proyecto                      | Pendiente                      | Pendiente                        | `content.projectCode`                | pending-validation |
| 15  | Es Urgente                           | Pendiente                      | Pendiente                        | `content.isUrgent`                   | pending-validation |
| 16  | Motivo de urgencia                   | Pendiente                      | Pendiente                        | `content.urgencyReason`              | pending-validation |
| 17  | Grado de urgencia                    | Pendiente                      | Pendiente                        | `content.urgencyLevel`               | pending-validation |
| 18  | Referencia                           | `summary`                      | `fields.summary`                 | `content.title`                      | confirmed          |
| 19  | Descripcion                          | `description`                  | `fields.description`             | `content.issueDescription`           | confirmed          |
| 20  | Resultado obtenido                   | Pendiente                      | Pendiente                        | `content.actualResult`               | pending-validation |
| 21  | Resultado esperado                   | Pendiente                      | Pendiente                        | `content.expectedResult`             | pending-validation |
| 22  | Reproduccion del problema            | Pendiente                      | Pendiente                        | `content.reproductionSteps`          | pending-validation |
| 23  | Mensaje de error literal             | Pendiente                      | Pendiente                        | `content.errorMessage`               | pending-validation |
| 24  | Codigo de error                      | Pendiente                      | Pendiente                        | `content.errorCode`                  | pending-validation |
| 25  | Adjuntos                             | `attachment`                   | Especializado                    | `content.attachedDocuments`          | excluded           |
| 26  | Hora del incidente                   | Pendiente                      | Pendiente                        | `content.incidentTime`               | pending-validation |
| 27  | Usuario o numero de persona afectada | Pendiente                      | Pendiente                        | `content.affectedUser`               | pending-validation |

## Candidatos no confirmados

| Jira field          | Ruta candidata                   | Valor sintetico observado | Motivo de pendiente                                                              |
| ------------------- | -------------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| `customfield_10147` | `fields.customfield_10147.value` | `Temporales`              | Se conoce la forma, pero no el nombre funcional.                                 |
| `customfield_10152` | `fields.customfield_10152.value` | `SI`                      | Se conoce la forma, pero no si corresponde a garantia, urgencia u otra decision. |

## Prioridad y urgencia

`fields.priority.name -> content.severityLevel` se mantiene como prioridad tecnica procedente de Jira.

No se considera equivalente a:

- `Es Urgente`
- `Motivo de urgencia`
- `Grado de urgencia`

Hasta validacion funcional, esos tres campos siguen como `pending-validation`.

## Campos excluidos

| Campo                                              | Motivo                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `fields.attachment` -> `content.attachedDocuments` | Los adjuntos se procesan por la logica de adjuntos y no como mapping normal. |
| `content.diagnostic`                               | Se genera despues del intake Jira.                                           |
| `content.resolution`                               | Se genera despues del intake Jira.                                           |

## Campos bloqueados por motor

Estos campos quedan documentados, pero no se pueden cargar como mappings normales porque requieren fan-out de arrays o colecciones hijas.

| Campo                        | Motivo                                                          |
| ---------------------------- | --------------------------------------------------------------- |
| `content.modifiedComponents` | Requiere expandir `modifiedComponents[]` como array de objetos. |
| `content.performedTests`     | Requiere expandir `performedTests[]` como array de objetos.     |
| `timeEntries[]`              | Representa imputaciones o worklogs como coleccion hija.         |

## Validaciones que debe cumplir

- `catalog.json` debe ser JSON valido.
- No debe recuperarse el campo legacy `statusSp`.
- No debe haber mappings duplicados para el mismo `targetField`.
- Los campos `pending-validation`, `excluded` y `engineBlocked` no deben aparecer como mappings definitivos.
- Las claves `_evidence` son solo documentales y no deben insertarse en MongoDB.
- Esta fase no modifica MongoDB ni codigo fuente.
