# Mapeo de campos — Modelo de datos de Ticket

**Leyenda**
- `(nativo)` → el campo existe en Jira con ese mismo nombre en la API, no hace falta crear un custom field.
- `(~ nativo)` → existe algo equivalente en Jira, pero no encaja al 100% (ver notas de cada sección).
- Sin marca → custom field a crear.

---

# SECCIÓN 1 — Alta de la incidencia

## 1.1 Identificación y clasificación

```
(id interno)                        -> id (nativo)
(clave visible)                     -> key (nativo)
País afectado                       -> affectedCountry
(multiidioma)                       -> locale
Tipo de incidencia                  -> issueType (nativo)
Referencia                          -> summary (nativo)
Descripción                         -> description (nativo)
Adjuntos                            -> infoAttachments (~ nativo)
(estado)                            -> status (nativo)
(resolución)                        -> resolution (nativo)
(fecha de resolución)               -> resolutionDate (nativo)
```

## 1.2 Solicitante y organización

```
Solicitante                         -> reporter (nativo)
(quien da el alta)                  -> creator (nativo)
Empresa                             -> company (~ nativo)
Departamento                        -> department
Centro                              -> site
Dirección general                   -> division
```

## 1.3 Aplicación, entorno y asignación

```
Aplicación afectada                 -> affectedApplication (~ nativo)
Entorno                             -> environment (nativo)
Responsable de la empresa externa   -> externalOwner
(técnico asignado)                  -> assignee (nativo)
Informados externos                 -> externalWatchers (~ nativo)
Responsable Bankinter               -> internalOwner
Informados Bankinter                -> internalWatchers (~ nativo)
```

## 1.4 Urgencia y proyecto

```
Es Urgente                          -> isUrgent
Motivo                              -> urgencyReason
Grado de urgencia                   -> priority (nativo)
En garantía de proyecto             -> isProjectWarranty
Código proyecto                     -> warrantyProjectCode
Descripción del código de proyecto  -> warrantyProjectName
```

## 1.5 Fechas y SLA

```
Fecha / hora apertura               -> created (nativo)
Compromiso de resolución            -> resolutionCommitmentAt (~ nativo)
(regla de cálculo del SLA)          -> slaCalendarType
Hora del incidente                  -> incidentOccurredAt
```

## 1.6 Detalle técnico del error

```
Resultado obtenido                  -> actualResult
Resultado esperado                  -> expectedResult
Reproducción del problema           -> stepsToReproduce
Mensaje de error literal            -> errorMessage
Código de error                     -> errorCode
Usuario o nº de persona con error   -> affectedUser
```

## Notas de la sección 1

- **company** → Jira Service Management tiene `organizations`, pero es un concepto de cliente/CSAT, no de estructura interna. Valorar si encaja.
- **affectedApplication** → podría mapearse a `components`, aunque los componentes son por proyecto y aquí la aplicación es un catálogo transversal.
- **externalWatchers / internalWatchers** → Jira tiene `watchers` (nativo), pero es una única lista sin distinguir externos de internos. Si necesitas la distinción, hacen falta dos campos propios y sincronizar `watchers` como agregado.
- **resolutionCommitmentAt** → el SLA *Time to resolution* de JSM cubre el cálculo; `duedate` (nativo) sería la alternativa, pero solo guarda fecha, sin hora.
- **infoAttachments / resolutionAttachments** → Jira tiene una única lista `attachment` por issue. Al separarlos en dos campos, hay que resolver la convivencia: o bien un flag/etiqueta por adjunto sobre la lista nativa, o bien dos campos propios y `attachment` como agregado.
- **externalOwner vs. assignee** → `externalOwner` sale de la parametrización `(aplicación, entorno)` y se recalcula al cambiarlas; es el destino de enrutado. `assignee` (nativo) es el técnico que trabaja la incidencia en cada momento y puede reasignarse libremente. Se inicializa a `externalOwner` en el alta. Simétrico a `internalOwner`.

---

# SECCIÓN 2 — Solución

```
Descr. funcional de la solución final -> functionalSolutionDescription
Tipo de solución                    -> solutionType
Clasificación del problema          -> problemClassification
Origen del error                    -> rootCause
  1. La incidencia se produjo porque-> rootCause.cause
  2. afectando a                    -> rootCause.affectedComponent
  3. cuando                         -> rootCause.triggerCondition
  4. provocando                     -> rootCause.observedOutcome
Cambios técnicos efectuados         -> modifiedComponents
  Componente modificado             -> modifiedComponents[].componentName
  Versión del elemento              -> modifiedComponents[].componentVersion
  Tipo de componente modificado     -> modifiedComponents[].componentType
Pruebas realizadas                  -> performedTests
  Prueba realizada                  -> performedTests[].testDescription
  Resultado de la prueba            -> performedTests[].testResult
Sentencia ejecutada                 -> executedStatement
Información demandada al usuario    -> informationRequestedFromReporter
Adjuntos                            -> resolutionAttachments
```

---

# SECCIÓN 3 — Impacto

```
Alertas registradas                 -> registeredAlertsRange
Clientes afectados                  -> affectedCustomersRange
Pérdidas de datos bajo criterio CIDA-> cidaDataLossCriteria
Países afectados                    -> impactedCountries
Impacto económico                   -> hasEconomicImpact
Inactividad                         -> inactivity
Segmento de clientes afectados      -> affectedCustomerSegments
Nivel de impacto                    -> impactLevel
Indicador de Servicio Crítico       -> isCriticalService
```

---

# SECCIÓN 4 — Imputación

No es un bloque de campos del ticket, sino una **colección hija**: `timeEntries: TimeEntry[]`,
una fila por cada imputación. Mapea casi 1:1 con el `worklog` nativo de Jira.

```
Persona que imputa                  -> timeEntries[].author (nativo: worklog.author)
(quien registra por cuenta de otro) -> timeEntries[].updateAuthor (nativo: worklog.updateAuthor)
Aplicación                          -> timeEntries[].application
Tipo                                -> timeEntries[].issueType
Entorno                             -> timeEntries[].environment
Característica                      -> timeEntries[].workCharacteristic
Fecha y hora de la imputación       -> timeEntries[].started (nativo: worklog.started)
Tiempo dedicado a la incidencia     -> timeEntries[].timeSpentSeconds (nativo: worklog.timeSpentSeconds)
```

## Notas de la sección 4

- **application / issueType / environment son snapshot**, no referencias vivas al ticket. Si la incidencia se reasigna a otra aplicación, las horas ya imputadas deben seguir contabilizando donde se imputaron.
- **workCharacteristic también es snapshot**, derivado en el momento de imputar a partir de `isUrgent` e `isProjectWarranty` del ticket.
- **Tiempo dedicado** → el documento pide horas y minutos; se almacena en segundos (como Jira) y se formatea en presentación.
- **Imputación por cuenta de un tercero** → solo usuarios Bankinter. Es una regla de permisos, no un campo.