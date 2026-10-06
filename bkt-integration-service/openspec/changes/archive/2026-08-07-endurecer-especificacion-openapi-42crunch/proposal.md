# Endurecer la especificacion OpenAPI segun el Security Audit de 42Crunch

## Why

La extension 42Crunch (VSCode) audito `openapi.yaml` con reglas mas estrictas que `redocly lint --extends=minimal` (que ya pasaba en 0 errores) y devolvio un score inicial de 15/100 (Security 3/30, Data validation 12/70), con un banner bloqueante ("Your API has structural or semantic issues") que impedia ver el reporte completo. La causa no era un bug puntual: ningun `z.object()` del proyecto usaba `.strict()` y ningun `z.string()` usaba `.max()`/`.regex()` en los schemas de documentacion (`src/openapi/schemas.ts`), y el `servers` del documento usaba una URL relativa que varios analizadores estrictos rechazan. Habia que cerrar esos huecos sin tocar el comportamiento real de ingesta de tickets Jira/TC.

## What Changes

- **`security` explicito por operacion**: las 3 operaciones (`getHealth`, `getApiRoot`, `createIssues`) declaran `security: []` en vez de heredar el `security` global implicitamente.
- **`additionalProperties: false` en 13 schemas de respuesta propios**: los objetos que representan contratos de respuesta cerrados y conocidos (`ExecutionError`, `AttachedDocument`, `IssueInfo`, `IssueProcessResult`, `IssueProcessSummary`, `IssueProcessResponse`, `IssueAcceptedResponse`, `ErrorResponse` + su `error` anidado, `RateLimitErrorResponse` + su `error` anidado, `HealthResponse`, `ApiRootResponse`) pasan a `z.strictObject()`. Los schemas cuyo contrato real es abierto (`IssueContent`, su `technicianInfo` anidado, y todo lo que reutiliza `IssuePayload`/`IssueBatchRequest` del validador real) se dejan explicitamente abiertos porque el contrato lo marca la coleccion `mappings` de MongoDB o es eco literal de un payload Jira real.
- **`maxLength`/`pattern` en los campos string de documentacion**: ~34 campos `z.string()` de `src/openapi/schemas.ts` (100% doc-only) reciben cota de longitud y un patron que bloquea unicamente caracteres de control (preserva cualquier texto/unicode real).
- **`maxLength` (sin `pattern`) en los 5 campos string del validador real**: `id`, `key`, `fields.summary`, `fields.issuetype.name` e `initiatedBy` en `src/validators/issue.validator.ts` reciben solo un techo de longitud generoso. Es el unico fichero runtime-sensible tocado; decision explicita del usuario de no anadir `pattern` ahi para no arriesgar rechazar ingesta real de Jira/TC.
- **Rango realista en `statusCode`**: `errorResponseSchema.error.statusCode` pasa de un rango sin acotar (que zod4 traduce a minimo/maximo de entero seguro, `±9007199254740991`) a `.min(100).max(599)`.
- **`maxItems` en los arrays de respuesta**: `errors` (max 50), `tickets` (`length(1)`, refleja la regla de negocio real de un ticket por peticion), `attachedDocuments` (max 100) y `actions` (max 200).
- **Respuestas de error completas por operacion**: `404` en las operaciones GET, `429` en `getApiRoot` (ya existia en `createIssues`) y una respuesta `default` en las 3 operaciones, todas contrastadas contra el comportamiento real de `notFoundHandler`/`exceptionHandler`/rate limiter en `src/app.ts` y `src/middlewares/error.middleware.ts`. No se documentan `406`/`415` porque Express no los genera realmente en este servicio.
- **`servers` con URL absoluta parametrizable**: sustituye la URL relativa `'/'` por `'{protocol}://{host}'` con variables (`protocol` default `https`, enum `[https, http]`; `host` default `localhost:8000`), resolviendo el hallazgo Critical que bloqueaba el reporte completo sin perder portabilidad entre entornos.

## Capabilities

### New Capabilities

- `openapi-schema-hardening`: contrato de datos de `openapi.yaml` (additionalProperties cerrado donde el contrato es conocido, limites de longitud/patron en strings, rangos numericos realistas, limites de tamano en arrays) generado desde `src/openapi/schemas.ts` y los 5 campos acotados de `src/validators/issue.validator.ts`.
- `openapi-response-completeness`: cobertura de respuestas HTTP documentadas por operacion (`404`, `429`, `default`) alineada con el comportamiento real de los middlewares globales.
- `openapi-server-transport`: declaracion de `servers` y `security` por operacion en el documento OpenAPI.

### Modified Capabilities

No aplica: `openspec/specs/` esta vacio, no hay specs existentes que modificar.

## Impact

- **Ficheros de codigo**: `src/openapi/schemas.ts`, `src/openapi/document.ts`, `src/validators/issue.validator.ts`, `src/__tests__/openapi.test.ts` (ajuste del guardrail de responses de `createIssues`). `openapi.yaml` se regenera con `pnpm openapi:generate`, no se edita a mano.
- **Riesgo de regresion**: bajo. Todo el trabajo es doc-only salvo 5 `.max()` generosos en el validador real, verificados contra `src/__tests__/openapi.test.ts` (que re-parsea cada ejemplo real contra los schemas nuevos) y contra el fixture Jira real del repo.
- **Datos/contrato de runtime**: sin cambios de comportamiento observable en `app.ts`, `routes/`, `controllers/`, `middlewares/` ni en la logica de validacion (solo se anaden techos de longitud, nunca patrones, en el validador real).
- **Resultado medido**: Global score 15→63/100, Data validation 12→56/70 (medido en VSCode con el Security Audit real de 42Crunch entre rondas). Security score se queda en 8/30 porque el bloque mayor restante (`security` vacio en las 3 operaciones, ~21-23 puntos) requiere autenticacion real y queda fuera de alcance (ver design.md).
- **Verificacion** (desde la raiz del repo): `pnpm openapi:generate`, `pnpm openapi:lint`, `pnpm openapi:check`, `corepack pnpm exec tsc --noEmit`, `corepack pnpm exec jest --coverage --runInBand`, `corepack pnpm exec tsc`, `git diff --check`.
