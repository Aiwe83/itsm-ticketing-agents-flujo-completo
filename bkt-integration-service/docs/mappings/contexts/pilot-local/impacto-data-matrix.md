# Matriz de mappings - Impacto

Esta matriz documenta campos de afectacion, criticidad, ambito e impacto de negocio.

## Resumen

- Nuevos mappings confirmados en este batch: 0.
- La seccion queda mayoritariamente como `pending-validation`.
- No se crean `customfield_*` sin metadata Jira.
- Los arrays simples quedan pendientes hasta confirmar forma Jira y transformador; no se consideran bloqueados por motor todavia.

| Campo funcional                      | Campo del modelo             | Evidencia Jira / ruta      | Target interno propuesto           | Evidencia disponible | Decision           | engine-blocked | Motivo                                                        |
| ------------------------------------ | ---------------------------- | -------------------------- | ---------------------------------- | -------------------- | ------------------ | -------------- | ------------------------------------------------------------- |
| Alertas registradas                  | `registeredAlertsRange`      | Sin customfield confirmado | `content.registeredAlertsRange`    | no                   | pending-validation | false          | Falta desplegable Jira y valores permitidos.                  |
| Clientes afectados                   | `affectedCustomersRange`     | Sin customfield confirmado | `content.affectedCustomersRange`   | no                   | pending-validation | false          | Falta desplegable Jira y valores permitidos.                  |
| Perdidas de datos bajo criterio CIDA | `cidaDataLossCriteria[]`     | Sin customfield confirmado | `content.cidaDataLossCriteria`     | no                   | pending-validation | false          | Array de valores; falta confirmar forma Jira y transformador. |
| Paises afectados                     | `impactedCountries[]`        | Sin customfield confirmado | `content.impactedCountries`        | no                   | pending-validation | false          | Array de valores; falta confirmar forma Jira.                 |
| Impacto economico                    | `hasEconomicImpact`          | Sin customfield confirmado | `content.hasEconomicImpact`        | no                   | pending-validation | false          | Falta confirmar si llega como booleano u opcion.              |
| Inactividad                          | `inactivity[]`               | Sin customfield confirmado | `content.inactivity`               | no                   | pending-validation | false          | Array de valores; falta confirmar forma Jira.                 |
| Segmento de clientes afectados       | `affectedCustomerSegments[]` | Sin customfield confirmado | `content.affectedCustomerSegments` | no                   | pending-validation | false          | Array de valores; falta confirmar forma Jira.                 |
| Nivel de impacto                     | `impactLevel`                | Sin customfield confirmado | `content.impactLevel`              | no                   | pending-validation | false          | Falta desplegable Jira y valores permitidos.                  |
| Indicador de servicio critico        | `isCriticalService`          | Sin customfield confirmado | `content.isCriticalService`        | no                   | pending-validation | false          | Falta confirmar si llega como booleano u opcion.              |
