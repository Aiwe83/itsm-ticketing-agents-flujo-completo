## 1. Versionar y validar el catalogo

- [x] 1.1 Anadir `catalogVersion` semantica a cada `catalog.json` y documentar cuando debe incrementarse
- [x] 1.2 Definir un esquema de validacion para contexto, mappings confirmados y secciones documentales
- [x] 1.3 Implementar las reglas que rechazan `content.statusSp`, mappings globales de `fields`, destinos duplicados y transformadores desconocidos
- [x] 1.4 Anadir pruebas unitarias con catalogos validos e invalidos

## 2. Comparar el catalogo con MongoDB

- [x] 2.1 Implementar la identidad logica estable de un mapping y la relacion con documentos existentes
- [x] 2.2 Implementar la proyeccion que elimina `_evidence` y cualquier propiedad no perteneciente al modelo Mongo
- [x] 2.3 Implementar el comparador `added`, `updated`, `unchanged`, `conflicts` y `mongoOnly`
- [x] 2.4 Crear el comando compilable `mappings:dry-run` y registrarlo en `package.json`
- [x] 2.5 Probar que `mappings:dry-run` no realiza escrituras ni muestra datos sensibles

## 3. Aplicar mappings de forma controlada

- [x] 3.1 Implementar upserts idempotentes que preserven `_id` existentes cuando coincida la identidad logica
- [x] 3.2 Crear `mappings:apply` con `--confirm-version` obligatorio y validacion del contexto
- [x] 3.3 Garantizar que `mappings:apply` no elimina entradas `mongoOnly` ni escribe si existen conflictos
- [x] 3.4 Anadir pruebas de aplicacion repetida, version incorrecta, contexto distinto y fallo sin cambios parciales

## 4. Endurecer los transformadores

- [x] 4.1 Centralizar la lista permitida `copy`, `mapToString` y `severity`
- [x] 4.2 Sustituir el fallback silencioso por un error trazable ante transformadores desconocidos
- [x] 4.3 Anadir pruebas de los tres transformadores soportados y del rechazo de uno desconocido

## 5. Registrar la version utilizada

- [ ] 5.1 Anadir `mappingVersion` opcional a los modelos y tipos de ticket traducido y ejecucion
- [ ] 5.2 Hacer que el procesamiento adquiera una sola instantanea/version por ticket
- [ ] 5.3 Persistir la misma `mappingVersion` en el ticket final y en su ejecucion
- [ ] 5.4 Anadir pruebas de trazabilidad y compatibilidad con documentos historicos sin version

## 6. Documentacion y validacion final

- [x] 6.1 Actualizar `docs/mappings/README.md` con los comandos, protecciones y flujo de aprobacion
- [x] 6.2 Documentar un ejemplo completo de `dry-run`, `apply` y segundo `dry-run` sin diferencias
- [x] 6.3 Ejecutar typecheck, Jest con cobertura y build
- [x] 6.4 Ejecutar una prueba local contra MongoDB real y confirmar que la segunda aplicacion no crea
      duplicados (2026-08-19/20: `mappings:apply --confirm-version=1.0.0` ejecutado dos veces contra
      el Mongo real de Docker, autorizado explicitamente por el usuario — primera vez `updated:6`,
      segunda vez `unchanged:6, updated:0`, sin duplicados; verificado tambien con `POST
      /api/v1/issues` real que la traduccion sigue funcionando)
- [x] 6.5 Revisar que no se hayan cargado candidatos pendientes, excluidos ni propiedades `_evidence`
      (garantizado por diseño: `syncMappingCatalog` solo itera `catalog.mappings`, nunca
      `pendingCandidates`/`excludedFields`, y `projectCatalogMapping` proyecta una lista blanca de
      propiedades que excluye cualquier clave `_evidence`/`_*`)
