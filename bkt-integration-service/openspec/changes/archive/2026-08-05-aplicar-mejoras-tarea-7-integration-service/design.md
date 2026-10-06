# Design — Aplicar mejoras de Tarea_7 al Integration Service BKT

## Context

El Integration Service BKT (Express 5 + TypeScript strict + MongoDB/Mongoose 8) ya implementa en produccion 6 de los 7 puntos de Tarea_7. La revision del proyecto confirmo brechas reales: env vars vacias (`LOG_PRETTY_PRINT=`, `CORS_CREDENTIALS=`) lanzan excepcion en arranque, la coleccion `Execution` no registra que `execution_id`s se despacharon al orquestador, el split 1:1 `itsm_tickets`/`tickets` no tiene indice unico que impida duplicados, y quedan logs en espanol que no siguen el sweep de naming.

La implementacion ya esta verificada verde (11 suites, 48 tests; typecheck, build y `git diff --check` correctos). Este change la estructura en OpenSpec: `proposal.md` motiva el cambio, `design.md` explica el como, `specs/` define el que y `tasks.md` descompone la implementacion para que se pueda aplicar sin contexto externo.

## Goals / Non-Goals

**Goals:**
- Cerrar las brechas reales de los 7 puntos de Tarea_7 sin romper comportamiento existente.
- Arranque robusto con env vars vacias aplicando defaults.
- Trazabilidad a posteriori de que `execution_id`s se notificaron al orquestador.
- Garantia de unicidad `{ meshId, itsmTicketId }` en `tickets` sin romper datos existentes.
- Visibilidad del nombre de la DB activa en el log de conexion.
- Naming EN/camelCase en todo el codigo.
- Tests que protegen cada mejora contra regresiones.

**Non-Goals:**
- No se implementa codigo nuevo de negocio (autenticacion, validacion de `severityLevel`).
- No se toca `.env` real (contiene datos y credenciales reales).
- No se migra ni reescribe ningun documento existente.
- No se reintroducen `tenantId`, `projectId`, `itsmId` ni `content.statusSp`.
- No se usa `z.coerce.boolean()` (regresion silenciosa documentada).

## Decisions

### D1: Env var vacia → default (Paso 0)

Composicion `z.preprocess(blankToUndefined, z.stringbool().default(false))` con el default DENTRO del preprocess, aplicada a `LOG_PRETTY_PRINT` y `CORS_CREDENTIALS` en `src/config/environment.ts`.

- **Por que**: `z.stringbool()` preserva el parseo estricto (`'false'`→`false`, `'true'`→`true`) de los valores de `.env.test`.
- **Alternativa rechazada**: `z.coerce.boolean()` — `Boolean("false")===true` voltearia `LOG_PRETTY_PRINT=false` y `CORS_CREDENTIALS=false` a `true`; y `CORS_CREDENTIALS=true` con `CORS_ORIGIN='*'` es combinacion rechazada por navegador.
- **Alternativa rechazada**: default fuera del preprocess (`z.preprocess(blankToUndefined, z.stringbool()).default(false)`) — verificado empiricamente que falla: `''`→`undefined`→`z.stringbool()` lanza antes de que el default exterior aplique.

### D2: Trazabilidad del execution_id despachado (Punto 6)

Campo opcional `dispatchedExecutionIds?: StoredTicketId[]` en `IExecution` y `dispatchedExecutionIds: { type: [String], default: undefined }` en el schema (`src/models/Execution.model.ts`). Metodo nuevo `setDispatchedExecutionIds(executionId, executionIds)` en `src/repositories/execution.repository.ts` siguiendo el patron `findByIdAndUpdate` + `.exec()` de los existentes. En `src/services/issue.service.ts`, `await this.executions.setDispatchedExecutionIds(...)` DENTRO de `if (orchestratorDispatched)`, antes del bloque fire-and-forget.

- **Por que el `await` es deliberado**: un fallo en el registro de trazabilidad debe ser visible en la respuesta; la notificacion al orquestador sigue siendo fire-and-forget e independiente.
- **Por que dentro del `if`**: un `await` incondicional escribiria `[]` en cada ejecucion (incluidas las que no notificaron nada) y `dispatchedExecutionIds` perderia el significado de "solo registra lo que realmente se despacho".
- **Campo opcional**: `default: undefined` no rompe registros existentes ni `createExecution`.

### D3: Indice unico meshId + itsmTicketId (Punto 2)

Indice unico `meshId_1_itsmTicketId_1` en `tickets` (`src/config/database-indexes.ts`), con pre-check de duplicados por agregacion. Si existen duplicados, se loggea warning y NO se crea el indice.

- **Por que el pre-check**: `createIndex(..., { unique: true })` fallaria con error E11000 si hay duplicados, rompiendo el arranque del servicio. El pre-check hace la mejora segura sobre datos existentes.
- **Alternativa rechazada**: limpiar duplicados automaticamente — destructivo y fuera de alcance; no se tocan datos.

### D4: Visibilidad de la DB activa (Punto 5)

En `src/config/database.ts`, `logger.info({ database: mongoose.connection.name }, 'Mongoose connected to MongoDB')` inmediatamente despues de `await mongoose.connect(url, options)`, antes de `setupEventListeners()`.

- **Por que**: Mongoose emite el evento `connected` DENTRO del connect, antes de que se registren los listeners → un log en el listener `connected` nunca dispara en arranque.

### D5: Tests de persistencia real de fechas (Punto 3)

Asserts `instanceof Date` leyendo con `.exec()` (sin `.lean()`) en `src/__tests__/issues.integration.test.ts`.

- **Por que**: `.lean()` convierte los documentos a POJO y los `Date` dejan de ser instancias.
- **Alcance**: `createdAt`/`updatedAt` en `itsm_tickets` y `tickets`; `startTime`/`endTime` en `Execution`. NO sobre `content` (Schema.Types.Mixed: ahi las fechas son strings y `instanceof Date` fallaria).

### D6: Test de Error plano en el middleware (Punto 1)

Test en `src/__tests__/error.middleware.test.ts` para un `Error` plano (no `HttpError`): status 500 por defecto, body con `err.message`, sin `stack`.

- **Nota**: en tests `IS_LOCAL=true` expone el mensaje real, no el generico 'Internal Server Error'. El `stack` queda en logs, nunca en la respuesta HTTP.

### D7: environment.test.ts (Paso 0, test)

`src/__tests__/environment.test.ts` con patron `require()` + `jest.resetModules()`.

- **Por que**: el `import()` dinamico falla en Jest CJS sin `--experimental-vm-modules`. Se setean las env vars minimas requeridas antes de `require()`: `NODE_ENV` (valor valido del enum), `MONGODB_USERNAME`, `MONGODB_PASSWORD`, `MONGODB_HOST`, `MONGODB_DATABASE`, `ORCHESTRATOR_BASE_URL` (URL valida para `z.url()`), `ORCHESTRATOR_ENDPOINT`, `MESH_ID` y los 4 nombres de coleccion.

## Risks / Trade-offs

- [Indice unico se omite si hay duplicados] → No se logra unicidad sobre datos ya duplicados; queda warning loggeado y la proteccion aplica a datos nuevos. El indice se crea en cuanto no haya duplicados.
- [`await setDispatchedExecutionIds` anade latencia a la respuesta] → Despreciable (una update por `_id`); el beneficio de trazabilidad supera el coste.
- [`dispatchedExecutionIds` puede quedar ausente en ejecuciones antiguas] → Esperado: solo registra ejecuciones nuevas con despacho; no hay migracion ni backfill.
- [Cambios en el parseo de env podrian alterar el arranque] → `z.stringbool()` mantiene el parseo estricto; `environment.test.ts` cubre defaults y valores explicitos.

## Migration Plan

No hay migracion de datos. Todos los cambios son aditivos (campo opcional, metodo nuevo, log nuevo) o protegidos (indice unico solo si no hay duplicados). Rollback: revertir el change; los registros existentes no dependen del campo opcional.

## Open Questions

- `ATTACHMENT_BYTES_LIMIT` (`.env`) tiene el mismo defecto de default fuera del preprocess — candidato a change futuro; fuera de alcance de Tarea_7.
- `TENANT_ID`, `PROJECT_ID`, `ITSM_ID` en `.env` son residuo muerto — decision del usuario si se limpian; este change solo lo documenta.
