# Evidencias Jira sanitizadas

Contexto del catalogo:

- `meshId`: `6a323e68-6f87-403a-a87d-72da69fcde0d`

Esta carpeta contiene evidencias documentales para resolver que campo Jira corresponde a cada campo funcional de `1.- Datos basicos`.

## Que se puede guardar

- IDs de campos Jira, por ejemplo `customfield_10147`.
- Nombres funcionales aprobados.
- Tipo de campo: texto, fecha, opcion, usuario, array u objeto.
- Ruta de lectura, por ejemplo `fields.customfield_10147.value`.
- Valores sinteticos que expliquen la forma del dato.
- Notas de decision sin informacion sensible.

## Que no se puede guardar

- Tokens, cookies o cabeceras de autorizacion.
- Correos, nombres, account IDs o identificadores de personas reales.
- Comentarios sensibles o descripcion libre real del ticket.
- URLs internas completas.
- Adjuntos reales o contenido de adjuntos reales.
- Capturas con datos no sanitizados.

## Estado de la evidencia actual

La evidencia disponible permite confirmar los campos estandar ya usados por el catalogo:

- `fields.issuetype.name`
- `fields.summary`
- `fields.description`
- `fields.status.name`
- `fields.priority.name`

Tambien se documentan como candidatos no confirmados:

- `customfield_10147`, observado como opcion con valor sintetico `Temporales`.
- `customfield_10152`, observado como opcion con valor sintetico `SI`.

Estos dos customfields no se promueven a mappings porque falta su nombre funcional o metadata Jira equivalente.

## Coleccion `mapping_catalog_review` en MongoDB (no borrar)

Esta evidencia, junto con `catalog.json`, es la fuente de la coleccion `mapping_catalog_review`
(163 documentos, navegable en Compass, generada por `docs/mappings/scripts/build-mongo-review-seed.mjs`).
No es una coleccion de pruebas desechable:

- Es una vista **documental de solo revision**, fisicamente separada de `mappings` (la coleccion
  operativa que usa el servicio en real). Tiene su propio `meshId` centinela
  (`REVIEW-NOT-OPERATIONAL`) para que nunca coincida con datos reales — borrarla o no borrarla no
  afecta al flujo ni a la demo.
- Contiene el estado de los 163 campos del catalogo funcional: los confirmados y operativos, los
  excluidos, los bloqueados por el motor, y los **139 que siguen `pending-validation`** porque
  falta confirmacion de negocio (nombre funcional, ruta de lectura o destino interno).
- Es la fuente que hay que consultar antes de dar por "completo" el mapeo de campos: la mayoria
  del catalogo sigue pendiente de decision de negocio, no de codigo.
- Se regenera (sin tocar `mappings` ni el flujo real) volviendo a correr
  `docs/mappings/scripts/build-mongo-review-seed.mjs`.

No confundir esta vista de revision con la coleccion operativa `mappings`: para llevar un mapping
`confirmed` de `catalog.json` a `mappings` de verdad se usa `pnpm mappings:dry-run`/
`pnpm mappings:apply` (ver `docs/mappings/README.md`, seccion "Pipeline de promocion"), nunca
`build-mongo-review-seed.mjs` ni edicion manual en Compass.

## Batch 2: Alta, Solucion, Impacto e Imputacion

Para las secciones nuevas se han añadido evidencias documentales saneadas:

- `batch-2-field-metadata.json`: campos estandar confirmados, candidatos observados y reglas de saneado.
- `batch-2-issue-shapes.json`: forma esperada de las secciones sin valores reales sensibles.
- `batch-2-decision-notes.md`: decisiones de promocion, pendiente, exclusion y bloqueo.

La evidencia del batch 2 sirve para clasificar, no para cargar automaticamente MongoDB.

Reglas especificas:

- No se inventan `customfield_*`.
- No se confirma un mapping sin nombre funcional, ruta de lectura y destino interno.
- Los campos de persona quedan pendientes hasta decidir si se necesita ID, nombre o email.
- Los arrays de objetos quedan pendientes o bloqueados si el motor actual no los puede expandir.
- `timeEntries[]` queda bloqueado como coleccion hija.
- Los adjuntos siguen fuera de mappings regulares.
- El estado se mantiene como `content.status`; no se recupera el campo legacy `statusSp`.
