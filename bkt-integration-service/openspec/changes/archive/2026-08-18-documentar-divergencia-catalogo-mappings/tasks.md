## 1. Documentar la divergencia en la fuente de verdad

- [x] 1.1 Anadir entrada en `docs/mappings/contexts/pilot-local/catalog.json` (`notes[]`)
  documentando que `fields.assignee.accountId/emailAddress/displayName` y `fields.components`
  estan cargados en la coleccion `mappings` real pero siguen `pending-validation` en el catalogo.
- [x] 1.2 Confirmar que ningun campo se promueve a `confirmed` en `mappings[]` como efecto de este
  cambio (verificado: `pendingCandidates` sin tocar su `decision`).

## 2. Corregir los recuentos documentados

- [x] 2.1 Anadir seccion "Cuantos campos estan realmente cargados en Mongo" en
  `docs/mappings/README.md` con el desglose de los 163 campos (10 operativos reales, 15 confirmed
  con 9 duplicados, 139 pending-validation, 8 excluded, 1 blocked).
- [x] 2.2 Anadir seccion de divergencia (tabla de los 4 mappings) en
  `docs/mappings/Cantidad_campos_pendientes_implementacion.md` y retitular la seccion de mappings
  operativos a "(limpio)" para distinguirla.
- [x] 2.3 Anadir referencia al desglose real en `README.md` (raiz).
- [x] 2.4 Anadir 4 bullets en `CHANGELOG.md` (`Unreleased`/`Added`) documentando estos cambios.
- [x] 2.5 Crear `docs/mappings/Resumen_cantidad_mappings.md` como referencia rapida de la misma
  cuantia (163 documentados, 10 reales en Mongo, tabla de los 6 limpios y los 4 con divergencia).

## 3. Aclarar la naturaleza de la coleccion de revision

- [x] 3.1 Anadir seccion en `docs/mappings/evidence/pilot-local/README.md` explicando que
  `mapping_catalog_review` no es de pruebas desechables y no debe borrarse.
- [x] 3.2 Anadir aviso equivalente en `docs/README.md`.

## 4. Verificacion

- [x] 4.1 Validar que `docs/mappings/contexts/pilot-local/catalog.json` sigue siendo JSON valido
  tras el cambio (`node -e "JSON.parse(...)"`).
- [x] 4.2 Confirmar que los numeros citados en cada fichero (10 operativos, 6 limpios + 4
  divergencia, 15 confirmed con 9 duplicados, 139 pending-validation, 8 excluded, 1 blocked, total
  163) son consistentes entre `docs/mappings/README.md` y
  `docs/mappings/Cantidad_campos_pendientes_implementacion.md`.
- [x] 4.3 Confirmar que no se toco `src/`, `openapi.yaml`, tests, ni la coleccion `mappings` en
  MongoDB.
