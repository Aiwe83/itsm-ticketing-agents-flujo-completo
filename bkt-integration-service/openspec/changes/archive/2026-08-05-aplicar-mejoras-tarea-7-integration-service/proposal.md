# Aplicar mejoras de Tarea_7 al Integration Service BKT

## Why

Tarea_7 define 7 puntos obligatorios de endurecimiento del Integration Service BKT (Express 5 + TypeScript strict + MongoDB/Mongoose 8). La revision del estado del proyecto confirma que 6 de los 7 puntos ya estan implementados en produccion, pero hay brechas reales que cierran los puntos o los protegen contra regresiones:

1. **Sin `stack` en HTTP**: ya hecho, pero el branch de `Error` plano (no `HttpError`) queda sin test.
2. **Split 1:1 `itsm_tickets`/`tickets` con mismo `_id`**: se mantiene por convencion (`_id` deterministico), pero nada impide dos tickets distintos con el mismo `itsmTicketId` en el mismo `meshId`.
3. **Fechas `Date` reales**: ya se guardan como `Date` de Mongo, pero sin test de persistencia real.
4. **`meshId` en docs nuevos**: ya se usa; `TENANT_ID`, `PROJECT_ID` e `ITSM_ID` en `.env` son residuo muerto.
5. **DB `integration-service-bkt`**: ya activa, pero el log de conexion no muestra el nombre de la DB en arranque.
6. **Contrato orquestador `mesh_id`/`execution_id`**: correcto, pero la coleccion `Execution` no guarda QUE `execution_id`s se despacharon, imposibilitando auditar a posteriori que tickets se notificaron.
7. **Naming EN/camelCase**: hay un log en espanol en `issue.service.ts` que no sigue el sweep.
8. **Arranque robusto con env vacia**: `LOG_PRETTY_PRINT=` (o `CORS_CREDENTIALS=`) lanza excepcion en lugar de aplicar el default.

## What Changes

- **Config (`src/config/environment.ts`)**: composicion `z.preprocess(blankToUndefined, z.stringbool().default(...))` con el default DENTRO del preprocess para `LOG_PRETTY_PRINT` y `CORS_CREDENTIALS`, de modo que una env var vacia aplique el default. Se descarta `z.coerce.boolean()` (regresion silenciosa: `Boolean("false")===true` voltearia los valores de `.env.test`).
- **Modelo (`src/models/Execution.model.ts`)**: campo opcional `dispatchedExecutionIds?: StoredTicketId[]` en `IExecution` y `dispatchedExecutionIds: { type: [String], default: undefined }` en el schema (no rompe registros existentes).
- **Repositorio (`src/repositories/execution.repository.ts`)**: metodo nuevo `setDispatchedExecutionIds(executionId, executionIds)` siguiendo el patron `findByIdAndUpdate` + `.exec()` de los existentes.
- **Servicio (`src/services/issue.service.ts`)**: dentro de `if (orchestratorDispatched)`, antes del bloque fire-and-forget, `await this.executions.setDispatchedExecutionIds(executionRecordId, orchestratorTickets.map(t => t.storedTicketId))`. El `await` es deliberado (fallo de trazabilidad visible en la respuesta; la notificacion sigue siendo fire-and-forget). No debe ir fuera del `if`. Ademas, el log de postproceso pasa a ingles: `'Failed to trace ticket post-processing'`.
- **Orquestador (`src/services/orchestrator.service.ts`)**: comentario en `serializePayload` documentando que `execution_id` es el `_id` del ticket persistido en `itsm_tickets` (`storedTicketId = ${meshId}:${ticketKey}`).
- **Indices (`src/config/database-indexes.ts`)**: indice unico `meshId_1_itsmTicketId_1` en `tickets` con pre-check de duplicados por agregacion; si hay duplicados se loggea warning y NO se crea el indice (no rompe datos existentes).
- **DB (`src/config/database.ts`)**: log `logger.info({ database: mongoose.connection.name }, 'Mongoose connected to MongoDB')` inmediatamente despues de `await mongoose.connect(url, options)`, no en el listener `connected` (que nunca dispara en arranque porque Mongoose emite el evento dentro del connect, antes de registrar listeners).
- **Tests**: nuevo `src/__tests__/environment.test.ts` (patron `require()` + `jest.resetModules()`); asserts de fechas `instanceof Date` sin `.lean()` en `issues.integration.test.ts`; test de `Error` plano en `error.middleware.test.ts`; stub `setDispatchedExecutionIds` en `issue.service.test.ts`; assert `indexExists('meshId_1_itsmTicketId_1')` en `database-indexes.test.ts`; assert `dispatchedExecutionIds: [storedTicketId]` en `issues.integration.test.ts`.
- **Documentacion (Punto 4)**: sin codigo. `.env` (con datos reales) NO se toca. `TENANT_ID`, `PROJECT_ID`, `ITSM_ID` quedan documentados como residuo muerto para decision del usuario.

## Capabilities

### New Capabilities

- `env-var-hardening`
- `execution-dispatched-traceability`
- `ticket-unique-index`
- `real-date-persistence`
- `db-name-visibility`
- `english-naming-sweep`
- `error-middleware-plain-error-test`
- `dotenv-residue-documented`

### Modified Capabilities

No aplica: `openspec/specs/` esta vacio, no hay specs existentes que modificar.

## Impact

- **Riesgo de regresion**: bajo. Todos los cambios son aditivos (campo opcional, metodo nuevo, log nuevo) o protegidos (indice unico solo si no hay duplicados; `z.stringbool()` preserva el parseo estricto de `.env.test`).
- **Datos existentes**: no se migra ni se reescribe nada. El indice unico se omite si existen duplicados; `dispatchedExecutionIds` es opcional (`default: undefined`).
- **Compatibilidad de contrato**: el payload del orquestador no cambia (`mesh_id`, `execution_id` = `_id` de `itsm_tickets`).
- **Secretos**: `.env` y `.env.test` (este ultimo contiene una credencial real de MongoDB) no se modifican ni se imprimen.
- **Verificacion** (desde la raiz del repo): `corepack pnpm exec tsc --noEmit`, `corepack pnpm exec jest --coverage --runInBand`, `corepack pnpm exec tsc`, `git diff --check`.
