# Matriz de Datos basicos Jira

Esta matriz contrasta el punto `1.- Datos basicos` del formulario funcional con el catalogo de mappings Jira.

La regla es sencilla:

- Si el campo esta confirmado, puede aparecer en `catalog.json`.
- Si esta pendiente, se documenta pero no se carga como mapping.
- Si esta excluido, se procesa por otro flujo o se genera despues.

## Estados usados

- `confirmed`: existe evidencia suficiente.
- `pending-validation`: falta confirmar el campo real que llega desde Jira o su significado.
- `excluded`: no se trata como mapping normal.

## Cobertura de campos

| # | Campo del formulario | Decision | Campo Jira / candidato | Ruta | Destino interno | Evidencia / siguiente paso |
|---|---|---|---|---|---|
| 1 | Pais afectado | pending-validation | Pendiente | Pendiente | `content.affectedCountry` | Confirmar campo real y valores permitidos. |
| 2 | Tipo de incidencia | confirmed | `issuetype` | `fields.issuetype.name` | `ticketType` | Mapping existente y campo funcional confirmado. |
| 3 | Solicitante | pending-validation | Candidato: `reporter` o `creator` | Pendiente | `content.requestorId` | Decidir si se necesita accountId, nombre o email. |
| 4 | Empresa | pending-validation | Pendiente | Pendiente | `content.requestorCompany` | Confirmar si llega en Jira o se deriva del solicitante. |
| 5 | Departamento | pending-validation | Pendiente | Pendiente | `content.requestorDepartment` | Confirmar si llega en Jira o se deriva del solicitante. |
| 6 | Centro | pending-validation | Pendiente | Pendiente | `content.requestorCenter` | Confirmar si llega en Jira o se deriva del solicitante. |
| 7 | Direccion general | pending-validation | Pendiente | Pendiente | `content.requestorDivision` | Confirmar si llega en Jira o se deriva del solicitante. |
| 8 | Fecha / hora apertura | pending-validation | Candidato: `created` | `fields.created` | `content.openedAt` | Confirmar que negocio quiere la fecha de creacion Jira y su zona horaria. |
| 9 | Compromiso de resolucion | pending-validation | Pendiente | Pendiente | `content.resolutionCommitment` | Confirmar si Jira lo envia o si se calcula por SLA. |
| 10 | Aplicacion afectada | pending-validation | Pendiente | Pendiente | `content.affectedApplication` | Confirmar campo real y catalogo de aplicaciones. |
| 11 | Entorno | pending-validation | Candidato: `customfield_10147` | `fields.customfield_10147.value` | `content.environment` | Se conoce forma tipo opcion, pero no nombre funcional. |
| 12 | Responsable de la empresa externa | pending-validation | Candidato: `assignee` | Pendiente | `content.externalCompanyResponsible` | Confirmar si es persona Jira o regla por aplicacion/entorno. |
| 13 | En garantia de proyecto | pending-validation | Candidato: `customfield_10152` | `fields.customfield_10152.value` | `content.projectWarranty` | Se conoce forma SI/NO, pero no nombre funcional. |
| 14 | Codigo proyecto | pending-validation | Pendiente | Pendiente | `content.projectCode` | Confirmar campo real y formato esperado. |
| 15 | Es Urgente | pending-validation | Pendiente | Pendiente | `content.isUrgent` | No deducir desde `fields.priority.name`. |
| 16 | Motivo de urgencia | pending-validation | Pendiente | Pendiente | `content.urgencyReason` | Confirmar campo real y regla de obligatoriedad. |
| 17 | Grado de urgencia | pending-validation | Pendiente | Pendiente | `content.urgencyLevel` | Mantener separado de `content.severityLevel`. |
| 18 | Referencia | confirmed | `summary` | `fields.summary` | `content.title` | Mapping existente y campo funcional confirmado. |
| 19 | Descripcion | confirmed | `description` | `fields.description` | `content.issueDescription` | Mapping existente. No se parsean subapartados en este cambio. |
| 20 | Resultado obtenido | pending-validation | Pendiente | Pendiente | `content.actualResult` | Confirmar si llega separado o dentro de `fields.description`. |
| 21 | Resultado esperado | pending-validation | Pendiente | Pendiente | `content.expectedResult` | Confirmar si llega separado o dentro de `fields.description`. |
| 22 | Reproduccion del problema | pending-validation | Pendiente | Pendiente | `content.reproductionSteps` | Confirmar si llega separado o dentro de `fields.description`. |
| 23 | Mensaje de error literal | pending-validation | Pendiente | Pendiente | `content.errorMessage` | Confirmar si llega separado o dentro de `fields.description`. |
| 24 | Codigo de error | pending-validation | Pendiente | Pendiente | `content.errorCode` | Confirmar si llega separado o dentro de `fields.description`. |
| 25 | Adjuntos | excluded | `attachment` | Especializado | `content.attachedDocuments` | Se procesa por logica de adjuntos, no como mapping regular. |
| 26 | Hora del incidente | pending-validation | Pendiente | Pendiente | `content.incidentTime` | Confirmar si llega como campo independiente o derivado. |
| 27 | Usuario o numero de persona afectada | pending-validation | Pendiente | Pendiente | `content.affectedUser` | Confirmar campo real y formato esperado. |

## Customfields observados

| Customfield | Forma observada | Valor sintetico | Decision |
|---|---|---|---|
| `customfield_10147` | Objeto con `value` | `Temporales` | pending-validation |
| `customfield_10152` | Objeto con `value` | `SI` | pending-validation |

Estos customfields no se incorporan a `catalog.json` como mappings hasta confirmar su nombre funcional mediante metadata Jira o validacion equivalente.

## Decision importante

No se anaden mappings nuevos para campos pendientes porque no hay evidencia completa del `sourceField` real de Jira.

`fields.priority.name -> content.severityLevel` se mantiene como prioridad tecnica de Jira, pero no se considera equivalente a `Es Urgente`, `Motivo de urgencia` ni `Grado de urgencia`.

## Adjuntos

`Adjuntos` queda fuera de mappings regulares. El contenido de los ficheros se trata por la logica de adjuntos y termina en `content.attachedDocuments`.
