# ITSM Ticketing Agents — entorno E2E oficial

Workspace que reune los 5 repos oficiales del sistema de agentes para resolucion de incidencias (Bankinter).
No es un repo git: cada subcarpeta es un repo independiente (`origin` en GitLab, grupo `itsm-ticketing-agents`),
todos en rama `main`. El flujo E2E quedo **validado en real** con un ticket nuevo del proyecto Jira **BFC**
(tablero BKT-Flujo-Completo); el ticket sintetico `DAT-3` de las primeras sesiones queda como referencia historica.

Documentos de este workspace: `CLAUDE.md` (reglas de trabajo), `HANDOFF.md` (estado, riesgos y plan de tareas),
`CHANGELOG.md` (historial de cambios de esta documentacion). Guias de demo en
`contexto_para_proyectos/pruebas_manuales/`: `Pruebas_manuales_flujo_E2E_BFC_trigger.md` (TS) y su version
Python, y la nueva `Pruebas_manuales_adjuntos_trigger_a_markdown.md` (adjuntos de Jira convertidos a Markdown,
lista para demo, ver mas abajo).

## Adjuntos de Jira convertidos a Markdown (2026-10-01, solo TypeScript, verificado en real)

El trigger lee el ticket completo por REST (`GET /rest/api/3/issue/{key}?fields=...`, `src/jira-client.ts`)
en vez de solo pedir el adjunto aparte — manda adjunto (`id`/`filename`/`content`=URL de descarga/`mimeType`/
`size`), descripcion, prioridad real, componentes y responsable, ninguno de los cuales llega en el evento
`created` de Jira. El servicio de integracion convierte el adjunto a **Markdown** (antes texto plano),
incluidas tablas de Word con su estructura real, usando `mammoth` + `turndown` + `turndown-plugin-gfm`.
Implementado en `bkt-jira-triggers` + `bkt-integration-service` (48/48 y 84/84 tests), desplegado a Forge
development (**v26.13.0**, reverificado con el ticket real `BFC-26`); `bkt-integration-service-python` queda
para despues. (2026-10-01: fusionada la version mas completa que ya tenia el `main` real de
`bkt-jira-triggers` — ver HANDOFF seccion 20.8.)

**Aviso operativo (HANDOFF 20.8b):** las variables de Forge solo se aplican al desplegar y la URL de
`INTEGRATION_SERVICE_BASE_URL` lleva `https://` una sola vez; un `https://https://` provoco `403` en
BFC-23/24/25. Cambiar los dominios de `permissions.external.fetch` exige `forge deploy --approve
MAJOR_VERSION_RULE`. En errores HTTP, `jira.integration.response` incluye `diagnostic` (host, cabeceras,
trozo del body) para saber quien respondio.

**Verificado en real de punta a punta** con tickets reales de Jira (proyecto BFC, trigger desplegado en Forge
development): se encontraron y corrigieron **4 bugs reales** que ningun test local habia detectado (el evento
`created` de Jira nunca trae el adjunto; el servicio rechazaba la URL real de descarga de Atlassian; el cliente
HTTP devolvia un objeto envoltorio en vez del fichero; las redirecciones de Jira estaban desactivadas). Detalle
completo: HANDOFF seccion 20.6b-20.6d.

Subido a GitLab el 2026-10-02 (solo las ramas `feature/bkt-integration-service` y `feature/bkt-jira-triggers`; ver la
seccion siguiente). Guia de demo paso a paso:
`contexto_para_proyectos/pruebas_manuales/Pruebas_manuales_adjuntos_trigger_a_markdown.md`. Resumen ejecutivo
(sin jerga interna, con links al codigo): `contexto_para_proyectos/explicaciones/Resumen_adjuntos_trigger_a_markdown.md`.

## Mas tipos de adjunto convertidos a Markdown (TICK-181, 2026-10-02)

`bkt-integration-service` convierte ahora, ademas de texto y Word, **PDF, Excel (`xlsx`), PowerPoint (`pptx`),
JSON y Markdown**, con un registro de conversores (`src/services/attachment-converters/`), deteccion del tipo
real por la firma del fichero, timeout, topes de tamano y de descompresion. El analisis de PDF y Excel corre en un
`worker_thread` con limite de memoria (un fichero hostil no bloquea el servicio). Un fichero corrupto, escaneado o
que no coincide con su extension se marca `unsupported` sin romper el resto. Verificado con los tickets reales
**BFC-28** y **BFC-29** (10 adjuntos por el trigger real). Fuera de alcance: RTF, `xls`/`ppt` antiguos, imagenes y la
version Python (que sigue en texto plano: Word via `mammoth.extract_raw_text`, sin Markdown). Subido a
`feature/bkt-integration-service` (`109a8be`, `faadeeb`) y `feature/bkt-jira-triggers` (`ef59d92`, `cc9bc4b`);
`main` sin tocar. Documentos de prueba: `contexto_para_proyectos/pruebas_manuales/documentos_prueba/` (con
`LEEME.md`); tarea: `contexto_para_proyectos/Tarea_TICK-181_ampliar_tipos_de_adjunto.md`; detalle: HANDOFF 20.9-20.14.

## Pruebas automaticas del flujo de adjuntos (2026-10-02)

Guia paso a paso (que mide cada prueba, como leer la salida y que hacer si falla): [`e2e/LEEME.md`](./e2e/LEEME.md).

| Nivel | Comando | Que comprueba |
|---|---|---|
| A. Tests del servicio | `npx jest` en `bkt-integration-service` | 24 suites, 158 tests (+1 que solo corre con `E2E_HOSTILE=1`) |
| A. E2E con Jira falso | `npm run test:e2e` en `bkt-integration-service` | 10 adjuntos: 6 convertidos y 4 `unsupported`; sin Docker, ngrok ni Jira |
| A. Tests del trigger | `npm test -- --runInBand` en `bkt-jira-triggers` | 48 tests |
| B. Comprobaciones previas | `node preflight.js` en `e2e/` | servicio, Mongo, URL de Forge, ngrok, trigger instalado y token de Jira (solo lectura) |
| B. Prueba real | crear a mano el ticket con los 10 adjuntos; `node verify.js BFC-NN` en `e2e/` | Mongo guarda los 10 adjuntos como se espera (`BFC-29`: 10/10) |

El ticket con adjuntos se crea a mano **solo despues de que `preflight.js` salga en PASS** y subiendo los 10 ficheros en el
mismo formulario de creacion. Ningun repo tiene CI en GitLab todavia (propuesta, sin probar, en `e2e/LEEME.md`).

## Arquitectura del flujo (validada con BFC-4)

```text
Jira BFC (ticket nuevo, avi:jira:created:issue)
  -> bkt-jira-triggers            Forge trigger propio; filtro solo BFC; onError: IGNORE_AND_LOG
       saneado + construccion del payload + cabeceras (Content-Type, ngrok-skip-browser-warning,
       X-API-KEY, X-Request-Id)
  -> POST /api/v1/issues          HTTPS via ngrok hacia integration-service local
  -> bkt-integration-service      guarda bruto (itsm_tickets), traduce con mappings (tickets), registra executions;
       en segundo plano llama al orquestador
  -> POST {ORCHESTRATOR_BASE_URL}{ORCHESTRATOR_ENDPOINT} = /api/v1/orchestrator/dispatch
       payload: { rol, ticket_id, mesh_id, execution_id, ticket_context? }
  -> agent-runtime                adaptador propio (ver seccion "Adaptador orchestrator/dispatch"); resuelve el
       agente por `rol`, arma el chat y lo ejecuta
  -> bkt-cortex-proxy-llm         POST /api/v1/llm/chat/completions (provider="azure", stream=false) -> Azure OpenAI
  -> respuesta trazable por el mismo X-Request-Id en Forge, ngrok, integration-service y agent-runtime
```

`bkt-jira-forge` es una **segunda app Forge independiente**, no una entrada previa al trigger: tiene su propio
panel visual (issuePanel) con un boton manual "Enviar ticket" que llama a `POST /api/v1/issues` por su cuenta
(`initiatedBy: "bkt-jira-forge"`), sin pasar nunca por `bkt-jira-triggers`. Su frontend (`static/asistente-app`)
sigue mayormente en mock. Su egress es `*.ngrok-free.app`, distinto del `*.ngrok-free.dev` del trigger.
**Desde el 2026-09-27 corre bajo una app Forge nueva** (id `5624f551-6944-4a89-ad4c-e6239e541e69`, Developer Space
`portal-ia-sdlc-pablo`): panel renombrado a `bkt-jira-forge`, sin el bloque viejo "PRUEBA BACKEND LOCAL /
Ejecutar pipeline / Enviar a integration-service". Se retiraron ademas 3 apps Forge duplicadas que generaban
paneles repetidos en el mismo ticket (`BJF Demo Pablo`, `bankdesk-ai-forge-original`, `bankdesk-ai-forge-pablo`);
detalle en HANDOFF seccion 14.

El agente publicador (`agentic-publisher-application`) **no esta activo**: solo aparece en un fixture de tests
antiguo de integration-service y en los documentos de demo, nunca en `agent-runtime/src` ni en ejecuciones reales
(ver HANDOFF seccion 5b).

## Repos

| Repo | Que hace | Tecnologia | Arranque local |
|---|---|---|---|
| `bkt-jira-triggers` | App Forge propia (id distinto de jira-forge); trigger `avi:jira:created:issue` filtrado a BFC; construye y valida el payload; POST a integration-service | Node >=24, TS, `@forge/api`, Zod, Jest | `npm install`; `npm run typecheck && npm run lint && npm test -- --runInBand && npm run build && npm run forge:lint`; `npm run demo -- all` |
| `bkt-integration-service` | API Express: `GET /health`, `GET /api/v1`, `POST /api/v1/issues`; Mongo; mappings; OpenAPI desde Zod; dispatch al orquestador. Incluye `bkt_integration_service_python/`: migracion Python en paralelo | Node >=22, Express 5, Mongoose, Zod, Pino, pnpm | `docker compose up -d --build` (mongo:7 + app en 8000) |
| `agent-runtime` | Backend de agentes `agentic-core`: API `/api/v1` (health, providers, mcps, agents, `agents/{id}/chat`) **+ adaptador `POST /api/v1/orchestrator/dispatch`** | Python 3.13, Litestar, Dishka, msgspec, LangGraph, uv | `make up` (health en `/api/v1/health`); stack E2E: puertos 8001/27018/6380/6007 |
| `bkt-cortex-proxy-llm` | Proxy LLM: `/api/v1/llm/chat/completions` (solo Chat Completions, no Responses API), `/eval/chat/completions`, `/text/tokenization`, `/health`. Anonimiza PII (quita tildes salvo la ñ) y traza en Phoenix | Python >=3.12, FastAPI, gunicorn, Phoenix/OTEL | `docker compose --env-file <externo> -f docker-compose.yaml -f <override-externo> up -d --build` (red externa `bkt-agentic-ticketing-network`, puerto solo en `127.0.0.1:8010`) |
| `bkt-jira-forge` | App Forge BankDesk AI, independiente del trigger (ver arriba) | JS, `@forge/*`, Vite + React 18 | `npm install`; `npm run deploy` / `npm run tunnel` (ver `SETUP.md` del repo) |

## Puertos locales (verificados en la sesion de la demo BFC)

| Servicio | Puerto host | Nota |
|---|---|---|
| bkt-integration-service | 8000 | |
| bkt-integration-service-mongo | 27017 | BD `bkt-integration-service` |
| agent-runtime (app) | 8001 -> 8000 en el contenedor | remapeado por `APP_HOST_PORT` para no chocar con integration-service |
| agent-runtime-mongo | 27018 | BD `agentic_core`; **catalogo de agentes/providers/modelos, no tickets** |
| agent-runtime-redis | 6380 -> 6379 | |
| agent-runtime-phoenix | 6007 -> 6006 | trazas OTEL de agent-runtime |
| bkt-cortex-proxy-llm | 127.0.0.1:8010 | solo loopback a proposito; sin autenticacion real (`PROXY_API_KEY` no se valida hoy) |

Sin colision de puertos con esta asignacion. `bkt-integration-service` y `agent-runtime` no tienen healthcheck
Docker (salen `Up`, no `Up (healthy)`); `bktcortexproxyllm` si lo tiene.

## Variables de entorno (solo nombres)

- **bkt-jira-triggers** (variables Forge cifradas/no cifradas, sin `.env`): `INTEGRATION_SERVICE_BASE_URL`,
  `INTEGRATION_SERVICE_API_KEY` (cifrada), `INTEGRATION_SERVICE_API_KEY_HEADER` (valor `X-API-KEY`).
- **bkt-jira-forge** (variables Forge, distintas de las del trigger): `LANGGRAPH_URL` (en realidad la URL base de
  integration-service), `BACKEND_API_KEY`, `LLM_API_KEY`, `SEED_SECRET`, `SEED_WEBTRIGGER_URL`.
- **integration-service:** `NODE_ENV`, `PORT`, `API_VERSION`, `API_KEY`, `API_KEY_HEADER`, `MONGO_INITDB_ROOT_USERNAME`,
  `MONGO_INITDB_ROOT_PASSWORD`, `MONGODB_DATABASE`, `MONGODB_HOST`, `MONGODB_USERNAME`, `MONGODB_PASSWORD`,
  `MONGODB_MAX_POOL_SIZE`, `MONGODB_MIN_POOL_SIZE`, `LOG_LEVEL`, `LOG_PRETTY_PRINT`, `CORS_ORIGIN`, `CORS_CREDENTIALS`,
  `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`, `APP_NAME`, `APP_DESCRIPTION`, `HEALTH_CHECK_PATH`,
  `ORCHESTRATOR_BASE_URL`, `ORCHESTRATOR_ENDPOINT` (= `/api/v1/orchestrator/dispatch`), `ORCHESTRATOR_ROLE`
  (= `agentic-orchestrator-application`), `ORCHESTRATOR_TARGET`, `AGENT_RUNTIME_MODEL`, `AGENT_RUNTIME_INSTRUCTIONS`,
  `ATTACHMENT_BYTES_LIMIT`, `JIRA_BASE_URL`, `JIRA_USER`, `JIRA_PASSWORD`, `MESH_ID`, `ORIGINAL_TICKET_COLLECTION_NAME`,
  `PROCESSED_TICKET_COLLECTION_NAME`, `EXECUTIONS_COLLECTION_NAME`, `MAPPINGS_COLLECTION_NAME`, `MONGO_VOLUME_NAME`.
- **agent-runtime:** `APP_NAME`, `APP_VERSION`, `ENVIRONMENT`, `SERVER__DEBUG`, `LOGGING__LEVEL`, `LOGGING__JSON_LOGS`,
  `APP_HOST_PORT`, `MONGO_HOST_PORT`, `REDIS_HOST_PORT`, `PHOENIX_HOST_PORT`, `MONGO_VERSION`, `MONGO_ROOT_USER`,
  `MONGO_ROOT_PASSWORD`, `MONGODB__DSN`, `MONGODB__APP_NAME`, `MONGODB__SERVER_SELECTION_TIMEOUT_MS`, `REDIS_VERSION`,
  `REDIS_PASSWORD`, `REDIS__URL`, `REDIS__KEY_PREFIX`, `REDIS__SOCKET_TIMEOUT_SECONDS`,
  `REDIS__HEALTHCHECK_INTERVAL_SECONDS`, `AUTH__ENCRYPTION_KEY`, `CACHE__*`, `OBSERVABILITY__OTLP_ENDPOINT`,
  `OBSERVABILITY__SERVICE_NAME`, `RESPONSES_AZURE_ENDPOINT`, `OPENAI_AZURE_API_KEY`, `AZURE_OPENAI_ENDPOINT`,
  `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_API_VERSION`, `ORCHESTRATOR__DEFAULT_MODEL`, `ORCHESTRATOR__INSTRUCTIONS`,
  `CORTEX_PROXY_ENABLED`, `CORTEX_PROXY_BASE_URL`, `CORTEX_PROXY_PROVIDER`, `CORTEX_PROXY_API_KEY`,
  `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `WATSONX_URL`, `WATSONX_APIKEY`, `WATSONX_PROJECT_ID`.
- **bkt-cortex-proxy-llm** (definidas en `docker-compose.yaml`, no en `.env`; ver riesgo R1): `SECRET_KEY`,
  `PROXY_API_KEY`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_VERSION`,
  `DEFAULT_LLM_SCORE_MODEL` (obligatoria en `config.py`, el compose original no la define), `DEFAULT_LLM_SCORE_PROVIDER`,
  `PHOENIX_COLLECTOR_ENDPOINT`, `PHOENIX_PROJECT_NAME`, `PHOENIX_API_KEY` (opcional), `ENVIRONMENT`, `LOG_LEVEL`,
  `JSON_LOGS`, `PROJECT_NAME`, `DEBUG`, `TZ`, `GUNICORN_WORKERS`, `GUNICORN_THREADS`, `GUNICORN_BIND`, `GUNICORN_RELOAD`.

## Contrato de entrada `POST /api/v1/issues`

Un ticket por peticion, cabecera de API key (nombre configurable, por defecto `X-API-KEY`). Cuerpo real que emite
el trigger para un ticket BFC (verificado por ngrok en la demo):

```json
{
  "initiatedBy": "bkt-jira-triggers",
  "issues": [
    {
      "id": "<id-jira>",
      "key": "BFC-4",
      "fields": {
        "summary": "<titulo>",
        "issuetype": { "name": "Error" },
        "status": { "name": "Por hacer" },
        "project": { "key": "BFC" },
        "priority": { "name": "..." },
        "created": "...",
        "updated": "..."
      }
    }
  ]
}
```

Exito = HTTP `201` **y** `data.summary.successIntegration = true` **y** `data.tickets[0].success = true`.
Contrato completo en `bkt-integration-service/openapi.yaml`. **El evento de Jira no trae `description`,
`assignee` ni `components`**; los campos obligatorios de integration-service son solo `key` y `fields.summary`,
asi que el flujo no falla, pero el agente solo ve el titulo del ticket, nunca su descripcion. **Desde el
2026-09-30, `fields.attachment[]` si se manda** (metadata del adjunto, no el fichero en si — ver seccion de
arriba); el trigger real desplegado en Forge todavia no se probo con este campo en un ticket real (solo
verificado local/sintetico, ver HANDOFF seccion 20.5).

## Adaptador `orchestrator/dispatch` (agent-runtime)

Piezas nuevas en `agent-runtime/src` (sin commitear en el momento de escribir esto):
`api/controllers/orchestrator.py`, `api/routers/orchestrator.py`, `api/schemas/orchestrator.py`,
`models/orchestrator.py`, `services/orchestrator.py`. Resume:

- `POST /api/v1/orchestrator/dispatch` recibe `{rol, ticket_id, mesh_id, execution_id, ticket_context?}`.
- Resuelve el agente por `rol` (id o nombre) contra la coleccion `agents`; hoy solo existe
  `agentic-orchestrator-application`.
- Arma un `ConfiguredAgentChatRequest` con `stream=false`, `chat_id = execution_id` y metadata con
  `request_id`, `ticket_id`, `mesh_id`, `role`.
- Devuelve 502 si el chat no termina en `status: completed`.

## Puerta LLM: bkt-cortex-proxy-llm

`CORTEX_PROXY_ENABLED=true` activa en `agent-runtime/src/providers/azure_openai.py` un camino alternativo en
`get_chat_model`: apunta a `CORTEX_PROXY_BASE_URL` (`http://bktcortexproxyllm:8010/api/v1/llm`), usa
`use_responses_api=False` y `disable_streaming=True` (cortex no emite SSE real: con `stream:true` devuelve un
`chat.completion` completo, no chunks). Con el flag en `false` vuelve a llamar a Azure OpenAI directo
(`RESPONSES_AZURE_ENDPOINT`, Responses API). Verificado en real: `bktcortexproxyllm` reenvia a Azure con
`provider="azure"`, modelo `gpt-5.2-nextai`, y traza en Phoenix.

## Migracion Python de bkt-integration-service (en marcha, 2026-09-28)

`bkt-integration-service/bkt_integration_service_python/` — version paralela en Python (Litestar + Dishka),
implementada segun `contexto_para_proyectos/Plan_implementacion_codex_bkt_integration_service_python_28_09_2026.md`
(derivado a su vez de `Plan_migracion_integration_service_python_litestar_dishka_25_09_2026.md`). Fases 0-4
del plan implementadas y **probadas end-to-end contra el Mongo real** del stack TS (mismo `MESH_ID`, mismos
mappings): `POST /api/v1/issues` reproduce la misma respuesta `201` byte a byte que el TypeScript, incluido
el motor de mappings (`getValueByPath`/`setValueByPath`, transformadores `copy`/`mapToString`/`severity`),
la persistencia en las 4 colecciones (`_id` siempre string, nunca `ObjectId`) y el dispatch fire-and-forget
hacia `agent-runtime` (probado tanto en exito como en fallo controlado). No sustituye al TypeScript: corre en
paralelo, puerto `8003` vs `8000`. Riesgo de rutas largas de OneDrive tambien afecta a Python (DLL de
`msgspec`): el venv de `uv` debe crearse fuera de esta ruta, ver `CLAUDE.md`. Detalle completo: HANDOFF
seccion 15; pendientes (adjuntos/`BFC-2`, Fases 5-7, Docker real, tests de integracion/contrato): README propio
de la subcarpeta.

## Estado

Flujo E2E **validado en real** con el ticket **BFC-4**: `POST /api/v1/issues` -> `201`, Mongo
(`executions` 13->14, `tickets`/`itsm_tickets` 9->10, `mappings` sin cambio en 17), dispatch a agent-runtime -> `200`,
llamada a cortex -> Azure OpenAI, sin duplicados. `BFC-3` (primer intento) quedo con `401` por una API key de Forge
desalineada, ya corregida; **no se ha editado ni reprocesado**.

**Re-validado el 2026-09-27 (sesion tarde) con el ticket BFC-7**, tras un incidente: la app de
`bkt-jira-triggers` se desinstalo por accidente del site durante una limpieza de apps Forge duplicadas
(`bkt-jira-forge`), dejando el pipeline automatico sin trigger (confirmado con `BFC-6`, que no disparo nada).
Reinstalada por CLI (`forge install`); flujo completo vuelto a probar de punta a punta con `BFC-7` y todos los
tramos OK (Forge logs, ngrok, integration-service, Mongo, agent-runtime, cortex). Detalle completo del incidente
y de la limpieza de apps: HANDOFF seccion 14. Pendiente: renombrar la app del trigger en el Developer Console a
`bkt-jira-triggers` (bloqueado por un problema de cuenta en el navegador de automatizacion; queda para el usuario).

**2026-09-29:** incidente de Mongo del stack TS (perdida de acceso al recrear el contenedor app, y catalogo
`mappings` del `MESH_ID` real vacio tras recuperar el acceso) detectado y resuelto sin perder ningun ticket
historico: 11 mappings restaurados, `MESH_ID` corregido en `.env`, verificado con `POST /api/v1/issues` real.
Detalle: HANDOFF seccion 17.

**2026-09-29 (noche):** cerrados todos los gaps de codigo de la migracion Python que quedaban documentados
(indice de Mongo huerfano, `createdAt`/`updatedAt`, tests de integracion/contrato antes vacios,
`AttachmentService`/`JiraAttachmentFetcher` portados, en su version de texto plano: sin Markdown, PDF, Excel, PowerPoint,
JSON ni aislamiento, que solo existen en la version TypeScript) y **subidos a GitLab**
(`feature/bkt-integration-service-python`, commits `1c61649`/`b81808f`) — 48/48 tests en verde, verificado contra el
remoto real. Confirmado ademas que los cambios de Manuel en `develop` ya estaban integrados en Python (no
hizo falta portar nada). Probado con Postman por el propio usuario contra los dos servicios (TS y Python,
`201` en ambos). `main` no se toco. Detalle completo: HANDOFF secciones 18 y 19.

**2026-10-08:** en curso **TICK-157** (campos y API key del servicio de integracion en los planes Forge), solo en
`bkt-jira-triggers`: revision hecha y plan escrito, sin implementar. Mantiene el modelo de variables actual
(`INTEGRATION_SERVICE_BASE_URL`, `INTEGRATION_SERVICE_API_KEY`, `INTEGRATION_SERVICE_API_KEY_HEADER`, `X-API-KEY`) y no
fusiona `origin/main`. Hallazgo: la validacion de `INTEGRATION_SERVICE_BASE_URL` acepta `https://https://...` (causa del 403 de
`BFC-23/24/25`), `http://` y bases con la ruta del endpoint. La tarea de colas/Kafka (TICK-196) la hace otra persona y queda
fuera de este workspace. Detalle: HANDOFF 20.15.

Detalle completo, riesgos y pendientes: `HANDOFF.md`.
