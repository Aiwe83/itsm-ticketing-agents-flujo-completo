## Tasks

- [x] Confirmar que `docs/mappings/scripts/build-mongo-review-seed.mjs` genera documentos `model-reference` con `body`.
- [x] Confirmar que el generador separa el modelo funcional por secciones consultables.
- [x] Confirmar que las notas funcionales se generan como `docType: "gotcha"` y `scope: "functional"`.
- [x] Confirmar que los avisos de diseno existentes conservan `scope: "design"`.
- [x] Regenerar `docs/mappings/evidence/pilot-local/mapping-catalog-review-seed.js` desde los ficheros versionados.
- [x] Validar que el seed generado tiene `_id` deterministas y usa `bulkWrite` con `upsert`.
- [x] Validar que el seed no usa `drop()`.
- [x] Validar que todos los documentos de revision usan `meshId: "REVIEW-NOT-OPERATIONAL"`.
- [x] Validar que no existe `targetField: "content.statusSp"`.
- [x] Comparar `mappings-before.json` y `mappings-after.json` para demostrar que la coleccion operativa `mappings` no cambia.
- [x] Actualizar documentacion de `docs/mappings/README.md` con el comportamiento de la vista de revision.
- [x] Actualizar o crear una guia manual sencilla para ensenar la vista en MongoDB Compass.
- [x] Ejecutar validacion estructural del cambio OpenSpec cuando corresponda.
