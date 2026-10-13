# CLAUDE.md — itsm-ticketing-agents-flujo-completo

Workspace (no es un repo git) que agrupa los 5 repos oficiales del sistema de agentes ITSM de Bankinter
para validar el flujo E2E Jira -> bkt-jira-triggers -> integration-service -> agent-runtime -> cortex-proxy-llm.
Ultima actualizacion: 2026-10-08. **Adjuntos de Jira: metadata pasada del trigger al servicio y convertida a
Markdown — implementada, desplegada y verificada end-to-end en real contra Jira** (`bkt-jira-triggers` +
`bkt-integration-service`; `bkt-integration-service-python` queda para despues, decision explicita). Flujo
completo probado con un ticket real (`BFC-21`/`BFC-22`, proyecto BFC): Jira -> trigger desplegado en Forge
(dev, v26.9.0) -> ngrok -> servicio -> descarga real -> Markdown con tabla intacta, sin ningun atajo manual.
**4 bugs reales encontrados y corregidos** probando contra Jira de verdad (ninguno lo detecto nunca un test
local/sintetico): (1) el evento `created` de Jira **nunca** trae `fields.attachment` — el trigger ahora lo
pide aparte (`jira-issue-fetcher.ts`, `GET /rest/api/3/issue/{id}?fields=attachment`); (2) el
`JiraAttachmentFetcher` del servicio rechazaba la descarga real porque la URL usa el gateway
`api.atlassian.com/ex/jira/<cloudId>/...`, no el dominio de `JIRA_BASE_URL` — ampliada la lista de origenes
de confianza; (3) `got.get()` devuelve un `Response`, no el buffer directo — se pasaba el objeto entero a
mammoth/JSZip (`"JSZip can't accept a stream"`) — corregido usando `response.body`; (4)
`followRedirect: false` dejaba el body vacio (Jira redirige la descarga real a una URL firmada) — corregido a
`followRedirect: true`. Credenciales reales de Jira configuradas en `bkt-integration-service/.env`; un primer
token pegado por accidente en el chat se trato como comprometido (nunca usado, revocado), y el segundo
resulto estar generado en una cuenta de Atlassian distinta — regenerado en la cuenta correcta y verificado
(`GET /rest/api/3/myself` -> `200`) antes de usarlo. 84/84 tests en integration-service,
`openapi:check`/`lint`/`typecheck` en verde. **Nada commiteado ni pusheado** (instruccion explicita del
usuario, en pausa).

**Actualizacion 2026-10-01: fusion con el `main` real de `bkt-jira-triggers` (commit `098d98c`, Manuel) y
redeploy.** Una auditoria de solo lectura de `develop`/`main` de los 5 repos encontro que ese `main` ya
tenia, desde antes, una version mas completa de la misma idea de adjuntos (lee el ticket completo por REST
— adjunto + descripcion + prioridad real + componentes + responsable — en vez de solo el adjunto). Se
fusiono solo esa parte ("Part A", decision explicita del usuario; se descarto la parte sin relacion del
mismo commit, un cambio de config `BACKEND=dev|prod`), preservando intacto el filtro BFC y el resto de
trabajo previo sin commitear. 47/47 tests en triggers (antes 35/35), `typecheck`/`lint`/`build`/`forge:lint`
en verde, y **desplegado a Forge development: v26.12.0** (antes v26.9.0, ejecutado por el usuario). La guia
de pruebas manuales y el resumen ejecutivo se actualizaron acorde (ya no hay un paso de log separado para el
adjunto, 4 lineas de traza por invocacion en vez de 5 — ver HANDOFF seccion 20.8). **Reverificado en real tras
la fusion: BFC-26 → 201 (Forge v26.13.0).** Antes hubo un 403 (BFC-23/24/25): `INTEGRATION_SERVICE_BASE_URL`
con `https://` doble baked en el deploy (las variables de Forge solo aplican al desplegar) — ver HANDOFF 20.8b.
Regla: tras `forge variables set` siempre `forge deploy`; no tocar `permissions.external.fetch` sin planear
`--approve MAJOR_VERSION_RULE`.

**Actualizacion 2026-10-02: TICK-181 hecha y subida.** `bkt-integration-service` convierte tambien PDF, Excel
(`xlsx`), PowerPoint (`pptx`), JSON y Markdown (registro de conversores, firma del fichero, timeout, topes; real: BFC-28). Subido a
`feature/bkt-integration-service` (`109a8be`, luego `faadeeb` con el aislamiento en `worker_threads` y el README) y
`feature/bkt-jira-triggers` (`ef59d92`, luego `cc9bc4b`); `main` intacto. Jira `sdlc-assistants`: TICK-181 +
TICK-182..189 (por API). Reglas nuevas: CLI/API antes que navegador; Mongo local con puerto solo en `127.0.0.1`.
`tsconfig.json` se deja como GitLab (no se sube).

**Pruebas automaticas (2026-10-02, SIN subir aun):** suite E2E del servicio con Jira falso (`pnpm test:e2e`; 24 suites,
158 tests + 1 gated con `E2E_HOSTILE=1`) y carpeta local `e2e/` (`preflight.js` solo lectura, `verify.js` + `expected.json`,
`LEEME.md` = guia paso a paso con que mide cada prueba). Prueba real semiautomatica: **BFC-29** (ticket creado desde el
navegador con los 10 adjuntos, permiso del usuario solo para ese paso) → `verify.js` 10/10. El ticket con adjuntos se
crea A MANO tras un `preflight.js` en PASS (decision del usuario: no se automatiza). No hay CI en GitLab en ningun repo
(YAML propuestos en `e2e/LEEME.md`, sin probar). Pendiente de subir (a 2026-10-02): la suite E2E y el arreglo del test de
memoria (`worker-runner.test.ts`); el 2026-10-08 `bkt-integration-service` muestra un commit local nuevo `28eabac`
("improve attachment e2e validation") y `memory.worker.ts` en su version antigua: **por verificar** que contiene y si esta
subido antes de dar la suite E2E por entregada. Detalle: HANDOFF 20.9-20.15.

**Actualizacion 2026-10-08: TICK-157 (campos y API key del servicio de integracion en los planes Forge), en curso, SIN
implementar.** Alcance: solo `bkt-jira-triggers`, manteniendo el modelo actual de variables (`INTEGRATION_SERVICE_BASE_URL`,
`INTEGRATION_SERVICE_API_KEY`, `INTEGRATION_SERVICE_API_KEY_HEADER`, cabecera `X-API-KEY`); **no se fusiona `origin/main`**
(cambia el modelo de variables y el proyecto Jira). Revision hecha y plan escrito, pendiente de aprobacion. Hallazgo:
`src/runtime-config.ts` da por valida una URL con esquema repetido (`https://https://...`, la causa del 403 de BFC-23/24/25),
`http://`, `ftp://` o con la ruta del endpoint. Cambios locales previos a conservar: `.env.example` y
`src/__tests__/runtime-config.test.ts`. **TICK-196 (colas/Kafka) esta fuera de alcance: la hace otra persona; no tocar
`bkt-integration-service` para colas.** Detalle: HANDOFF 20.15 y `contexto_para_proyectos/TICK-157_*.md`.

Guia de demo completa, reescrita paso a paso con comandos copiar-pegar:
`contexto_para_proyectos/pruebas_manuales/Pruebas_manuales_adjuntos_trigger_a_markdown.md`; resumen ejecutivo
(sin jerga interna, con links directos al codigo) en
`contexto_para_proyectos/explicaciones/Resumen_adjuntos_trigger_a_markdown.md`. Ademas: stack de
logging centralizado local nuevo (`observability/`, Filebeat 8.13.0 sobre el Elasticsearch/Kibana ya existentes)
y `LOG_PRETTY_PRINT=false` en `bkt-integration-service/.env` para que Kibana correlacione eventos completos en
vez de fragmentos partidos por linea (Filebeat solo cubre 4 servicios reales — `bkt-jira-triggers` corre en
Forge, nunca aparece ahi). Jira: **TICK-162** (+ subtareas 163-165, CI/logs/prueba de adjunto real)
y **TICK-166** (+ subtareas 167-175, esta feature) creados y asignados. CI de
`bkt-integration-service-python` (GitLab, `.gitlab-ci.yml` + `ruff`) construido y verificado en un clon temporal,
sin commitear/pushear (instruccion explicita del usuario, en pausa). Ningun `develop` de los
4 repos se tiro (trabajo local sin commitear en curso). `graphify update .`: 4816/7332/527 ->
**4842 nodos, 7363 aristas, 518 comunidades**.

**Todos los gaps de codigo de la migracion Python cerrados y
subidos a GitLab** (`feature/bkt-integration-service-python`, commits `1c61649`/`b81808f`): indice de Mongo
huerfano corregido, `createdAt`/`updatedAt`, 48 tests (unit+integration+contract, antes 30 y 2 carpetas
vacias), `AttachmentService`/`JiraAttachmentFetcher` portados (version de texto plano: Word via `mammoth.extract_raw_text`,
campo `plainText`; NO tiene Markdown, PDF/Excel/PowerPoint/JSON ni aislamiento — esos son solo de la version TS, ver HANDOFF
20.12 y Ideas), `docker build` verificado. Comprobado
ademas que los cambios de Manuel en `develop` **ya estaban integrados** en Python (12 ficheros
comparados, todo coincidia) — no hizo falta portar nada nuevo. `main` sigue sin tocar (instruccion
explicita del usuario, repetida varias veces). Detalle completo: HANDOFF secciones 18 y 19.
**Incidente de Mongo de `bkt-integration-service` (TS) resuelto:** al
recrear el contenedor app se perdio el acceso al Mongo real (usuario/clave no coincidian) y, ya recuperado el
acceso, el catalogo `mappings` para el `MESH_ID` real en uso (`dc9ca342-...`, 11 filas) aparecio vacio en el
volumen — se restauraron las 11 filas (identicas a las que ya documentaba HANDOFF seccion 6 del dia anterior)
y se corrigio `MESH_ID` en `.env` para que apunte otra vez ahi; verificado con `POST /api/v1/issues` real
(mapeo completo a `content.key/issueType/summary/description/priority/status/components/assignee`). Se limpio
ademas un ticket de verificacion contaminado (creado mientras el `MESH_ID` estaba mal) y dos tickets de prueba
propios (`DAT-3`/`DAT-4`) que no eran datos reales. Detalle completo: HANDOFF seccion 17. **Migracion Python de
`bkt-integration-service` (Litestar + Dishka, Fases 0-4 del plan): implementada, probada end-to-end contra Mongo
real, mismo contrato byte a byte que el TypeScript (ver HANDOFF seccion 15), y subida a GitLab a
`feature/bkt-integration-service-python` (commit `82f985e`) tras recuperar un incidente de borrado accidental del
TypeScript de esa rama por una sesion paralela (ver HANDOFF seccion 16). `main` sigue sin tocar.** El
2026-09-27 (sesion tarde) el flujo E2E se re-valido en real con el ticket BFC-7 tras un incidente critico: la
app de `bkt-jira-triggers` se desinstalo por accidente del site y se reinstalo (ver HANDOFF seccion 14).
`bkt-jira-forge` tiene un frontal Forge limpio (app nueva, id `5624f551-6944-4a89-ad4c-e6239e541e69`); se
retiraron 3 apps Forge duplicadas/viejas que generaban paneles repetidos en los tickets.
Estado y siguiente paso: ver `HANDOFF.md`. Vision general: `README.md`.

## Repos

| Repo | Rol | Tecnologia | Puerto local |
|---|---|---|---|
| `bkt-jira-triggers` | Entrada automatica: trigger Forge (evento `created`, filtro solo BFC) que construye el payload y llama a integration-service | Node >=24, TypeScript, Forge, Zod, Jest | n/a (corre en Forge) |
| `bkt-integration-service` | Receptor y traductor de tickets (`POST /api/v1/issues`), mappings, dispatch a `agent-runtime` (`/api/v1/orchestrator/dispatch`). Contiene ademas `bkt_integration_service_python/`: migracion Python en marcha (Fases 0-4 implementadas y probadas, ver HANDOFF 15) | Node >=22, Express 5, TypeScript, Mongoose, Zod, pnpm (TS, produccion); Python 3.13, Litestar, Dishka, uv (migracion, en paralelo) | 8000 (TS); 8003 (Python, paralelo) |
| `agent-runtime` | Malla agentica (`agentic-core`): agentes, MCPs, providers, adaptador `orchestrator/dispatch` | Python 3.13, Litestar, Dishka, msgspec, LangGraph, uv | 8001 (remapeado; ver README) |
| `bkt-cortex-proxy-llm` | Proxy LLM (solo Chat Completions) sobre Azure OpenAI, activable desde `agent-runtime` con `CORTEX_PROXY_ENABLED` | Python >=3.12, FastAPI, gunicorn | 127.0.0.1:8010 |
| `bkt-jira-forge` | App Forge independiente (panel BankDesk AI). Entrada manual alternativa, **no** una etapa previa al trigger; frontend mayormente mock. App nueva desplegada 2026-09-27 (id `5624f551-...`), panel limpio, sin el bloque viejo "PRUEBA BACKEND LOCAL" | JS, Forge, Vite + React 18 | n/a |

Todos en rama `main`. `bkt-jira-triggers` y `bkt-jira-forge` son dos apps Forge distintas (egress `.dev` vs `.app`);
no confundirlas ni asumir que una llama a la otra. Puertos ya resueltos para esta demo: ver tabla del README.

## Prioridad de trabajo

1. `bkt-jira-triggers` como entrada automatica (validada; filtro solo BFC, solo `created`).
2. `bkt-integration-service` como receptor y traductor.
3. `agent-runtime` + `bkt-cortex-proxy-llm` como malla agentica y puerta LLM (adaptador y switch ya implementados).
4. `bkt-jira-forge` solo como entrada manual de apoyo; no forma parte del camino validado.
5. Mantener compatible el contrato `POST /api/v1/issues` (fuente de verdad: `bkt-integration-service/openapi.yaml`,
   generado desde schemas Zod; no se edita a mano).
6. Migracion TypeScript -> Python con Litestar + Dishka **en marcha** (`bkt-integration-service/bkt_integration_service_python/`,
   Fases 0-4 del plan implementadas y probadas end-to-end; `agent-runtime` sigue siendo la referencia de stack).
7. Aplicar las correcciones pendientes en `contexto_para_proyectos/Pruebas_manuales_flujo_E2E_BFC_trigger.md` y
   `Como_funciona_bkt_jira_triggers_en_el_flujo.md` antes de usarlos para una demo real (ver HANDOFF seccion 13).

## Reglas duras

- **Sin secretos.** No leer ni imprimir `.env`, `.env.test`, tokens, claves ni valores de variables. De las variables
  solo se citan nombres. Los `.env.example` se pueden consultar (solo nombres). Si hace falta pasar una credencial
  a un comando (p. ej. `forge variables set --encrypt`), leerla en memoria desde el contenedor/entorno y no
  imprimirla nunca; asumir que un valor pegado en el chat por el usuario queda comprometido y recomendar rotarlo.
- `bkt-cortex-proxy-llm/docker-compose.yaml` tiene valores inline para `SECRET_KEY`, `PROXY_API_KEY` y
  `AZURE_OPENAI_API_KEY`. No reproducirlos en ningun sitio; tratarlos como comprometidos (ver HANDOFF, riesgo R1).
  Para levantar cortex localmente, usar un `.env` + `docker-compose.override.yml` **externos al repo** (p. ej.
  `%USERPROFILE%\.secrets\bkt-cortex\`), nunca editar el compose versionado.
- **Sin deploy y sin tocar Jira** salvo autorizacion explicita del usuario para esa accion concreta
  (`forge deploy`, `forge install`, `forge variables set`, escrituras a Jira, ngrok, crear/editar tickets). La
  autorizacion es por accion y no se generaliza a la siguiente ronda de pruebas.
- **CLI/API antes que navegador** (regla del usuario, 2026-10-02): si algo se puede hacer por linea de comandos o
  API REST (Jira con `JIRA_BASE_URL`/`JIRA_EMAIL`/`JIRA_API_TOKEN`, `forge`, `docker`, `git`), hacerlo asi; solo
  abrir el navegador cuando sea imprescindible (p. ej. adjuntar un fichero al crear un ticket que dispara el
  trigger, o paneles sin API). Es mas rapido y gasta menos tokens. Las credenciales se leen del entorno y nunca se
  imprimen. Nota: el token `JIRA_API_TOKEN` del sitio `sdlc-assistants.atlassian.net` dio 401 el 2026-10-02 y hay
  que regenerarlo.
- Analisis en modo lectura por defecto. Antes de sobrescribir algo, mirar el destino.
- `docker compose config` imprime valores resueltos: usar siempre `--quiet`.
- `git status` en triggers e integration-service da ` D` falsos por `Filename too long` (los ficheros existen). No
  interpretarlos como borrados ni "restaurarlos"; comprobar con `Test-Path` antes de concluir nada.
  `bkt-integration-service`: su `.git` ya NO esta roto (2026-10-02: `git fsck` sin errores, `HEAD` valido, `status`/`log`
  funcionan; 45 ficheros temporales inofensivos en `objects/pack`). No re-clonar: el arbol local tiene cambios sin subir
  y la rama local `sync/develop-into-main` diverge de las remotas. Para commit/push seguir usando un clon limpio.
- Rutas largas (182-192 chars de raiz por repo en `itsm-ticketing-agents-flujo-completo`, bajo OneDrive): preferir herramientas de lectura/busqueda a
  recorridos recursivos, y no lanzar `npm install`/`pnpm install` sin decidir antes la ruta de trabajo (ver HANDOFF R2).
  **Mismo problema confirmado en Python** (`bkt_integration_service_python/`): `uv sync` con el venv dentro de esta
  ruta rompe la carga del DLL nativo de `msgspec`. Redirigir siempre el venv fuera con
  `UV_PROJECT_ENVIRONMENT=/c/pyenvs/bkt_integration_service_python` antes de `uv sync`/`uv run`.
- `rg` (ripgrep) no esta instalado en este equipo; usar `Grep`/`grep -n -E`/`Select-String` en su lugar.
- `bkt-jira-triggers` y `bkt-jira-forge` son dos apps Forge independientes (ver README); no dar por hecho que una
  alimenta a la otra al escribir o revisar documentacion.
- **La app Forge de `bkt-jira-triggers` (Console: `trigger-incidencias-jira-demo`, id `1130f0bf-...`) es
  produccion real, nunca desinstalar ni borrar.** El 2026-09-27 se desinstalo por accidente durante una limpieza
  de apps duplicadas y rompio el pipeline hasta reinstalarla (ver HANDOFF seccion 14). Antes de cualquier
  `forge uninstall`/borrado en el Developer Console, confirmar el `app.id` exacto contra esta tabla.
- Desinstalar una app de un site (`forge uninstall` / "Desinstalar" en Aplicaciones conectadas) **no** borra su
  registro en el Developer Console (sigue en "My apps"); son acciones distintas con permisos distintos.
- En este equipo, el navegador de automatizacion a veces resuelve `developer.atlassian.com`/`admin.atlassian.com`
  a una cuenta Atlassian distinta de la de Jira (`pablodefranchi.atlassian.net` si funciona bien). Si una pestaña
  nueva da "Necesitas permiso" o "We couldn't find your app" en esos dominios, es la cuenta equivocada, no falta
  de acceso real; no hay workaround fiable encontrado, pedir al usuario que lo haga el mismo.

## Git (regla global del usuario)

**Subidas (2026-10-02):** `bkt-jira-triggers` → `feature/bkt-jira-triggers` (`ef59d92`) y `bkt-integration-service` →
`feature/bkt-integration-service` (`109a8be`), solo esas ramas. **Nunca tocar `main`** en ningun repo salvo orden
expresa y repetida del usuario (la plantilla de push que pide "llevar a main" se ignora). Subir siempre desde un clon
limpio con `git add` de lista exacta, sin menciones a IA en commits ni `Co-Authored-By`. Pedir autorizacion antes de
cada nueva subida; la de hoy no se generaliza.

**TICK-157 (`bkt-jira-triggers`):** sin push, sin tocar `main`, sin remotos y **sin merge automatico desde `origin/main`**; los
cambios locales previos (`.env.example`, `runtime-config.test.ts`) se revisan y se completan, no se revierten. No incluir en
ningun commit los borrados aparentes por rutas largas (OpenSpec).

Nunca hacer commit/push de: `htmlcov/`, `Context_para_proyectos/`, `AGENTS.md`, `graphify-out/`, `CLAUDE.md`,
`HANDOFF.md`, `.github/`, `.claude/`, `.codex/`, `.qodo/`, `.agents/`. Si alguno estuviera trackeado:
`git rm -r --cached` conservando el fichero. No anadirlos a `.gitignore` ni mencionar herramientas de IA en
commits/PRs. Este directorio raiz no es un repo, asi que estos 4 ficheros de documentacion permanecen locales.

## Grafo de conocimiento

Si existe `graphify-out/graph.json`, consultar primero con `graphify query|explain|path`. Refrescar con
`graphify update <ruta>` (sin LLM); no regenerar desde cero.

## Comandos de referencia (no destructivos)

```text
bkt-jira-triggers:        npm run typecheck | lint | test -- --runInBand | build | forge:lint | demo -- all
                           (npm run logs = forge logs formateados; rg no esta instalado, usar grep/Select-String)
bkt-integration-service:  pnpm typecheck | lint | test | test:e2e | build | openapi:check | mappings:dry-run
                           (test:e2e = Jira falso + Mongo en memoria, sin Docker; E2E_HOSTILE=1 suma el Excel hostil)
e2e (guia paso a paso copiable en e2e/LEEME.md; carpeta local del workspace): node preflight.js (solo lectura: servicio, ngrok, variable de Forge, trigger, token Jira) | node --test
                           node verify.js BFC-NN (tras crear el ticket con los 10 adjuntos: compara Mongo con expected.json; BFC-29 = 10/10)
                           (git roto en este repo: no fiarse de git status/log, ver Reglas duras)
bkt_integration_service_python (subcarpeta, Python, en paralelo):
                           export UV_PROJECT_ENVIRONMENT=/c/pyenvs/bkt_integration_service_python
                           uv sync | uv run pytest tests/unit -v | uv run uvicorn app.main:app --port 8003
agent-runtime:             make install | typecheck (uv run ty check)
bkt-cortex-proxy-llm:      docker compose --env-file <externo> -f docker-compose.yaml -f <override-externo> config --quiet
```

Lista completa de validaciones y orden de tareas: `HANDOFF.md`.

## Convenciones al documentar

- **Guias y pruebas, siempre paso a paso y muy claro** (regla del usuario, 2026-10-02): pasos numerados, un bloque de
  comandos copiable por paso (con la ruta resuelta, p. ej. `$RAIZ`), y por cada paso: que mide, la salida real anotada
  linea por linea, como interpretarla (esta bien si... / si no...) y que hacer si falla. Modelo: `e2e/LEEME.md`.

- Espanol, sin inventar: lo no verificado se marca como "por verificar".
- Variables de entorno: solo nombre. Nunca valores.
- Cada repo puede tener su propio `CLAUDE.md`/`README.md`; el del repo manda en su ambito.
- Antes de dar una demo o entregar un documento a alguien no tecnico, revisar HANDOFF seccion 13 (correcciones
  pendientes en los `.md` de `contexto_para_proyectos`).
