# Cuantos campos hay para implementar (estado real)

Datos verificados en vivo contra `mapping_catalog_review` y `mappings` en Mongo, y contra
`docs/mappings/contexts/pilot-local/catalog.json`.

163 campos documentados en total. Solo **10 estan cargados de verdad** en la coleccion `mappings`
de MongoDB (la que usa el servicio en real); los otros 153 son solo documentacion.

## De un vistazo

| Estado | Cantidad | ¿Cargado en Mongo? |
| --- | --- | --- |
| Confirmado y operativo, limpio | 6 | Si |
| Confirmado y operativo, con divergencia sin resolver | 4 | Si, pero el catalogo lo sigue marcando `pending-validation` |
| `confirmed` en la vista de revision (duplicados de los 6 de arriba) | 9 | No aporta nada nuevo |
| `pending-validation` (bloqueado por negocio, no por codigo) | 139 | No |
| `excluded` (ej. adjuntos, van por su propio flujo) | 8 | No, y no van a estar |
| `blocked` por motor (`timeEntries[]`, arrays) | 1 | No, hasta rehacer el motor |
| **Total documentado** | **163** | **10 reales** |

## Ya implementado y operativo (limpio)

**6 mappings**, cargados en la coleccion real `mappings` y presentes como `confirmed` en
`catalog.json`:

| sourceField | targetField |
| --- | --- |
| `key` | `itsmTicketId` |
| `fields.issuetype.name` | `ticketType` |
| `fields.description` | `content.issueDescription` |
| `fields.summary` | `content.title` |
| `fields.status.name` | `content.status` |
| `fields.priority.name` | `content.severityLevel` |

## Divergencia: 4 mappings mas cargados en Mongo sin ser "confirmed"

Los 6 de arriba son los unicos limpios (confirmados en `catalog.json` **y** cargados en Mongo). Pero
la coleccion `mappings` real tiene **10 documentos**, no 6: hay otros 4 cargados como operativos que
`catalog.json` sigue documentando como `pending-validation` (dentro de `pendingCandidates`), a
proposito, porque su ambiguedad no esta resuelta:

| sourceField | targetField | Por que sigue `pending-validation` |
| --- | --- | --- |
| `fields.assignee.accountId` | `content.technicianInfo.userId` | Subruta de persona sin decidir (accountId vs displayName vs email) |
| `fields.assignee.emailAddress` | `content.technicianInfo.email` | Idem |
| `fields.assignee.displayName` | `content.technicianInfo.lastName` | Idem |
| `fields.components` | `content.groupId` | Forma real del campo `components` sin confirmar |

Verificado en directo contra Mongo (2026-08-17). Divergencia documentada explicitamente en
`catalog.json` (`notes[]`) y en `docs/mappings/README.md` (seccion "Cuantos campos estan realmente
cargados en Mongo") desde 2026-08-18. No se promocionaron a `confirmed`: hacerlo sin resolver la
subruta de persona repetiria una divergencia ya detectada.

Estos 4 ya cuentan dentro del bloque `pending-validation` de la tabla de arriba — no son campos
nuevos fuera del recuento de 163.

## Marcados "confirmed" en la vista de revision

**15 documentos** con `docType: field` y `decision: confirmed` en `mapping_catalog_review`.

De esos 15, **9 son duplicados**: mismo `sourceField -> targetField` que los 6 ya operativos de
arriba, documentados dos veces porque vienen de fuentes distintas (el catalogo original de 27
campos de "Datos basicos" y la matriz funcional "Alta"). No representan trabajo nuevo.

Confirmado comprobando contenido, no solo `_id`:

- `field:pilot-local:datos-basicos:tipo-de-incidencia:1` y
  `field:pilot-local:matrix:alta:tipo-de-incidencia:4` → mismo mapping (`fields.issuetype.name -> ticketType`).
- Mismo patron para `clave-visible`, `estado` y `grado-de-urgencia-tecnico` en la matriz "Alta"
  frente a sus equivalentes ya operativos.

## Los 139 pendientes

No estan listados campo a campo aqui porque son 139 y estan bloqueados por decision de negocio, no
por codigo — no hay nada que "implementar" sobre ellos todavia. La lista completa navegable esta
en MongoDB Compass, coleccion `mapping_catalog_review`, filtrando por
`{ "decision": "pending-validation" }`, o en Git dentro de
`docs/mappings/contexts/pilot-local/catalog.json` (array `pendingCandidates`) y las matrices por
seccion (`alta-data-matrix.md`, `solucion-data-matrix.md`, `impacto-data-matrix.md`,
`imputacion-timeentries.md`).

## Excluidos y bloqueados

- **8 excluidos**: no se implementan (p. ej. adjuntos, que van por su propio flujo de
  procesamiento; o contenido generado despues del intake, que no se mapea desde el payload
  inicial).
- **1 bloqueado**: `timeEntries[]`, requiere coleccion hija o flujo especializado, no mapping
  plano — pendiente de una mejora de motor, no de decision de negocio.

## Conclusion

**Campos nuevos listos para cargar hoy: 0.** Los 6 mappings operativos ya estan implementados; los
9 "confirmed" restantes son evidencia repetida de esos mismos 6, no candidatos nuevos.

El siguiente paso de implementacion real no puede arrancar hasta que negocio reduzca los 139
`pending-validation` a confirmados. El cuello de botella esta en la validacion funcional, no en el
codigo.

## Mas detalle

- `docs/mappings/README.md` (seccion "Cuantos campos estan realmente cargados en Mongo").
- `docs/mappings/contexts/pilot-local/catalog.json` — fuente de verdad documental.
- `docs/Listado_control_campos_mappings.md` — checklist para ir marcando avance campo a campo.
