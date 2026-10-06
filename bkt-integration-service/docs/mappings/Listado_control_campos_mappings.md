# Listado de control — campos del catalogo de mappings

Basado en `docs/mappings/Cantidad_campos_pendientes_implementacion.md`. Pensado para marcar avance
a medida que se resuelve cada campo, sin repetir el detalle completo que ya vive en ese fichero.

## Campos operativos (10 de 163) — los unicos cargados en Mongo hoy

### Limpios: confirmados en `catalog.json` y operativos

- [x] `key` -> `itsmTicketId`
- [x] `fields.issuetype.name` -> `ticketType`
- [x] `fields.description` -> `content.issueDescription`
- [x] `fields.summary` -> `content.title`
- [x] `fields.status.name` -> `content.status`
- [x] `fields.priority.name` -> `content.severityLevel`

### Con divergencia: cargados en Mongo, pero sin confirmar en el catalogo

- [ ] `fields.assignee.accountId` -> `content.technicianInfo.userId` — falta decidir la subruta de persona
- [ ] `fields.assignee.emailAddress` -> `content.technicianInfo.email` — idem
- [ ] `fields.assignee.displayName` -> `content.technicianInfo.lastName` — idem
- [ ] `fields.components` -> `content.groupId` — falta confirmar la forma real del campo

Marca estos 4 como hechos solo cuando negocio confirme la subruta/forma y se actualice
`catalog.json` en consecuencia (no antes, para no repetir una divergencia ya detectada).

## El resto del catalogo (153 de 163) — no cargado, por categoria

- [ ] **139 pending-validation** — bloqueados por decision de negocio, no por codigo. Lista completa
  en `docs/mappings/contexts/pilot-local/catalog.json` (`pendingCandidates`), en las matrices por
  seccion (`alta-data-matrix.md`, `solucion-data-matrix.md`, `impacto-data-matrix.md`,
  `imputacion-timeentries.md`) o navegable en Compass (`mapping_catalog_review`, filtro
  `{ "decision": "pending-validation" }`). Este es el bloque a ir reduciendo reunion a reunion.
- [x] **9 confirmed duplicados** — mismo mapping que los 6 limpios de arriba, documentado dos veces
  por venir de fuentes distintas. No es trabajo pendiente, no requiere accion.
- [x] **8 excluded** — no se implementan (adjuntos y contenido generado post-intake). Decision
  cerrada, no requiere seguimiento.
- [x] **1 blocked por motor** — `timeEntries[]`, requiere coleccion hija o flujo especializado.
  Pendiente de una mejora de arquitectura futura, no de decision de negocio.

## Como se actualiza este listado

Cuando negocio confirme un campo de los 139: mover su fila a `mappings` en `catalog.json` con
evidencia real, marcar la casilla correspondiente aqui, y actualizar el conteo en
`docs/mappings/Resumen_cantidad_mappings.md` y `docs/mappings/Cantidad_campos_pendientes_implementacion.md`
para que los tres ficheros sigan diciendo lo mismo.
