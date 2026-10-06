# Design â€” Cerrar los hallazgos 42Crunch restantes (auth real + schema)

## Context

La ronda anterior (`archive/2026-08-07-endurecer-especificacion-openapi-42crunch`) subiÃ³ el score
15â†’63/100 pero dejÃ³ 3 decisiones explÃ­citamente abiertas en su `design.md` (D3, Non-Goals, Open
Questions): no tocar `pattern` en el validador real, no implementar auth real, y aceptar `http` en
`servers.protocol`. Esta ronda revoca las dos primeras y la tercera, con el usuario ya consultado
sobre cada una.

`openapi.yaml` sigue siendo generado desde `src/openapi/{schemas,examples,document}.ts` vÃ­a
`z.registry()` + `z.toJSONSchema()` (`target: 'openapi-3.0'`, `io: 'input'`). El dato estructural
que condiciona todo este diseÃ±o: `IssuePayload` y `IssueBatchRequest` (`schemas.ts:2`) **no** estÃ¡n
definidos en `schemas.ts` â€” son literalmente `issuePayloadSchema`/`issueBatchSchema`, importados
desde `src/validators/issue.validator.ts`, el Ãºnico validador que corre sobre payloads Jira/TC
reales en `POST /api/v1/issues`. Todo lo demÃ¡s en `schemas.ts` es doc-only (nunca valida datos
reales; solo se re-parsea contra ejemplos fijos en `src/__tests__/openapi.test.ts`).

## Goals / Non-Goals

**Goals:**
- Cerrar el bloque de score mÃ¡s grande (`security: []` en las 3 operaciones, ~21 pts) con
  autenticaciÃ³n real, no con un documento que mienta.
- Cerrar los 9 hallazgos de `pattern` ausente aplicando el mismo `freeText` que el resto del
  proyecto ya usa, sin arriesgar rechazar ingesta real de Jira/TC (la garantÃ­a viene del propio
  regex: solo bloquea C0+DEL).
- Cerrar los 8 hallazgos de "sin tipo" tipando `additionalProperties`/`details` con un schema
  recursivo (`JsonValue`) sin cerrar el contrato â€” cero cambio de comportamiento runtime.
- Mantener fail-closed real: sin `API_KEY` en el entorno, el proceso no arranca.

**Non-Goals:**
- No se protege `GET /health` â€” es la sonda de liveness/readiness de docker-compose/k8s; exigirle
  auth romperÃ­a los healthchecks operativos. Se acepta a propÃ³sito que ~7 de los 21 pts High se
  queden abiertos.
- No se implementa rotaciÃ³n de claves, mÃºltiples claves, ni scopes â€” un Ãºnico secreto compartido
  vÃ­a `API_KEY`, comparaciÃ³n en tiempo constante. Suficiente para el hallazgo de 42Crunch y
  coherente con el alcance ya escrito en `endurecer-ingesta-jira-piloto` (tarea 2.1).
- No se aplica `TRUST_PROXY_HOPS` (tarea 2.3 de `endurecer-ingesta-jira-piloto`) â€” ortogonal a
  autenticaciÃ³n, se deja para ese change.
- No se tipa `error.details` con precisiÃ³n exacta (sigue siendo `z.unknown()` a nivel Zod) â€” solo
  se tipa a nivel de documento generado, vÃ­a el post-proceso `JsonValue`. Modelarlo con precisiÃ³n
  seguirÃ­a exigiendo ~12 variantes de `ZodIssue`/`AggregateValidationError` (Non-Goal ya descartado
  en la ronda anterior, sigue vigente).

## Decisions

### D1: Middleware de API key montado en el router, no en `app.ts`

`apiKeyMiddleware` se monta en `src/routes/index.ts` como segundo argumento de
`router.use('/api/${env.API_VERSION}', apiKeyMiddleware, apiRouter)`, no en `src/app.ts`.
- **Por quÃ©**: en `app.ts` el orden es `helmet â†’ cors â†’ rateLimit('/api/') â†’ requestIdMiddleware â†’
  httpLogger â†’ json â†’ routes`. Si el middleware de auth se montara en `app.ts` antes de `routes`,
  seguirÃ­a corriendo despuÃ©s de `requestIdMiddleware` de todas formas para que el 401 lleve
  `requestId` â€” asÃ­ que montarlo en el propio router (que ya estÃ¡ bajo `requestIdMiddleware`) es
  mÃ¡s simple y mantiene toda la lÃ³gica de autorizaciÃ³n en un solo fichero.
- **Alternativa rechazada**: middleware global en `app.ts` con un `if (req.path.startsWith('/api/'))`
  interno â€” reimplementa el scoping que el router ya da gratis.

### D2: ComparaciÃ³n en tiempo constante con `crypto.timingSafeEqual`

El middleware calcula el hash SHA-256 de ambos lados (`digest(header)` / `digest(env.API_KEY)`,
`src/middlewares/auth.middleware.ts`) y compara los dos digests de 32 bytes con
`timingSafeEqual`, en vez de comparar los buffers originales directamente.
- **Por quÃ©**: una comparaciÃ³n `===` normal filtra por timing cuÃ¡nto prefijo coincide; es la
  clase de vulnerabilidad que un audit de seguridad de API real penaliza aunque 42Crunch no la
  detecte estÃ¡ticamente. Coincide con lo que ya pide la tarea 2.1 de `endurecer-ingesta-jira-piloto`.
- **Hash primero, no comparar longitudes primero**: `timingSafeEqual` exige que ambos buffers
  tengan la misma longitud o lanza. La alternativa obvia (comparar `.length` antes de llamar)
  funciona, pero hashear ambos lados primero es mÃ¡s simple y mÃ¡s robusto: el resultado siempre
  son dos buffers de 32 bytes, asÃ­ que no hace falta ninguna rama especial para longitudes
  distintas â€” cualquier cabecera de cualquier longitud entra por el mismo camino.

### D3: Mensaje de error Ãºnico para "falta" e "incorrecta"

`AppError.unauthorized('Missing or invalid API key')` se usa tanto si no hay cabecera como si la
clave no coincide.
- **Por quÃ©**: distinguir los dos casos (p.ej. "API key required" vs "Invalid API key") le regala
  a un atacante la confirmaciÃ³n de que el mecanismo de auth existe y de que forma de fallo estÃ¡
  probando. Un solo mensaje no da esa seÃ±al.

### D4: Revocar D3 de la ronda anterior â€” `pattern` permisivo en el validador real

Los 5 campos de `issue.validator.ts` pasan de `z.string().min().max()` a `freeText(max).min(1)`.
- **Por quÃ© se revoca ahora**: la decisiÃ³n anterior fue conservadora a propÃ³sito ante la duda. Con
  el regex ya en producciÃ³n en 12+ campos de `schemas.ts` sin incidentes, y el fixture real
  `postman-collection.json` (`issue.validator.test.ts:79-97`) como red de seguridad end-to-end, el
  riesgo real de rechazar ingesta Jira legÃ­tima es el mismo que ya se acepta en el resto del
  documento: prÃ¡cticamente cero, porque el regex solo bloquea C0+DEL, nunca texto humano.
- **Consecuencia igual que antes**: como `IssuePayload` se reutiliza por `$ref` en
  `IssueProcessResult.issue` (respuesta 201), el `pattern` nuevo se propaga tambiÃ©n al bucket de
  response â€” asÃ­ se cierran los 4 hallazgos de response a la vez que los 5 de request.
- **Alternativa rechazada**: inyectar el `pattern` solo en el YAML (post-proceso), dejando el
  validador de runtime intacto â€” generarÃ­a exactamente el "contrato falso" que D6 de la ronda
  anterior ya identificÃ³ como peor que dejar el hallazgo abierto.

### D5: `JsonValue` como post-proceso del JSON Schema generado, no como `.catchall()` en Zod

`additionalProperties: {}` se sustituye por `{ $ref: '#/components/schemas/JsonValue' }` en un
post-proceso recursivo sobre `componentSchemas`, en el mismo punto donde `document.ts` ya limpia
`$id`/`$schema` (`document.ts:28-42`) â€” no cambiando los `.passthrough()` de Zod.
- **Por quÃ©**: `.catchall(jsonValueSchema)` en Zod sÃ­ cambiarÃ­a runtime, y los campos extra de Jira
  pueden traer estructuras muy anidadas (Atlassian Document Format en `description`). Tipar ahÃ­
  arriesga rechazar ingesta real por un lÃ­mite de profundidad o tamaÃ±o mal calibrado. El documento
  generado no valida nada en producciÃ³n, asÃ­ que tipar solo ahÃ­ es una mejora sin riesgo.
- **`anyOf`, no `oneOf`**: `oneOf` exige que el valor matchee *exactamente una* rama; OAS 3.0 no
  tiene `type: 'null'`, asÃ­ que un `null` real (frecuente en campos Jira opcionales) necesita la
  rama `string` con `nullable: true` â€” con `oneOf` un `null` podrÃ­a no matchear ninguna rama de
  forma inequÃ­voca segÃºn el validador. `anyOf` es la semÃ¡ntica correcta para "es JSON vÃ¡lido".
- **Alternativa rechazada**: dejar `additionalProperties: {}` y solo suprimir la regla en
  la configuracion local de auditoria â€” no existe mecanismo de exclusiÃ³n de reglas en la configuracion actual hoy (verificado: solo
  mapea alias), y aÃ±adirlo serÃ­a ocultar el hallazgo en vez de resolverlo.
- **`JsonValue` es finito (2 niveles), no autorreferente â€” corregido tras un incidente real**:
  el primer diseÃ±o hacÃ­a que `JsonValue.anyOf` incluyera `array.items: $ref JsonValue` y
  `object.additionalProperties: $ref JsonValue` (recursiÃ³n directa). Al relanzar el audit real de
  42Crunch, eso disparÃ³ **"Circular reference is not allowed" (Critical) Ã—7** y tumbÃ³ el Global
  score a **0/100** con el mismo banner bloqueante que ya habÃ­a aparecido en la ronda anterior por
  otro motivo (ver D5 de esa ronda) â€” peor que el hallazgo "no type defined" que se intentaba
  cerrar. Se corrigiÃ³ a dos schemas: `JsonPrimitive` (hoja terminal: string/number/boolean, sin
  `$ref` de salida) y `JsonValue` (`anyOf` de `JsonPrimitive` | array-de-`JsonPrimitive` |
  object-de-`JsonPrimitive`) â€” finito, sin ciclos, cubre los campos extra reales de Jira vistos
  hasta ahora (`components: "..."`, `priority: { name: "..." }`).
- **`error.details` queda excluido de la sustituciÃ³n, a propÃ³sito**: el post-proceso solo
  reescribe `{}` cuando la clave es literalmente `additionalProperties` â€” no cualquier schema
  vacÃ­o. `ErrorResponse.error.details` (`z.unknown()`) tambiÃ©n es `{}`, pero su forma real es
  polimÃ³rfica y anida mÃ¡s profundo de lo que el `JsonValue` acotado permite (un objeto
  `AggregateValidationError.errors[]` con `details.path[]` anidado dos niveles mÃ¡s abajo). Un
  primer intento de tipar `details` con el `JsonValue` de 2 niveles rompiÃ³ `pnpm openapi:lint`
  (20 warnings: los ejemplos documentados de 400 dejaron de validar contra su propio schema).
  Se revirtiÃ³ a `{}` para ese campo Ãºnicamente, consistente con el Non-Goal ya explÃ­cito de la
  ronda anterior de no modelar `error.details` con precisiÃ³n (~12 variantes para valor marginal).

### D6: Colapsar el Ãºnico `allOf` de una rama en el post-proceso

`IssueProcessResult.transformedIssue` sale como `allOf: [$ref IssueInfo]` porque
`z.toJSONSchema` con `target: 'openapi-3.0'` envuelve asÃ­ cualquier `.optional()` sobre un schema
registrado (OAS 3.0 prohÃ­be hermanos junto a `$ref`). El post-proceso detecta `allOf` de longitud 1
sin otras claves hermanas y lo sustituye por el `$ref` directo.
- **Por quÃ©**: es el Ãºnico `allOf` del documento entero; semÃ¡nticamente idÃ©ntico (la opcionalidad
  ya vive en `required`), y 42Crunch penaliza especÃ­ficamente `allOf` combinado con
  `additionalProperties: false` en el `$ref` apuntado.

### D7: `protocol` pierde `http` del enum â€” revoca D5 de la ronda anterior

`servers.variables.protocol.enum` pasa de `['https', 'http']` a `['https']`.
- **Por quÃ© se revoca ahora**: la ronda anterior justificÃ³ mantener `http` para documentar
  honestamente el stack local de `docker-compose.yaml`. Ese razonamiento seguÃ­a siendo vÃ¡lido para
  *describir* el entorno local, pero el usuario decidiÃ³ que la spec publicada no debe *anunciar*
  HTTP como opciÃ³n soportada â€” el uso local se documenta en README, no en el contrato. La spec deja
  de proponer un vector downgrade-a-HTTP explÃ­cito.

## Risks / Trade-offs

- [`/health` sigue sin auth, ~7 pts High se quedan abiertos] â†’ Aceptado a propÃ³sito: es una sonda
  operativa, no un endpoint de negocio; exigir auth ahÃ­ rompe healthchecks reales.
- [Toda integraciÃ³n existente con `/api/v1/*` rompe hasta que envÃ­e `X-API-KEY`] â†’ Es el propÃ³sito
  del cambio (BREAKING declarado). MitigaciÃ³n: `API_KEY` documentada en `.env.example`/README antes
  del despliegue; el 401 devuelve un `ErrorResponse` estÃ¡ndar, no un fallo silencioso.
- [Revocar dos decisiones previas del usuario en la misma ronda] â†’ Cada revocaciÃ³n se confirmÃ³ de
  nuevo explÃ­citamente antes de escribir cÃ³digo; ninguna se infiere por conveniencia.
- [`JsonValue` recursivo con `maxProperties`/`maxItems` arbitrarios] â†’ LÃ­mites generosos (500
  propiedades, 1000 items) pensados para no chocar nunca con datos reales de Jira; si un `mapping`
  futuro los superara, es una seÃ±al de un problema de datos, no del contrato.

## Migration Plan

1. Desplegar con `API_KEY` ya presente en el entorno de cada stage (el arranque falla si falta â€”
   verificar *antes* del despliegue, no durante).
2. Comunicar a cualquier consumidor de `/api/v1/*` (incluida la configuracion local de auditoria,
   que ya declara `authenticationDetails.ApiKeyAuth` leyendo `SCAN42C_SECURITY_APIKEYAUTH` â€”
   no requiere cambios) que debe enviar `X-API-KEY`.
3. Regenerar con `pnpm openapi:generate` â†’ `pnpm openapi:lint` â†’ `pnpm openapi:check` (debe salir
   en 0 justo despuÃ©s de generar).
4. Rollback: revertir el change; `openapi.yaml` se regenera automÃ¡ticamente al siguiente
   `pnpm openapi:generate` desde el estado anterior de los `.ts`. El middleware se puede desactivar
   sin rollback de cÃ³digo quitando su lÃ­nea de montaje si hiciera falta un rollback rÃ¡pido de auth
   sin tocar el resto.

**Resultado medido**: Security Audit real de 42Crunch en VSCode, tras el fix de D5 (`JsonValue`
sin ciclos). Global score **0/100 (bloqueado) â†’ 75/100**. Security score 13/30, Data validation
63/70. Banner bloqueante "structural or semantic issues" desaparecido â€” 0 hallazgos de
"Circular reference". Los 4 hallazgos restantes (7 resultados) son exactamente los trade-offs
deliberados de este change y de la ronda anterior, ninguno inesperado:
- `security: []` en `getHealth` (High, 8pts, 1 result) â€” sonda pÃºblica a propÃ³sito.
- API key transportada en header (Medium, 10pts, 2 results, `getApiRoot`/`createIssues`) â€”
  esquema de secreto compartido elegido a propÃ³sito, no OAuth2/mTLS; fuera de alcance subirlo.
- `additionalProperties` abierto en request y response (Medium, ~6pts, 5 results) â€” contrato real
  de Jira/mappings es abierto, cerrarlo documentarÃ­a una restricciÃ³n falsa (D1 de la ronda
  anterior, sigue vigente).
- `error.details` sin tipo (Info, 1pt, 1 result) â€” Non-Goal explÃ­cito, ver D5 arriba.

## Open Questions

- Â¿Se quiere ademÃ¡s `TRUST_PROXY_HOPS` (tarea 2.3 de `endurecer-ingesta-jira-piloto`) en un change
  posterior, ahora que el rate limiter y el nuevo middleware de auth comparten el mismo prefijo
  `/api/`?
- Si en el futuro se abre auth a mÃºltiples claves o rotaciÃ³n, este middleware de comparaciÃ³n
  Ãºnica con `timingSafeEqual` deberÃ¡ evolucionar a una lista â€” hoy es 1 secreto, decisiÃ³n
  deliberadamente mÃ­nima para este alcance.

