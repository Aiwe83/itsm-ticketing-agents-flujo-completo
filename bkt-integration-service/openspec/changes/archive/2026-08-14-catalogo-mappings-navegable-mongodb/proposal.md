## Why

El modelo funcional de mappings Jira -> ticket interno ya existe en ficheros versionados, pero hoy no es comodo de revisar en una demo ni de consultar junto a los tickets procesados en MongoDB Compass.

Este cambio prepara una proyeccion navegable, regenerable y de solo lectura en MongoDB para que negocio y equipo tecnico puedan ver:

- que campos existen en el modelo funcional;
- que campos estan confirmados, pendientes, excluidos o bloqueados por el motor actual;
- que mappings futuros podrian cargarse cuando haya aprobacion;
- que ticket de ejemplo representa la forma objetivo;
- y que la coleccion operativa `mappings` no se toca durante esta fase.

La fuente de verdad seguira siendo Git. MongoDB solo sera una vista de revision para demo y consulta.

## What Changes

- Crear una coleccion nueva de revision llamada `mapping_catalog_review` en la base activa `integration-service`.
- Generar los documentos de esa coleccion desde:
  - `docs/mappings/contexts/pilot-local/catalog.json`;
  - matrices de seccion bajo `docs/mappings/contexts/pilot-local/`;
  - `docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md`;
  - `docs/mappings/modelo_de_datos_mappeos_nuevos/ejemplo_ticket.json`.
- Mantener la coleccion separada fisicamente de `mappings`.
- Usar `meshId: REVIEW-NOT-OPERATIONAL` en todos los documentos de revision para impedir que se confundan con mappings operativos.
- Crear un generador fuera de `src/` que produzca un script `mongosh` idempotente.
- Crear backup verificable de `mappings` antes de cargar la vista de revision.
- Prohibir `drop()` como mecanismo de actualizacion; la carga sera por `bulkWrite` con `updateOne` y `upsert: true`.
- Documentar una demo sencilla en MongoDB Compass para explicar catalogo, gotchas, campos confirmados, campos pendientes y ticket de ejemplo.

## Scope

Incluido:

- Documentacion OpenSpec.
- Generador documental bajo `docs/mappings/scripts/`.
- Seed generado bajo `docs/mappings/evidence/pilot-local/`.
- Guia de verificacion y demo con MongoDB Compass.
- Carga idempotente en una coleccion nueva de revision, cuando se autorice el apply.

Fuera de alcance:

- No modificar `src/`.
- No modificar endpoints.
- No modificar Docker.
- No modificar `.env`.
- No modificar `openapi.yaml`.
- No insertar ni actualizar la coleccion operativa `mappings`.
- No crear interfaz grafica.
- No promover campos pendientes a mappings reales.
- No editar datos directamente desde Compass como fuente de verdad.

## Impact

- MongoDB ganara una coleccion documental nueva: `mapping_catalog_review`.
- El servicio Node no dependera de esa coleccion ni la leera en runtime.
- `POST /api/v1/issues` seguira igual.
- La demo sera mas facil porque se podra navegar en Compass por catalogo y resultados reales sin saltar entre varios ficheros.

## Validation

- Confirmar que `mappings` queda exactamente igual antes y despues.
- Confirmar que `mapping_catalog_review` contiene el recuento esperado por `docType`.
- Confirmar que ningun documento de revision usa el mesh operativo.
- Confirmar que no existe `targetField: "content.statusSp"`.
- Confirmar que los documentos confirmados tienen `futureMapping`.
- Confirmar que el servicio sigue levantado y el smoke test de `POST /api/v1/issues` responde como antes.
