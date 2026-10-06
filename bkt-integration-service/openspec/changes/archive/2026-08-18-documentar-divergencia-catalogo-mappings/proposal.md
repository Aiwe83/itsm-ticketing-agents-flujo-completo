## Why

Una revision de esta sesion encontro dos riesgos reales en como el catalogo de mappings se
documenta a si mismo. Primero: `catalog.json` mantenia 4 mappings (`fields.assignee.accountId`,
`fields.assignee.emailAddress`, `fields.assignee.displayName`, `fields.components`) como
`pending-validation`, sin avisar en ningun sitio que esos mismos 4 ya estan cargados como
operativos en la coleccion real `mappings` de MongoDB — cualquiera que leyera solo `catalog.json`
asumiria que hay 6 mappings operativos, no 10. Segundo: la coleccion documental
`mapping_catalog_review` estuvo a punto de borrarse por parecer una tabla de pruebas desechable,
cuando en realidad es la unica lista navegable de los 139 campos que siguen pendientes de
confirmacion de negocio. Ambos riesgos vienen de lo mismo: el catalogo no dejaba constancia
explicita de su propio estado conocido. Este change corrige la documentacion existente y anade el
requisito correspondiente para que la omision no se repita.

## What Changes

- `docs/mappings/contexts/pilot-local/catalog.json`: nueva entrada en `notes[]` que documenta
  explicitamente la divergencia entre los 4 mappings cargados en Mongo y su estado
  `pending-validation` en el catalogo. Ningun mapping se promueve a `confirmed`.
- `docs/mappings/README.md`: nueva seccion "Cuantos campos estan realmente cargados en Mongo" con
  el desglose completo de los 163 campos documentados (10 operativos reales, 15 `confirmed` con 9
  duplicados, 139 `pending-validation`, 8 `excluded`, 1 `blocked`).
- `docs/mappings/evidence/pilot-local/README.md`: nueva seccion que aclara que
  `mapping_catalog_review` es una vista documental de revision, no datos de prueba desechables, y
  no debe borrarse.
- `docs/mappings/Cantidad_campos_pendientes_implementacion.md`: nueva seccion de divergencia con
  tabla de los 4 mappings afectados; la seccion de mappings operativos se retitula a "(limpio)"
  para distinguirla de los 4 con divergencia.
- `README.md` (raiz): referencia nueva al desglose real de campos cargados.
- `docs/README.md`: aviso sobre la naturaleza de `mapping_catalog_review`.
- `CHANGELOG.md`: 4 bullets nuevos bajo `Unreleased`/`Added` documentando estos mismos cambios.
- `docs/mappings/Resumen_cantidad_mappings.md` (nuevo): resumen de una pagina con la misma
  cuantia (163 documentados, 10 reales en Mongo, desglose por estado), la tabla de los 6 mappings
  limpios y la de los 4 con divergencia, pensado como referencia rapida sin tener que leer
  `Cantidad_campos_pendientes_implementacion.md` completo.

Ningun fichero de `src/`, `openapi.yaml`, ni la coleccion `mappings` de MongoDB se modifica. Este
change es exclusivamente documental y ya esta aplicado en el arbol de trabajo; este proposal lo
formaliza con trazabilidad OpenSpec.

Nota de alcance: esta propuesta se limita a cambios versionados de OpenSpec y documentacion
del catalogo. Los ficheros locales no versionados quedan fuera del alcance del cambio.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `jira-mapping-catalog`: se anaden dos requisitos nuevos — (1) el catalogo MUST documentar
  explicitamente cualquier divergencia conocida entre lo clasificado en `catalog.json` y lo
  realmente cargado en la coleccion `mappings`, y (2) la documentacion del proyecto MUST distinguir
  `mapping_catalog_review` de datos de prueba desechables.

## Impact

- **Codigo**: ninguno. No se toca `src/`, `openapi.yaml`, tests, ni configuracion de build.
- **MongoDB**: ninguno. Cero escrituras en `mappings` ni en `mapping_catalog_review`.
- **Documentacion**: 8 ficheros versionados en Git (listados arriba, 1 nuevo), ya editados.
- **Otros changes OpenSpec**: sin solapamiento con `operacionalizar-catalogo-mappings` (ese change
  cubre el pipeline `mappings:dry-run`/`mappings:apply` para sincronizar catalogo y Mongo; este
  change documenta el estado actual, no construye ninguna herramienta nueva).
