## Why

La vista documental `mapping_catalog_review` permite revisar el catalogo de mappings en MongoDB Compass sin tocar la coleccion operativa `mappings`. Durante la revision se detecto que las referencias al modelo funcional no eran suficientemente legibles: algunas solo indicaban ruta y numero de lineas, y las notas funcionales del modelo no quedaban cargadas como documentos consultables.

Este cambio formaliza la mejora necesaria para que negocio y equipo tecnico puedan ver, dentro de MongoDB, no solo los campos del catalogo sino tambien el texto funcional que justifica las decisiones.

## What Changes

- Completar los documentos `model-reference` para que incluyan texto funcional legible en un campo `body`.
- Partir el modelo funcional por secciones para que cada bloque pueda revisarse de forma independiente en MongoDB Compass.
- Incorporar las notas funcionales del modelo como documentos `gotcha` con `scope: "functional"`.
- Mantener las notas de diseno existentes como `gotcha` con `scope: "design"`.
- Regenerar el seed documental de `mapping_catalog_review` de forma idempotente.
- Mantener `meshId: "REVIEW-NOT-OPERATIONAL"` en todos los documentos de revision.
- Mantener intacta la coleccion operativa `mappings`.
- No modificar `src/`, Docker, `.env`, endpoints, contratos runtime ni `openapi.yaml`.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `jira-mapping-catalog`: amplia la capacidad de revision documental del catalogo para que las referencias del modelo funcional y sus notas sean navegables en MongoDB Compass.

## Impact

- Documentacion OpenSpec bajo `openspec/changes/completar-model-reference-y-notas-funcionales-mapping-catalog-review/`.
- Futura aplicacion limitada a `docs/mappings/scripts/build-mongo-review-seed.mjs`, `docs/mappings/evidence/pilot-local/mapping-catalog-review-seed.js` y documentacion relacionada de `docs/mappings/`.
- MongoDB solo se vera afectado si se autoriza una futura ejecucion de Apply/carga del seed documental.
- El servicio operativo no debe leer `mapping_catalog_review`; la coleccion sigue siendo una vista de revision, no fuente de verdad runtime.

## Explore Summary

- Hay que cambiar la proyeccion documental del catalogo, no el motor de mappings.
- Se cambia porque la demo en Compass debe explicar el modelo funcional sin obligar a abrir ficheros Markdown externos.
- La forma segura de hacerlo es generar documentos de revision separados, con `_id` determinista, `docType` claro y `meshId` no operativo.
- Los archivos afectados deben quedar dentro de `docs/mappings/` y `openspec/changes/`.
- El riesgo principal es mezclar datos documentales con la coleccion real `mappings`; se mitiga manteniendo coleccion separada y sentinel `REVIEW-NOT-OPERATIONAL`.
- Conviene `spec-driven`, porque regula un comportamiento documental reutilizable y verificable.
