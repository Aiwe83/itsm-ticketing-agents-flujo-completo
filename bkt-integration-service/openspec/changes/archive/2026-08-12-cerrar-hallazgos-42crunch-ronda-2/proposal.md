## Why

El Security Audit de 42Crunch sobre `openapi.yaml` devuelve 28 hallazgos. La ronda anterior
(`archive/2026-08-07-endurecer-especificacion-openapi-42crunch`) subió el score global de 15 a
63/100 pero dejó fuera de alcance a propósito el bloque más grande: `security: []` en las 3
operaciones (~21 de 28 puntos High), porque cerrarlo exige autenticación real, no solo
documentación. Su `design.md` dejó la pregunta abierta explícitamente. Esta ronda la responde: sí,
y además cierra el resto de hallazgos Medium/Info de schema que quedaban pendientes.

## What Changes

- **BREAKING**: nuevo middleware de API key (cabecera `X-API-KEY`, nombre configurable vía
  `API_KEY_HEADER`) protege `GET /api/v1` y `POST /api/v1/issues`. `GET /health` se queda público
  a propósito (sonda liveness/readiness).
- **BREAKING**: `API_KEY` pasa a ser variable de entorno requerida (sin `.default()`) — el
  servicio no arranca sin ella. Fail-closed, sin modo "sin auth" condicionado por `NODE_ENV`.
- `securitySchemes.ApiKeyAuth` deja de ser un esquema documentado-pero-no-usado
  (`x-enforced: false`): pasa a referenciarse desde `security` en las 2 operaciones protegidas, y
  ambas declaran una respuesta `401`.
- `servers.variables.protocol` pierde `http` del enum (queda solo `https`). Cierra "API accepts
  HTTP requests in the clear" y, junto con el punto anterior, "API keys sent in cleartext header".
- **Revoca** un requirement ya promovido: los 5 campos string del validador de runtime
  (`issuePayload.id`, `.key`, `fields.summary`, `fields.issuetype.name`, `issueBatch.initiatedBy`)
  pasan a llevar el `pattern` permisivo (`freeText`) que ya usa el resto del proyecto, en vez de
  quedarse sin patrón.
- Los esquemas hoy "abiertos sin tipo" (`additionalProperties: {}` en `IssuePayload` /
  `IssueBatchRequest` / sus objetos anidados, y `ErrorResponse.error.details: {}`) pasan a apuntar
  a un nuevo schema `JsonValue` (unión recursiva tipada) en vez de un `{}` vacío. El contrato
  runtime no cambia: se sigue aceptando cualquier clave extra de Jira/mappings.
- Limpieza de generación (no observable en el contrato): el único `allOf` de una sola rama que
  produce el generador se colapsa a un `$ref` directo.

## Capabilities

### New Capabilities

- `api-key-authentication`: exige y valida una API key en las operaciones bajo `/api/v1`, con
  `/health` exento, `API_KEY` obligatoria en el entorno, y la declaración `security`/`401`
  correspondiente en el documento OpenAPI generado.

### Modified Capabilities

- `openapi-schema-hardening`: revoca el requirement "Runtime validator string fields ... SHALL NOT
  declare a content pattern" (pasa a exigir el `pattern` permisivo); matiza "Mapping-driven and
  echoed schemas remain open" para exigir que el `additionalProperties` abierto sea un schema
  tipado (`JsonValue`), no un `{}` vacío.
- `openapi-server-transport`: `servers.variables.protocol` pasa de `enum: [https, http]` a
  `enum: [https]`.

## Impact

- Código: `src/config/environment.ts`, `src/middlewares/auth.middleware.ts` (nuevo),
  `src/routes/index.ts`, `src/openapi/document.ts`, `src/openapi/schemas.ts`,
  `src/validators/string.schemas.ts` (nuevo), `src/validators/issue.validator.ts`.
- Contrato HTTP: `GET /api/v1` y `POST /api/v1/issues` requieren `X-API-KEY` desde este cambio;
  cualquier cliente existente debe empezar a enviarla.
- Entorno: `.env.example`, `.env.test`, `docker-compose*.yml` necesitan `API_KEY`.
- Change abierto relacionado `endurecer-ingesta-jira-piloto`: sus tareas 2.1/2.2 (middleware de
  API key, proteger `/api/` dejando `/health` libre) quedan cubiertas por este change y se marcan
  como hechas ahí, referenciando este change.
- Genera de nuevo `openapi.yaml` vía `pnpm openapi:generate` (fichero generado, no se edita a mano).
