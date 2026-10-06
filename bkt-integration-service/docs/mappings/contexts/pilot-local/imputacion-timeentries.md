# Imputacion - bloqueo de timeEntries[]

La seccion Imputacion no se cataloga como mappings de campo normales.

`timeEntries[]` representa una coleccion hija: una fila por cada imputacion o registro de trabajo. El motor de mappings actual esta orientado a copiar valores de un payload Jira hacia un documento de ticket, pero no crea documentos hijos ni expande arrays complejos en registros independientes.

## Decision

- No se anade ningun `timeEntries.*` a `mappings[]`.
- No se anade ningun `timeEntries.*` a `pendingCandidates[]` cargable.
- La seccion queda bloqueada por capacidad del motor, no solo por falta de evidencia.

## Campos afectados

| Campo funcional                   | Campo del modelo                   | Origen Jira posible             | Evidencia disponible | Decision | engine-blocked | Motivo                                           |
| --------------------------------- | ---------------------------------- | ------------------------------- | -------------------- | -------- | -------------- | ------------------------------------------------ |
| Persona que imputa                | `timeEntries[].author`             | `worklog.author`                | parcial              | blocked  | true           | Campo de persona dentro de coleccion hija.       |
| Quien registra por cuenta de otro | `timeEntries[].updateAuthor`       | `worklog.updateAuthor`          | parcial              | blocked  | true           | Campo de persona dentro de coleccion hija.       |
| Aplicacion                        | `timeEntries[].application`        | Snapshot funcional              | no                   | blocked  | true           | Debe conservar valor historico de la imputacion. |
| Tipo                              | `timeEntries[].issueType`          | Snapshot funcional              | no                   | blocked  | true           | Debe conservar valor historico de la imputacion. |
| Entorno                           | `timeEntries[].environment`        | Snapshot funcional              | no                   | blocked  | true           | Debe conservar valor historico de la imputacion. |
| Caracteristica                    | `timeEntries[].workCharacteristic` | Derivado de urgencia y garantia | no                   | blocked  | true           | No es sourceField directo de Jira.               |
| Fecha y hora de imputacion        | `timeEntries[].started`            | `worklog.started`               | parcial              | blocked  | true           | Requiere fan-out de worklogs.                    |
| Tiempo dedicado                   | `timeEntries[].timeSpentSeconds`   | `worklog.timeSpentSeconds`      | parcial              | blocked  | true           | Requiere fan-out de worklogs.                    |

## Alternativas futuras

1. Crear un motor de colecciones hijas para expandir arrays complejos.
2. Crear un endpoint dedicado de imputaciones.
3. Crear un procesamiento especializado similar al flujo de adjuntos.

## Restricciones semanticas

- `application`, `issueType` y `environment` son snapshot: si el ticket cambia despues, la imputacion antigua debe conservar el valor que tenia al registrarse.
- `workCharacteristic` tambien es snapshot y puede derivarse de `isUrgent` y `isProjectWarranty`.
- La imputacion por cuenta de tercero es una regla de permisos, no un mapping.
