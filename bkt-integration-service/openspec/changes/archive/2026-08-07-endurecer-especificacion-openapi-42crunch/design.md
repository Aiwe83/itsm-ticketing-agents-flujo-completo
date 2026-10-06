# Design — Endurecer la especificacion OpenAPI segun el Security Audit de 42Crunch

## Context

`openapi.yaml` es un fichero generado (no se edita a mano) desde `src/openapi/{schemas,examples,document}.ts` via `z.registry()` + `z.toJSONSchema()` (`target: 'openapi-3.0'`, `io: 'input'`). Solo dos ficheros definen los `z.object()`/`z.string()` que terminan en el documento: `src/openapi/schemas.ts` (100% doc-only — nunca se usa para validar datos reales, solo se re-parsea contra ejemplos fijos en `src/__tests__/openapi.test.ts`) y `src/validators/issue.validator.ts` (el unico validador que corre en runtime real sobre payloads Jira/TC entrantes en `POST /api/v1/issues`).

El audit de 42Crunch aplico reglas de seguridad de API mucho mas estrictas que el linter existente (`redocly lint --extends=minimal`, que ya pasaba en 0 errores) y devolvio Global score 15/100 con un banner bloqueante que impedia ver el reporte completo ("Your API has structural or semantic issues"). La causa raiz identificada tras inspeccionar `node_modules/zod/v4/core/to-json-schema.js` fue sistemica: ningun objeto usaba `.strict()` y ningun string tenia `.max()`/`.regex()`, mas dos problemas puntuales que bloqueaban el reporte (un rango numerico absurdo en `statusCode` y una URL de servidor relativa).

La implementacion se hizo en 4 rondas, cada una verificada en verde y con el score real re-medido en VSCode entre rondas, lo que permitio confirmar o descartar hipotesis sobre la causa de cada bloqueo (ver Decisiones D5 y D7).

## Goals / Non-Goals

**Goals:**
- Cerrar los 4 hallazgos Medium originales de la pestana Priority (`additionalProperties` abierto, string sin `pattern`, string sin `maxLength`, ambos en request y response) donde el contrato real lo permite.
- Desbloquear el reporte completo de 42Crunch (banner "structural or semantic issues") sin adivinar la causa: verificar cada hipotesis con datos reales del propio audit.
- Mantener exactamente el mismo comportamiento observable de la API: cero cambios en `app.ts`, `routes/`, `controllers/`, `middlewares/`, y en `validators/` solo limites de longitud, nunca patrones que puedan rechazar trafico real.
- Cada cambio de schema debe estar respaldado por el mismo contrato que ya usa el codigo real (p.ej. `tickets.length(1)` porque el negocio ya exige un unico ticket por peticion).

**Non-Goals:**
- No se implementa autenticacion real (`X-API-KEY`) para cerrar el hallazgo "security section contains empty array" (High, ~21-23 puntos, el bloque de score mas grande que queda). Es una feature de runtime, no un fix de documentacion; README ya documenta esto como riesgo aceptado ("Estado De Seguridad"). Se deja para un change aparte si el usuario lo decide.
- No se tipa `errorResponseSchema.error.details` de forma exacta. Es intencionalmente polimorfico (`ValidationError` vs `AggregateValidationError.errors[]`, ver `src/errors/validation.ts`, 11 formas distintas de `ZodIssue`); tiparlo exigiria ~12 variantes de schema para cerrar un hallazgo de impacto marginal.
- No se anade `pattern` a los 5 campos del validador real (`id`, `key`, `summary`, `initiatedBy`, `issuetype.name`) — decision explicita del usuario, solo `maxLength`.
- No se documentan respuestas `406`/`415` — Express no las genera realmente en este servicio (sin `res.format()`, y `express.json()` no lanza 415 ante Content-Type incorrecto).

## Decisions

### D1: `z.strictObject()` solo en contratos de respuesta 100% propios

13 schemas de `src/openapi/schemas.ts` pasan a `z.strictObject()`. Se excluyen explicitamente `IssueContent` (su propio comentario en codigo ya documenta que el contrato lo marca la coleccion `mappings` de MongoDB), el `technicianInfo` anidado dentro de `IssueContent` (mismo motivo: `setValueByPath` en `src/utils/issue.util.ts` escribe rutas arbitrarias de `mapping.targetField` sin whitelist) y todo lo que reutiliza `IssuePayload`/`IssueBatchRequest` importados del validador real (eco literal de un payload Jira, forzarlo a cerrado documentaria una restriccion que no existe).
- **Por que**: son los unicos 13 objetos cuyo contrato SI esta completamente enumerado y bajo control del propio codigo — cerrarlos no puede rechazar nada real porque nosotros generamos esos campos.
- **Alternativa rechazada**: cerrar tambien `IssueContent`/`IssuePayload` — habria roto la semantica ya documentada y probablemente los ejemplos reales de `src/openapi/examples.ts` (validado por el test `openapi.test.ts` que re-parsea cada ejemplo).

### D2: dos helpers de string (`freeText`/`token`) en vez de un patron por campo

En vez de disenar un `pattern` a medida para cada uno de los ~34 campos string, se definieron 2 helpers privados en `schemas.ts`: `freeText(max)` (bloquea solo caracteres de control, permite cualquier texto/unicode real) y `token(max)` (sin espacios ni control chars, para identificadores que el propio codigo compone como `${MESH_ID}:${ticketKey}`).
- **Por que**: un patron estricto por campo (p.ej. forzar el formato exacto de una key Jira) es fragil ante datos reales que no controlamos; bloquear solo caracteres de control cierra el vector de ataque real (log/log-injection, control chars) sin arriesgar falsos rechazos.
- **Alternativa rechazada**: patrones especificos por campo — mayor precision teorica, pero cada uno es una superficie nueva de falsos positivos contra datos reales de Jira/TC que no se pueden enumerar de antemano.

### D3: en el validador real, solo `maxLength` — decision explicita del usuario

Los 5 campos de `src/validators/issue.validator.ts` (`id`, `key`, `fields.summary`, `fields.issuetype.name`, `initiatedBy`) reciben unicamente `.max()` generoso (128-500 segun el campo), sin `.regex()`.
- **Por que**: es el unico fichero runtime-sensible tocado en todo el change. Se le presento al usuario la disyuntiva explicita (solo `maxLength` / `maxLength`+`pattern` / no tocar) via pregunta de opcion multiple, y eligio la opcion mas conservadora. Un `.max()` generoso no puede rechazar trafico real (solo pone techo a inputs patologicos); un `.regex()` si podria, sobre texto libre externo que no controlamos.
- **Consecuencia aceptada**: como `IssuePayload` se reutiliza tal cual dentro de `IssueProcessResult.issue` en la respuesta 201 (mismo `$ref`, no una copia), el hallazgo "no pattern" persiste tambien en el bucket response para esos mismos 4 campos. No es un fallo de ejecucion, es la misma decision propagandose por el `$ref` compartido.

### D4: `statusCode` acotado a 100-599

`errorResponseSchema.error.statusCode` pasa de `z.number().int()` (sin bounds → zod4 lo traduce a `minimum: -9007199254740991, maximum: 9007199254740991`) a `.min(100).max(599)`.
- **Por que**: cubre los unicos valores reales que usa el codigo (200, 201, 400, 429, 503) con margen para cualquier codigo HTTP valido; el rango anterior era semanticamente absurdo para un status HTTP.

### D5: `servers` con URL absoluta parametrizable (no relativa)

Se sustituyo `servers: [{ url: '/' }]` por `servers: [{ url: '{protocol}://{host}', variables: { protocol: {default:'https', enum:['https','http']}, host: {default:'localhost:8000'} } }]`.
- **Por que**: en la Ronda 2 se descarto este hallazgo (Critical, pero "impacto de score 0") como fuera de alcance. En la Ronda 4, evidencia directa del propio audit lo contradijo: al pulsar el enlace "here" del banner bloqueante, 42Crunch filtro la lista a exactamente ese unico hallazgo, y el Security score llevaba 2 rondas clavado en 8/30 mientras Data validation seguia subiendo — la combinacion senalaba que el analisis de seguridad no se estaba completando por ese motivo. Se reabrio la decision con el usuario y se opto por variables con `https` por defecto (mantiene `http` como opcion real y honesta para el stack local de `docker-compose.yaml`, puerto 8000) en vez de una URL fija, preservando la portabilidad entre entornos que buscaba el diseno original.
- **Alternativa rechazada**: URL absoluta fija de un entorno concreto — habria contradicho el diseno multi-entorno original sin necesidad, ya que las server variables resuelven el mismo problema sin perder portabilidad.
- **Leccion**: un hallazgo con "impacto de score 0" no es sinonimo de "sin efecto real" cuando el propio banner bloqueante lo senala como estructural — antes de descartar un Critical solo por su impacto numerico conviene comprobar si esta bloqueando el resto del analisis.

### D6: respuestas HTTP documentadas solo si son comportamiento real verificado

`404` (GET), `429` (`/api/` prefix) y `default` se anadieron tras leer `src/app.ts` y `src/middlewares/error.middleware.ts` y confirmar que `notFoundHandler` y `exceptionHandler` son catch-all globales reales, y que el rate limiter solo esta montado en `/api/`. `406`/`415` NO se anadieron: Express no los genera en este servicio (sin negociacion de contenido; `express.json()` no lanza 415, deja el body vacio y eso cae en un 400 de validacion).
- **Por que**: documentar una respuesta que la API no puede dar realmente es peor que dejar el hallazgo abierto — es un contrato falso.

### D7: hallazgos con impacto de score bajo/cero no se descartan sin verificar la hipotesis del banner

Cada vez que el banner "structural or semantic issues" persistio tras una ronda, la siguiente ronda solo se disenaba si habia una hipotesis verificable (rango de `statusCode`, filtro del propio banner senalando `servers`) en vez de adivinar. Esto evito gastar esfuerzo en hallazgos de bajo impacto (`ApiKeyAuth no usado`, `Example not consistent`, ambos Info/impacto 0) que resultaron ser ruido real, mientras que el hallazgo de `servers` (tambien "impacto 0" a primera vista) resulto ser el bloqueador real.

## Risks / Trade-offs

- [Los 5 campos del validador real siguen sin `pattern`] → Riesgo residual bajo y aceptado explicitamente por el usuario; el `maxLength` generoso ya cierra la superficie de ataque de mayor impacto (inputs de tamano no acotado).
- [`servers` con `http` en el enum sigue disparando "API accepts HTTP requests in the clear" (Medium)] → Trade-off asumido: `http` es necesario para documentar honestamente el stack local de `docker-compose.yaml` (puerto 8000 sin TLS); la alternativa (solo `https`) documentaria un comportamiento que el entorno local no tiene.
- [El bloque de score mas grande restante (`security` vacio, ~21-23 puntos) sigue sin resolver] → Fuera de alcance por decision explicita del usuario; requiere autenticacion real, cambio de comportamiento runtime.
- [Los objetos abiertos (`IssueContent`, `IssuePayload`) siguen disparando "additionalProperties"/"no define type" en el audit] → Aceptado: cerrarlos documentaria una restriccion falsa sobre datos reales de Jira/mappings.

## Migration Plan

No hay migracion de datos ni de runtime. Todos los cambios son doc-only salvo los 5 `.max()` del validador real, que son puramente aditivos (nunca reducen lo que ya se aceptaba, solo ponen techo). Regenerar con `pnpm openapi:generate` tras cualquier cambio en `src/openapi/*.ts` o `src/validators/issue.validator.ts`; `pnpm openapi:check` falla en CI si el YAML queda desincronizado. Rollback: revertir el change; `openapi.yaml` se regenera automaticamente al siguiente `pnpm openapi:generate` desde el estado anterior de los `.ts`.

## Open Questions

- ¿Se quiere abrir un change aparte para autenticacion real (`X-API-KEY`) y cerrar el bloque de score mas grande que queda (~21-23 puntos, Security score clavado en 8/30)? Requiere tocar `middlewares/`, es una feature nueva de runtime.
- Si en el futuro se necesita tipar `error.details` con precision (hoy `z.unknown()`), evaluar si merece la pena frente a las ~12 variantes de schema que exigiria modelar los 11 tipos de `ZodIssue` mas `AggregateValidationError`.
