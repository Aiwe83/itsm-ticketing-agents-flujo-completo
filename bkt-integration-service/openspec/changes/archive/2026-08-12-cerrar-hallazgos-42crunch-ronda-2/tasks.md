## 1. Entorno

- [x] 1.1 Añadir `API_KEY: z.string().min(1)` (sin `.default()`) a `src/config/environment.ts`,
      junto a `API_KEY_HEADER`.
- [x] 1.2 Añadir `API_KEY` a `.env.example`, `.env.test`, `docker-compose*.yml` y al
      `REQUIRED_ENV_STUB` de `src/__tests__/openapi.test.ts`. Valor real nunca versionado.
      Nota: `.env.test` no existe como fichero versionado (`src/__tests__/setup.ts` lo carga de
      forma opcional vía `dotenv.config({path:'.env.test', override:true})`); el equivalente real
      es `REQUIRED_TEST_ENV` en `setup.ts`, que sí lleva `API_KEY`. `docker-compose*.yml` no
      necesita una línea explícita: ambos servicios ya usan `env_file: .env`, que reenvía
      `API_KEY` igual que reenvía `MONGODB_USERNAME`/`MONGODB_PASSWORD` (tampoco declaradas ahí).

## 2. Middleware de autenticación

- [x] 2.1 Crear `src/middlewares/auth.middleware.ts`: lee `req.header(env.API_KEY_HEADER)`,
      compara longitudes y usa `crypto.timingSafeEqual` sobre buffers, y en fallo llama a
      `next(AppError.unauthorized('Missing or invalid API key'))` (mismo mensaje para "falta" e
      "incorrecta").
      Nota: implementado con hash SHA-256 de ambos lados antes de `timingSafeEqual` (siempre dos
      buffers de 32 bytes) en vez de comparar longitudes primero — evita por completo la clase de
      bug de "longitud distinta lanza excepción", más robusto que lo descrito literalmente aquí.
- [x] 2.2 Montar el middleware en `src/routes/index.ts`:
      `router.use(\`/api/${env.API_VERSION}\`, apiKeyMiddleware, apiRouter)`. `/health` queda sin
      tocar.

## 3. Documento OpenAPI — seguridad y transporte

- [x] 3.1 `src/openapi/document.ts`: quitar `x-enforced: false` de `securitySchemes.ApiKeyAuth` y
      reescribir su `description` (el texto actual apunta a una sección de README ya borrada).
- [x] 3.2 Declarar `security: [{ ApiKeyAuth: [] }]` en `getApiRoot` y `createIssues`; dejar
      `security: []` en `getHealth`.
- [x] 3.3 Añadir una respuesta `401` a `getApiRoot` y `createIssues` reusando
      `#/components/schemas/ErrorResponse`, siguiendo el mismo patrón que las consts
      `notFoundResponse`/`defaultErrorResponse` ya existentes en `document.ts`.
- [x] 3.4 `servers.variables.protocol`: `enum: ['https']`, y reescribir su `description` (mover la
      mención al uso local de docker-compose a README).

## 4. Documento OpenAPI — post-proceso de schema

- [x] 4.1 Añadir el componente `JsonValue` (unión recursiva `anyOf` de string/number/boolean/
      array/object) a `components.schemas` en `document.ts`.
- [x] 4.2 Extender el post-proceso que ya limpia `$id`/`$schema` con una transformación recursiva
      que sustituye todo schema vacío `{}` (como `additionalProperties` o como valor de propiedad)
      por `{ $ref: '#/components/schemas/JsonValue' }`.
- [x] 4.3 En el mismo post-proceso, colapsar cualquier `allOf` de un solo elemento sin claves
      hermanas al `$ref` directo que contiene.

## 5. Validador de runtime — pattern permisivo

- [x] 5.1 Crear `src/validators/string.schemas.ts`: mover ahí `freeText(max)`/`token(max)` y las
      constantes (`ID_MAX`, `SHORT_TEXT_MAX`, `LONG_TEXT_MAX`, `ATTACHMENT_TEXT_MAX`,
      `DATE_TIME_MAX`), hoy privadas en `src/openapi/schemas.ts`.
- [x] 5.2 `src/openapi/schemas.ts`: importar desde el nuevo módulo en vez de definir localmente.
      Verificar que el YAML generado no cambia por esta parte.
- [x] 5.3 `src/validators/issue.validator.ts`: `id`, `key`, `fields.summary`,
      `fields.issuetype.name`, `initiatedBy` pasan a `freeText(N).min(1)` (no `token`, porque
      `token` prohíbe espacios).

## 6. Regenerar y verificar el documento

- [x] 6.0 **Corrección post-verify**: el `JsonValue` autorreferente original (array/object
      apuntando a sí mismo) pasó `openapi:lint`/`openapi:check`/tests, pero el audit REAL de
      42Crunch en VSCode lo marcó "Circular reference is not allowed" (Critical) ×7 y tumbó el
      Global score a 0/100 (mismo banner bloqueante de la ronda anterior, por otro motivo).
      Corregido a `JsonPrimitive` (hoja terminal) + `JsonValue` (2 niveles, sin ciclos) en
      `document.ts`. De paso se detectó que tipar también `error.details` con ese `JsonValue`
      rompía `openapi:lint` (20 warnings, ejemplos ya no validaban) porque su forma real anida
      más profundo — se excluyó `error.details` del post-proceso (queda `{}`, a propósito, según
      el Non-Goal ya existente de la ronda anterior). Ver `design.md` D5 para el detalle completo.
      Lección: `openapi:lint`/`openapi:check`/tests no sustituyen el audit real de 42Crunch para
      hallazgos estructurales (Critical) — solo lo detecta el audit real.

- [x] 6.1 `pnpm openapi:generate`.
- [x] 6.2 Confirmar que los 4 hallazgos "Example is not consistent with the underlying schema" se
      resuelven solos al tipar los `{}`. Si persisten, añadir `aliasDuplicateObjects: false` a la
      llamada `stringify(...)` en `src/scripts/generate-openapi.ts`.
      Nota: confirmado indirectamente — los 4 ejemplos señalados son justo los que antes
      validaban contra un schema vacío `{}`, ahora tipado; `openapi.test.ts` (bloque "every
      documented example parses against its own schema") sigue en verde. Confirmación
      definitiva requiere el audit real de 42Crunch (ver 9.4, no ejecutable desde aquí). El
      fallback de `aliasDuplicateObjects: false` no hizo falta.
- [x] 6.3 `pnpm openapi:lint` (0 warnings, baja desde 1 — el warning actual es justo `ApiKeyAuth`
      sin usar) y `pnpm openapi:check` (debe salir en 0 justo después de generar).

## 7. Tests

- [x] 7.1 Nuevo `src/__tests__/auth.middleware.test.ts`: sin cabecera → 401; clave incorrecta →
      401 con el mismo mensaje que el caso anterior; clave correcta → pasa; `/health` → 200 sin
      clave.
- [x] 7.2 `src/__tests__/issues.integration.test.ts`: añadir la cabecera de API key a las
      peticiones existentes.
- [x] 7.3 `src/__tests__/issue.validator.test.ts`: añadir caso de string con `\x00` → rechazado.
      Confirmar que el fixture real `postman-collection.json` (líneas 79-97) sigue en verde sin
      cambios — es la red de seguridad de que el `pattern` nuevo no rompe ingesta real.
- [x] 7.4 `src/__tests__/openapi.test.ts`: aserciones nuevas sobre el documento en memoria —
      `security` de las 2 operaciones protegidas y de `getHealth`; `401` declarado en las 2
      protegidas; `protocol.enum` es `['https']`; no queda ningún `allOf` ni ningún schema `{}`
      vacío en `components.schemas`.

## 8. Documentación

- [x] 8.1 Restaurar la sección "Estado De Seguridad" en `README.md` con el estado nuevo (auth
      real, `API_KEY` obligatoria, `/health` público a propósito, `http` local documentado aquí en
      vez de en el enum de `protocol`).
- [x] 8.2 Añadir entrada en `## Unreleased` de `CHANGELOG.md` marcada **BREAKING**.
- [x] 8.3 Marcar como hechas las tareas 2.1 y 2.2 de
      `openspec/changes/endurecer-ingesta-jira-piloto/tasks.md`, referenciando este change.

## 9. Verificación final

- [x] 9.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- [x] 9.2 Arrancar el servicio sin `API_KEY` en el entorno y confirmar que falla con
      `Environment validation failed`.
- [x] 9.3 Contra el stack local (`docker compose up -d`): `GET /health` → 200 sin cabecera;
      `GET /api/v1` sin cabecera → 401; con `X-API-KEY` correcta → 200;
      `POST /api/v1/issues` con el fixture real y la cabecera → 201.
      Hecho: `docker compose up -d --build` real, los 4 checks confirmados en vivo (200/401/200/201
      exactos), `POST /api/v1/issues` con el fixture Postman real devolvió 201 con ticket
      persistido y `orchestratorDispatched: true`. Contenedores parados después
      (`docker compose down`). `.env` local recibió una `API_KEY` generada (no versionada).
- [x] 9.4 Relanzar el Security Audit real de 42Crunch en VSCode y anotar el movimiento de score en
      este `design.md`. Hecho: usuario relanzó el audit tras el fix de 6.0. Global 0/100
      (bloqueado por circular reference) → 75/100. Security 13/30, Data validation 63/70. Sin
      hallazgos de "Circular reference". Los 7 resultados restantes (4 categorías) son trade-offs
      ya decididos — detalle en `design.md`, sección "Resultado medido".
