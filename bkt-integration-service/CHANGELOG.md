# Changelog

## Unreleased

### Added

- Pipeline de promocion `catalog.json` -> MongoDB: `pnpm mappings:dry-run` /
  `pnpm mappings:apply -- --confirm-version=<x>` (`src/services/mapping-catalog.service.ts`,
  `src/scripts/sync-mapping-catalog.ts`). Valida el catalogo, compara contra la coleccion
  `mappings` real por identidad logica (`meshId+sourceField+targetField`, nunca por `_id`) y
  aplica de forma idempotente sin duplicar ni borrar entradas cargadas fuera del catalogo
  (`mongoOnly`). Implementa los grupos 1-4 del change OpenSpec `operacionalizar-catalogo-mappings`.
- `catalogVersion` en `docs/mappings/contexts/pilot-local/catalog.json`, exigido por el validador
  nuevo del pipeline de promocion.
- Generacion y validacion de `openapi.yaml` desde los schemas del servicio.
- Catalogo versionado de mappings Jira -> modelo interno en `docs/mappings/`.
- Cobertura automatizada para validacion, persistencia, adjuntos, contrato OpenAPI y trazabilidad de ejecucion.
- Vista documental de solo revision (`mapping_catalog_review`, 184 documentos) navegable en
  MongoDB Compass: 163 campos del catalogo (confirmados, pendientes, excluidos y bloqueados por
  motor), las 4 secciones del modelo funcional con su texto completo, sus 10 notas funcionales y
  un ticket de ejemplo sanitizado. Generada por `docs/mappings/scripts/build-mongo-review-seed.mjs`
  (fuera de `src/`, no forma parte del runtime). Coleccion fisicamente separada de `mappings`, con
  `meshId: "REVIEW-NOT-OPERATIONAL"` para que nunca coincida con un mesh real.
- `docs/mappings/Cantidad_campos_pendientes_implementacion.md`: cuantia real, verificada en vivo,
  de campos del catalogo listos para implementar frente a los que siguen pendientes de decision de
  negocio.
- Evidencia de campos nativos de Jira (`json_modelo_datos _1.md`) cruzada contra el catalogo de
  mappings: 9 entradas `pending-validation` de `catalog.json` documentan ahora que su campo Jira
  existe de forma nativa, sin cambiar su decision (la ruta de lectura o el destino interno siguen
  sin confirmar). Se marcan ademas 2 conflictos sin resolver: `Entorno` tiene dos posibles origenes
  Jira distintos, y `Grado de urgencia` no debe fusionarse con `priority`/`content.severityLevel`.
  Cero mappings nuevos confirmados; cero cambios en `mappings` ni en `src/`.
- `catalog.json`: nota explicita (`notes[]`) documentando que 4 mappings de `assignee.*` y
  `components` estan cargados como operativos en la coleccion `mappings` real, aunque el catalogo
  los mantiene a proposito como `pending-validation` por ambiguedad sin resolver. Cero mappings
  promovidos a `confirmed`, cero cambios en Mongo.
- `docs/mappings/README.md`: nueva seccion con el desglose real de los 163 campos documentados —
  cuantos estan cargados de verdad en `mappings` frente a `confirmed`-duplicado, `pending-validation`,
  `excluded` y `blocked` por motor.
- `docs/mappings/evidence/pilot-local/README.md`: nueva seccion aclarando que la coleccion
  `mapping_catalog_review` es documentacion de revision, no datos de prueba desechables.

### Changed

- Estandarizacion del contexto operativo alrededor de `meshId`.
- Nombre tecnico del despliegue y de la base activa alineado con `integration-service`.
- Documentacion principal del repositorio simplificada y orientada al uso operativo.

### Fixed

- El detalle tecnico de error ya no sale en respuestas HTTP.
- El flujo mantiene persistencia 1:1 entre `itsm_tickets` y `tickets`.
- Las fechas del dominio se almacenan y se validan como fechas reales.
- La ejecucion registra el despacho posterior sin bloquear la recepcion del ticket.
- Los adjuntos compatibles se convierten a texto plano dentro del flujo principal.
- Un `transformer` de mapping desconocido ya no cae en silencio a `copy`
  (`src/utils/issue.util.ts`); lanza un error trazable.
- `src/services/mapping-catalog.service.ts` tenia 2 bytes NUL escondidos dentro de un template
  literal (funcion `logicalKey`), en vez de espacios normales — sin efecto funcional observable,
  pero corregido.
- Los 6 mappings confirmados en la coleccion `mappings` real tenian metadata desincronizada
  (descripcion copy-pasteada de otro mapping, `required` incorrecto en 2 de ellos) — corregido en
  directo con `pnpm mappings:apply`, verificado con un `POST /api/v1/issues` real posterior.

## 2026-08-12

### Added

- **BREAKING**: autenticacion por API key (`X-API-KEY`, nombre configurable via `API_KEY_HEADER`)
  obligatoria en `GET /api/v1` y `POST /api/v1/issues`; `GET /health` queda publico a proposito.
  La variable de entorno `API_KEY` pasa a ser obligatoria (el servicio no arranca sin ella).
- `openapi.yaml`: `security` explicito y `401` documentado en las 2 operaciones protegidas,
  `securitySchemes.ApiKeyAuth` deja de estar marcado como no aplicado.

### Changed

- `openapi.yaml`: el enum de `protocol` en `servers` pierde `http` (solo `https`); los campos
  string del validador real de Jira/TC llevan ahora un `pattern` que bloquea solo caracteres de
  control; los objetos abiertos (`additionalProperties`) referencian un schema tipado (`JsonValue`)
  en vez de quedar sin tipo, manteniendo el contrato tan abierto como antes.

## 2026-08-07

### Added

- Especificacion OpenAPI 3.0.3 para los endpoints reales del servicio.
- Scripts para generar, comprobar y validar el contrato OpenAPI.

### Changed

- Se reforzo la documentacion del contrato HTTP a partir de la implementacion tipada.

## 2026-08-05

### Fixed

- Eliminacion de `stack` en respuestas.
- Refuerzo del indice unico para la relacion 1:1 de tickets.
- Validacion de fechas persistidas y trazabilidad de ejecucion.

## 2026-07-31

### Changed

- Renombrado funcional del proyecto a `INTEGRATION-SERVICE`.
- Ajuste del nombre tecnico de despliegue a `integration-service`.
- Adaptacion de la documentacion operativa al contexto `meshId`.

## 2026-07-30

### Added

- Primera version del catalogo de mappings campo a campo.
- Matriz funcional de datos basicos y evidencias sanitizadas para revision.

## 2026-07-29

### Changed

- Renombrado del campo traducido de estado a `content.status`.
- Procesamiento posterior lanzado en segundo plano.

### Added

- Conversion de adjuntos compatibles a texto plano dentro del flujo principal.

## 1.0.0-SNAPSHOT - 2025-11-12

### Added

- Estructura inicial del servicio con Express, TypeScript y MongoDB.
- Validaciones de entrada con Zod.
- Persistencia del ticket bruto, mappings, ticket traducido y ejecucion.
- Integracion HTTP con el siguiente componente del flujo.

