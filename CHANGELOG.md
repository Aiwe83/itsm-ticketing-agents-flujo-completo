# CHANGELOG

Historial de cambios del workspace `itsm-ticketing-agents-flujo-completo` (documentacion y preparacion del flujo E2E con DAT-3).
Formato: [Keep a Changelog](https://keepachangelog.com/). Los repos tienen su propio historial
(`bkt-jira-triggers` e `bkt-integration-service` mantienen `CHANGELOG.md`); este fichero no lo sustituye.

## [Unreleased]

### Changed / Docs — 2026-10-02 (cierre): documentacion de las pruebas y verificaciones
- `e2e/LEEME.md` reescrito: que mide cada prueba, glosario (`skipped`, `unsupported`, `too_large`...), salida real anotada,
  orden recomendado de 9 pasos y cuando crear el ticket (solo tras `preflight.js` en PASS, adjuntando los 10 ficheros en el
  mismo formulario). `preflight.js` imprime ahora el siguiente paso manual. Regla nueva en `CLAUDE.md`: guias paso a paso.
- Guia de pruebas manuales: `documentos_prueba/` incluye ya el `.docx` (estaba solo en el contenedor); comandos con ruta
  resuelta; orden preflight → ticket → `verify.js`.
- Verificado: Mongo local sin `integration_user` y sin acceso anonimo en los 3 contenedores; `.git` de
  `bkt-integration-service` sano (no re-clonar). Hallazgo: la version Python de adjuntos sigue en texto plano.
- No subido: la suite E2E y el arreglo del test de memoria. Sin CI en GitLab (propuesta en `e2e/LEEME.md`). HANDOFF 20.14.
- `graphify update .`: 5069 nodos, 7786 aristas, 545 comunidades.

### Added — 2026-10-02: prueba E2E automatizada, capas 1 y 2 (sin subir)
- `bkt-integration-service`: suite `test:e2e` (Jira falso + Mongo en memoria, sin Docker ni ngrok) con los 10 adjuntos de la
  guía; `E2E_HOSTILE=1` suma el Excel hostil. 24 suites, 158 tests (+1 gated), `tsc`/`eslint` limpios.
- Carpeta local `e2e/`: `preflight.js` de solo lectura (servicio, ngrok, variable de Forge, trigger, token de Jira); 6/6 PASS.
- Arreglado un test intermitente (`worker-runner`, límite de memoria bajo Jest); producción no afectada. HANDOFF 20.13.
- Capa 3 semiautomática: `e2e/verify.js` + `expected.json`. Prueba real `BFC-29` (ticket creado desde el navegador con los
  10 adjuntos, con permiso del usuario para ese paso): preflight 6/6, verificación en Mongo 10/10 y traza de Forge sin fallos.

### Added — 2026-10-02: aislamiento de PDF y Excel en worker_threads (TICK-181, subido: `faadeeb` / README triggers `cc9bc4b`)
- `bkt-integration-service`: los conversores PDF y xlsx corren en un worker con limite de memoria y se matan al
  vencer el timeout (`worker-runner.ts`, `conversion.worker.ts`, semaforo de 2 workers,
  `ATTACHMENT_CONVERT_CONCURRENCY`). Memoria -> `too_large`, timeout/error -> `unsupported`; OpenAPI intacto.
- Verificado: 156 tests (antes 146); xlsx hostil real en contenedor -> `too_large` en 10.3 s con el hilo
  principal vivo (parada maxima 101 ms) y `/health` OK; los 10 documentos de prueba sin regresion. Detalle: HANDOFF 20.12.
- Pendiente: commit/push a `feature/bkt-integration-service` cuando el usuario lo ordene.

### Added — 2026-10-02: TICK-181, mas formatos de adjunto convertidos a Markdown
- `bkt-integration-service`: PDF, Excel (xlsx), PowerPoint (pptx), JSON y Markdown, con registro de conversores,
  deteccion por firma, timeout, topes de salida y de descompresion. 146 tests (antes 84); prueba real **BFC-27**
  con descarga real de Jira. RTF, xls/ppt antiguos, imagenes y Python quedan fuera. Detalle: HANDOFF 20.11.
- Prueba por el flujo completo (navegador, trigger real): **BFC-28** con 10 adjuntos; 6 convertidos y 4 casos
  negativos `unsupported`. Documentos de prueba en `contexto_para_proyectos/pruebas_manuales/documentos_prueba/`.
- Jira (`sdlc-assistants`, por API): TICK-181 y subtareas TICK-182..189 creadas; las subtareas en "En revision".
- **Subido a GitLab** (solo estas ramas, `main` intacto): `bkt-jira-triggers` → `feature/bkt-jira-triggers`
  (`ef59d92`, 16 ficheros) y `bkt-integration-service` → `feature/bkt-integration-service` (`109a8be`, 17 ficheros).
  README de ambos repos actualizados. Pendiente:
  `tsconfig.json` (quita `baseUrl`) no incluido. Rama remota `feature/jira-forge-triggers` renombrada a
  `feature/bkt-jira-triggers`.
- Seguridad Mongo local ya anotada arriba; regla nueva: CLI/API antes que navegador.
- `graphify update .`: 4859 → 4936 nodos, 7406 → 7567 aristas, 526 → 538 comunidades.

### Added — 2026-10-02: tarea pedida por Francisco y revision de seguridad de Mongo
- Nueva tarea **TICK-181** (Jira, `sdlc-assistants`): ampliar los tipos de adjunto que se convierten a Markdown
  (hoy Word y texto; añadir PDF, Excel, PowerPoint y mas). Creada por API REST; regla nueva en `CLAUDE.md`: CLI/API
  antes que navegador. Francisco dio por Teams el visto bueno para subir `bkt-jira-triggers` (pendiente de que el
  usuario lo ordene).
- Seguridad Mongo local: `example_user` (root, entraba con la clave de `.env.example`) con contraseña rotada, y
  puerto 27017 solo en `127.0.0.1`; datos intactos. Pendiente: Mongo de Python (27019) y `agent-runtime`
  (27018) siguen abiertos en `0.0.0.0`. Detalle: HANDOFF 20.9 y 20.10.

### Fixed — 2026-10-01 (tarde): 403 de Forge a integration-service tras el deploy v26.12.0
- **Causa:** `INTEGRATION_SERVICE_BASE_URL` con `https://` doble quedo baked en el despliegue (las variables de
  Forge solo se aplican al desplegar); Forge lee el host como `https` y devuelve un 403 sintetico sin salir a
  la red. El intento con Cloudflare (egress nuevo) nunca se aplico: pedia `--approve MAJOR_VERSION_RULE`.
- **Arreglo:** egress revertido a `*.ngrok-free.dev`, variable correcta, cloudflared parado, deploy
  **v26.13.0**; ticket real **BFC-26** → `201`, adjunto convertido a Markdown en Mongo.
- **Nuevo:** `jira.integration.response` registra `diagnostic{host,server,cfRay,ngrokErrorCode,bodyHint}` en
  errores HTTP (48/48 tests). Tickets BFC-23/24/25 quedan sin procesar como evidencia.
- Docs de `contexto_para_proyectos/` actualizados (guia de adjuntos, resumen, guias E2E TS/Python, ideas) y
  `graphify update .`: 4859 nodos, 7406 aristas, 526 comunidades.
- Detalle: HANDOFF 20.8b. Nada commiteado ni pusheado.

### Changed — 2026-10-01: fusion con el `main` real de `bkt-jira-triggers` (Manuel, commit `098d98c`) y redeploy
- Auditoria de solo lectura de `develop`/`main` de los 5 repos encontro que `bkt-jira-triggers` `main` ya
  tenia, de forma independiente, una version mas completa de la misma idea de adjuntos: lee el ticket
  completo por REST (`GET /rest/api/3/issue/{key}?fields=...`, nuevo `src/jira-client.ts`) en vez de solo
  `fields.attachment` — trae tambien descripcion (ADF aplanada a texto), prioridad real, componentes y
  responsable.
- **Se fusiono solo esa parte** (decision explicita del usuario, "Part A"): se descarto la parte sin
  relacion del mismo commit (`BACKEND=dev|prod`, cambio de config de runtime). Se retiro la implementacion
  propia mas estrecha (`jira-issue-fetcher.ts` + su test), preservando intacto el filtro BFC del trigger y
  el resto de trabajo previo sin commitear, ajeno a los adjuntos.
- **47/47 tests** en `bkt-jira-triggers` (antes 35/35 — suma `jira-client.test.ts` nuevo y casos de
  `description`/`components`/`assignee`/`adfToPlainText`), `typecheck`/`lint`/`build`/`forge:lint` en verde.
- **Desplegado a Forge development: v26.12.0** (antes v26.9.0).
- Guia de pruebas manuales y resumen ejecutivo actualizados: ya no hay un paso de log separado
  (`jira.attachment.lookup`) para el adjunto, queda resumido en `jira.contract.payload.built` — 4 lineas
  de traza por invocacion en vez de 5.
- Pendiente: reverificar con un ticket real de Jira nuevo (BFC-21/22 siguen siendo la ultima prueba real,
  hecha antes de esta fusion). Nada commiteado ni pusheado.
- Detalle completo: HANDOFF seccion 20.8.

### Fixed — 2026-10-01 (cierre): adjuntos de Jira funcionando de punta a punta, verificado en real
- **2 bugs reales mas, encontrados tras los 2 de la entrada anterior** (los 4 solo aparecen al hablar
  con Jira de verdad, ningun test local los detecto): `got.get()` devuelve un objeto `Response`, no el
  buffer directo — el codigo pasaba el objeto entero a mammoth/JSZip (`"JSZip can't accept a stream"`),
  corregido usando `response.body`; y `followRedirect: false` dejaba el body vacio porque Jira Cloud
  redirige la descarga real a una URL firmada de su plataforma de media, corregido a
  `followRedirect: true` (el origen de partida ya queda validado contra la lista de confianza antes).
- **Exito total, verificado por el camino real completo** (no un reenvio directo al servicio): ticket
  real `BFC-21` creado a mano en Jira con un `.docx` adjunto -> trigger desplegado en Forge lo captura
  -> ngrok -> servicio -> descarga real -> Markdown con tabla intacta. Repetido con `BFC-22`
  (adjunto anadido despues de crear el ticket) con el mismo resultado. Verificado en 3 capas: Jira
  (adjunto visible), inspector de ngrok (payload real completo) y Mongo (`markdown` con la tabla).
- **Incidente de credenciales, resuelto:** el segundo token de Jira (tras rotar el primero, expuesto
  por accidente) resulto estar generado en una cuenta de Atlassian distinta — daba `401` antes de
  llegar siquiera a los bugs 3 y 4. Generado uno nuevo en la cuenta correcta, verificado con
  `GET /rest/api/3/myself` -> `200` antes de usarlo.
- **84/84 tests** en `bkt-integration-service` (82 + 2 nuevos: byte-limit y gateway de Atlassian),
  **41/41** en `bkt-jira-triggers`, `typecheck`/`lint`/`openapi:check` en verde en ambos.
- **Guia de demo reescrita a fondo** tras varias rondas de feedback en vivo: convencion paso a paso
  (carpeta / comando / resultado esperado / que explicar / que demuestra), comandos en una sola linea
  sin continuacion por backtick (fallaban al copiar/pegar en PowerShell), leyenda inicial aclarando
  que bloques se pegan y cuales no, Mongo con comando directo (lee credenciales del `.env` en el
  momento) y opcion visual con Compass paso a paso.
- **Nuevo documento resumen** (`contexto_para_proyectos/explicaciones/Resumen_adjuntos_trigger_a_markdown.md`):
  explicacion sin jerga interna de que se pidio, que se hizo y los 4 bugs encontrados, con links
  directos a los ficheros de codigo reales.
- Tickets reales en BFC, ninguno editado/borrado: BFC-18 a BFC-22 (5 en total).
- Nada commiteado ni pusheado — instruccion explicita del usuario, en pausa.
- Detalle completo: HANDOFF secciones 20.6b-20.6d.

### Fixed — 2026-10-01: dos bugs reales de adjuntos encontrados probando contra Jira real
- **El evento `created` de Jira nunca trae `fields.attachment`** (confirmado contra el ticket real
  BFC-18, `issueFieldKeys` de Forge no lo incluye). Corregido en `bkt-jira-triggers`: nuevo
  `src/jira-issue-fetcher.ts` pide el adjunto aparte via `requestJira` (scope `read:jira-work` ya
  concedido), `handler.ts` lo incorpora antes de construir el contrato, nuevo log
  `jira.attachment.lookup`. 41/41 tests, desplegado a Forge dev (v26.9.0), verificado en real contra
  BFC-19 (`attachmentCount:1`).
- **El `JiraAttachmentFetcher` de `bkt-integration-service` rechazaba la descarga real** ("Attachment
  host is not allowed"): la URL de adjunto real de Jira Cloud usa el gateway
  `api.atlassian.com/ex/jira/<cloudId>/...`, no el dominio de `JIRA_BASE_URL`. Fix en curso (aceptar
  tambien ese origen fijo de Atlassian).
- **Credenciales reales de Jira configuradas** en `bkt-integration-service/.env` (antes placeholders
  falsos). Incidente: un token real se pego por accidente en el chat, tratado como comprometido y
  rotado de inmediato, nunca usado.
- **Incidente de infra, resuelto sin perdida de datos:** reconstruir el contenedor desde el repo uso
  por error el `docker-compose.yaml` versionado (puerto 8001, choque con `agent-runtime`) en vez del
  compose real que sirve trafico (puerto 8000, en scratchpad) — servicio quedo caido unos minutos,
  recuperado apuntando al compose correcto.
- Tickets reales en BFC, ninguno editado/borrado: BFC-18, BFC-19, BFC-20.
- Detalle completo: HANDOFF secciones 20.6b y 20.6c.

### Added — 2026-09-30: adjuntos de Jira pasados del trigger al servicio, convertidos a Markdown (solo TS)
- **Feature nueva, implementada y verificada end-to-end en local, solo TypeScript** (`bkt-jira-triggers` +
  `bkt-integration-service`; `bkt-integration-service-python` pospuesto a proposito). Era codigo muerto hasta
  hoy: el trigger nunca mandaba `fields.attachment` y el `AttachmentService` existente nunca recibia nada
  real. Precedido de Plan Mode completo + revision de riesgo con LLM Council (5 asesores), que confirmo la
  auth de Jira ya disponible y forzo anadir un tope de expansion HTML para adjuntos `.docx` (proteccion
  zip-bomb).
- `bkt-jira-triggers`: nuevo `attachmentSchema` (Zod) normaliza `{id?, filename, content=URL, mimeType?,
  size?}` (descarta items sin `filename`/`content`, tope `MAX_ATTACHMENTS=20`); fix obligatorio en
  `handler.ts` para que el log nunca incluya la clave `attachment` (solo un contador) — `sanitize.ts` marca
  por nombre de clave, no por valor. **35/35 tests, 4 suites.**
- `bkt-integration-service`: `AttachmentService` reescrito a Markdown (`mammoth.convertToHtml` + `turndown` +
  `turndown-plugin-gfm`, campo `plainText` renombrado a `markdown` en todo el contrato/OpenAPI). **Bug real
  encontrado durante la implementacion** (no estaba en el plan): `turndown-plugin-gfm` solo convierte tablas
  con `<th>` literal, y Word/mammoth nunca genera `<th>` — ninguna tabla real se habria convertido. Corregido
  con 4 reglas turndown propias, verificado contra un `.docx` con tabla real. Segundo bug (saltos de linea
  embebidos en celdas) encontrado y corregido en una pasada de pulido posterior. **82/82 tests, 15 suites**;
  `openapi:check`/`openapi:lint` en verde.
- **Nada commiteado ni pusheado** en ninguno de los dos repos (instruccion explicita del usuario, en pausa).
- Nueva guia de demo, lista para el viernes:
  `contexto_para_proyectos/pruebas_manuales/Pruebas_manuales_adjuntos_trigger_a_markdown.md`.
- Jira (API REST directa, sin MCP disponible): **TICK-162** (CI/logs/prueba de adjunto real) + subtareas
  **TICK-163/164/165**; **TICK-166** (esta feature) + subtareas **TICK-167 a TICK-175**. Todos asignados al
  usuario.
- `graphify update .` (sin LLM): 4693/7149/514 -> **4816 nodos, 7332 aristas, 527 comunidades**.
- Detalle completo: HANDOFF seccion 20.

### Added/Fixed — 2026-09-30: CI de Python en pausa, logging centralizado, sin pull de develop
- **CI para `bkt-integration-service-python`** (`.gitlab-ci.yml`, `ruff` con 25 hallazgos autoarreglados)
  construido y verificado en un clon temporal (`/c/tmp/bkt-ci-check`), **sin commitear ni pushear**
  (instruccion explicita del usuario, en pausa — mismo criterio que la seccion 16).
- **Logging centralizado local nuevo**: `observability/` (Filebeat 8.13.0, autodiscover Docker por
  contenedor exacto) sobre el Elasticsearch/Kibana 8.13.0 ya existentes en el compose de la raiz; data view
  de Kibana creada (`itsm-logs-*`).
- **`LOG_PRETTY_PRINT=false`** en `bkt-integration-service/.env` (antes `true`): el `pino-pretty` multilinea
  se fragmentaba en varios documentos Elasticsearch por evento, rompiendo la correlacion en Kibana entre
  "Issues received"/"Issues processed successfully" de un mismo ticket. Decision delegada por el usuario,
  resuelta con `false` para que cada evento sea un unico documento completo, igual que `loguru` en Python.
- Revisado (solo lectura) si convenia traer `develop` a los 4 repos: **no**, por trabajo local sin
  commitear en curso.
- Detalle completo: HANDOFF seccion 20.6.

### Added/Fixed — 2026-09-29 (noche): push real a GitLab, cambios de Manuel verificados, Postman afinado
- **Push de los gaps de codigo (indice, timestamps, tests, AttachmentService) a GitLab**, rama
  `feature/bkt-integration-service-python`: commits `1c61649` y `b81808f`, fast-forward, verificado contra el
  remoto real tras el push (ninguna de las exclusiones del usuario llego ahi). Hecho desde un clon
  temporal en ruta corta (mismo patron que el incidente de la seccion 16 de HANDOFF), nunca desde el
  working tree con cambios sueltos del usuario. `main` no se toco en ningun momento.
- **Investigada la estructura real de `feature/bkt-integration-service-python`** antes de tocar nada: el clon local
  era shallow con fetch restringido a `main` (por eso no se veian otras ramas, no porque no existieran);
  la rama contiene el commit de recuperacion de la seccion 16 (`82f985e`) mas evolucion posterior legitima
  que promociono Python a la raiz (ya no hay `src/` TS ahi).
- **Cambios de Manuel (`develop`) verificados campo a campo contra 12 ficheros de Python — ya estaban
  integrados**, no hizo falta portar nada nuevo (indice de Mongo, modelo `Ticket`, `issue.service`,
  `orchestrator.service`, `MONGODB_PORT`, catalogo de mappings v2.0.0, entre otros). En el
  `bkt-integration-service` local (rama `sync/develop-into-main`, que ya es `develop` + 3 ficheros extra):
  terminados y commiteados en local 5 tests que quedaban a medio corregir de una sesion anterior
  (`63ebcfd`, 15/15 suites, 80/80 tests) — sin push, sin destino remoto obvio todavia.
- **Dos documentos nuevos para explicar el trabajo**: un resumen de 2 minutos para el jefe (con links
  reales a GitLab) y una narrativa en primera persona de toda la migracion (por que Litestar/Dishka, paso
  a paso, con links a rutas locales del codigo).
- **Postman configurado para los dos servicios**: segundo entorno para Python creado; dos fugas de la
  API key de Python en capturas compartidas en el chat, rotada las dos veces; las keys reales ahora se
  escriben directo en los ficheros de entorno (nunca copy/paste manual, nunca impresas). Aclaradas y
  documentadas en las guias las confusiones en vivo con el usuario: "collection" de Postman vs "coleccion"
  de Mongo, activar el entorno tras importarlo, y que Postman nunca manda nada directo a Mongo.
- **Payload de Postman corregido**: le faltaba `fields.assignee`, con lo que 3 de los 11 mappings reales
  (los de `assignee.*`) nunca se probaban. Añadido con datos genericos (detectado por el usuario al
  comparar con el ejemplo real de Manuel), mas un test que verifica el mapeo.
- Verificado por el propio usuario desde Postman: **TS y Python, `201 Created` en los dos**.
- Detalle completo: HANDOFF secciones 18 y 19.

### Fixed — 2026-09-29: incidente de Mongo (TS) — acceso perdido y catalogo mappings restaurado
- Al recrear el contenedor `bkt-integration-service` se perdio el acceso al Mongo real (usuario/clave no
  coincidian); recuperado sin tocar el volumen `integration-service_mongo_data` (usuario admin nuevo creado
  como pura adicion, nunca se borro nada).
- Ya con acceso, se detecto que el catalogo `mappings` del `MESH_ID` real en uso (`dc9ca342-...`, 11 filas,
  documentado el dia anterior en HANDOFF seccion 6/15.3 como identico a
  `bkt_agents.mappings.json`) **no estaba** en el volumen recuperado — solo quedaban las 6 filas del catalogo
  legacy sin usar. Efecto real: cualquier ticket habria entrado con `201` pero con `content` casi vacio, sin
  error visible (el motor de mappings no tiene nada que iterar si no hay filas para ese `meshId`).
- Restauradas las 11 filas bajo `dc9ca342` (contenido de `bkt_agents.mappings.json`, un `_id` reasignado por
  colision con una fila legacy) y corregido `MESH_ID` en `bkt-integration-service/.env` (quedaba desactualizado
  a un valor legacy; el valor real se venia pasando solo por entorno de shell efimero, nunca persistido).
  Verificado con `POST /api/v1/issues` real: `content` completo (`key/summary/description/issueType/status/
  priority/components/assignee.*`).
- Un primer intento de arreglo (antes de releer HANDOFF) edito por error 2 filas del catalogo legacy y forzo el
  contenedor a ese `meshId` equivocado; corregido en la misma sesion al detectar la contradiccion con lo ya
  documentado el dia anterior. El fichero de mappings de Manuel usado para la restauracion **no era de otro
  entorno**: es la copia de referencia de nuestro propio catalogo real.
- Limpieza: borrado un ticket de verificacion contaminado (`BFC-TS-VERIFY-1`, creado con el `meshId` equivocado,
  `content` casi vacio) y dos tickets de prueba propios (`DAT-3`/`DAT-4`, ni reales ni necesarios una vez
  verificado el fix). Estado final: 16 tickets reales, 40 executions, 17 mappings — mismos numeros que antes
  del incidente de acceso.
- `graphify update .` (sin LLM): 4344/7829/437 -> **4693 nodos, 7149 aristas, 514 comunidades**; curado anterior
  respaldado en `graphify-out/2026-09-29/`.
- **Mismo bug, independiente, en `bkt-integration-service-python`:** su `.env` no fijaba `MESH_ID` (caia al
  default legacy `6a323e68` del `docker-compose.yaml`) aunque su Mongo propio (`:27019`, nunca afectado por el
  incidente TS) si tenia sus 11 mappings correctos bajo `dc9ca342`. Efecto: `201` pero `ticketsFailed: 1`,
  `content` sin transformar, `E11000 duplicate key` en `tickets`. Corregido fijando `MESH_ID` en su `.env` y
  recreando el contenedor (datos verificados intactos); reintentada la prueba core -> `201` limpio.
- **Incidente de seguridad menor:** un subagente de verificacion imprimio por accidente el `API_KEY` real de
  Python en su propio log al listar variables de entorno con un filtro amplio. Nunca llego a mostrarse en la
  conversacion principal; tratado como comprometido y **rotado de inmediato** (nuevo valor generado con
  `openssl rand -hex 32`, solo en `.env`, nunca impreso).
- Verificado con **4 agentes en paralelo** (a peticion del usuario): prueba core TS (`PASS`), prueba core Python
  (encontro y disparo la correccion de los dos puntos anteriores), auditoria de HANDOFF seccion 13 contra el
  contenido real de las guias de demo (mayoria ya corregida, tabla actualizada), y revision en seco (sin tocar
  Jira/ngrok/forge) de las secciones pendientes de esas guias (sin hallazgos criticos nuevos; la URL de ngrok
  guardada en Forge development ya no esta activa, asi que `forge variables set`+`forge deploy` seran
  obligatorios en la proxima ronda con ngrok).
- Detalle completo: HANDOFF seccion 17.

### Fixed — 2026-09-29 (continuacion): indice huerfano bloqueaba tickets reales, ronda Jira/ngrok TS cerrada
- Con autorizacion explicita, ronda real Jira/ngrok para TS: `BFC-12` fallo (`ticketsFailed: 1`) con
  `E11000 duplicate key ... meshId_1_itsmTicketId_1 ... itsmTicketId: null`. Causa: **indice unico huerfano**
  de un esquema viejo — el codigo actual (`Ticket.model.ts`/`database-indexes.ts`) ya no usa `itsmTicketId`
  (usa `key` top-level + `content` libre, `_id` UUID aleatorio), pero el indice viejo nunca se borro al migrar
  el esquema, y como ya no se escribe ese campo, cualquier ticket despues del primero colisiona.
- Corregido (autorizado): `db.tickets.dropIndex('meshId_1_itsmTicketId_1')` en Mongo TS **y** en Mongo Python
  (mismo indice huerfano confirmado ahi tambien, instancia separada). Hallazgo adicional: el port Python
  replica a proposito el indice viejo en `connection.py` pese a que su propio `ticket_repository.py` ya usa
  el esquema nuevo — inconsistencia interna del port, no corregida en el codigo esta ronda (fuera de alcance).
- Ticket nuevo `BFC-13`: exito total, `ticketsSucceeded: 1`, dispatch a agent-runtime `200`, cortex ->
  Azure OpenAI `200`, sin duplicados. **Ronda Jira/ngrok TS cerrada.**
- Bug de falso-positivo ya documentado (HANDOFF 14.6) pero nunca corregido en el fichero real: el check de
  errores de la guia TS (`"ticketsFailed.*[1-9]|ERROR"`) matcheaba codigos de color ANSI de Docker. Corregido
  limpiando ANSI antes de buscar; importante, este equipo usa PowerShell 5.1 (no 7+), asi que el escape `` `e ``
  no sirve para el caracter ESC (falla en silencio) — hay que usar `[char]27`.
- A peticion del usuario ("que cuando las haga yo todo coincida"), correcciones adicionales aplicadas a las
  dos guias de demo: filtros de Compass para `tickets` corregidos de `_id` regex a `{ key: "BFC-n" }` (el
  `_id` de `tickets` es UUID aleatorio, no `meshId:key`, desde que el esquema migro; `itsm_tickets` si sigue
  usando `meshId:key`); ejemplo de respuesta del paso Postman actualizado al shape real; lista de contenedores
  del paso 0.2 completada; nombre real `bkt-integration-service-mongo-1` corregido; cadena de conexion con
  `authSource=admin` y aviso de no confundir con el Mongo de `:27018`; fallback a `docker logs` documentado
  para cuando `forge logs` no devuelve nada (paso en falso confirmado hoy, CLI desactualizado).
- **Ronda Python tambien cerrada:** ngrok hacia `:8002`, ticket real `BFC-14` -> `401` (la API key de Forge
  development seguia con el valor viejo de Python, de antes de rotarla hoy). Corregido con
  `forge variables set --encrypt INTEGRATION_SERVICE_API_KEY <valor nuevo> -e development` + `forge deploy`.
  Ticket nuevo `BFC-15`: exito total, `201`, `ticketsSucceeded: 1`, dispatch `200`, cortex `200`, sin
  duplicados. **Ambas rondas Jira/ngrok (TS y Python) cerradas.** Tickets reales de hoy en Jira BFC:
  `BFC-12` (fallo, evidencia), `BFC-13` (exito TS), `BFC-14` (fallo, evidencia), `BFC-15` (exito Python);
  ninguno editado ni reprocesado.
- Detalle completo: HANDOFF secciones 17.10-17.14.

### Added — 2026-09-29 (continuacion): comparativa formal TS vs Python (Fase 5, TICK-139)
- Nuevo documento `contexto_para_proyectos/Comparativa_TS_vs_Python_bkt_integration_service_TICK-139.md`,
  a peticion del usuario, en respuesta al ticket real `TICK-139` de `sdlc-assistants.atlassian.net`
  (subtareas TICK-140 a TICK-144). Alcance aclarado con el usuario: solo documentacion/comparativa, sin
  tocar codigo nuevo (la lista larga de pendientes de migracion —AttachmentService, docker build, tests,
  fix de connection.py— queda fuera de esta ronda).
- Verificado en real: mismo payload enviado a TS y Python en la misma sesion, comparado campo a campo en
  HTTP y en las 3 colecciones de Mongo de cada uno. Contrato HTTP equivalente al 100%. Persistencia
  equivalente salvo una limitacion nueva encontrada: `tickets`/`itsm_tickets` en Python no llevan
  `createdAt`/`updatedAt` (`executions` si los lleva en ambos).
- Plan de corte y rollback/smoke-tests documentados (TICK-143/144), sin ejecutar ningun paso del corte.
- Detalle completo: HANDOFF seccion 17.15.

### Fixed/Added — 2026-09-29 (tarde): cierre de todos los gaps de codigo pendientes de la migracion Python
- **Indice huerfano corregido en codigo fuente** (no solo en Mongo en vivo): `connection.py` ya crea
  `meshId_1_key_1` (como TS), no el viejo `meshId_1_itsmTicketId_1`.
- **`createdAt`/`updatedAt` anadidos** a `tickets`/`itsm_tickets` en Python (`ticket_repository.py`,
  `itsm_ticket_repository.py`), cerrando la unica limitacion real que habia dejado la comparativa TICK-139.
- **`docker build` del servicio Python verificado** dos veces (`docker compose up -d --build`, sin errores).
- **Tests de integracion y contrato escritos**: `tests/conftest.py` + `tests/integration/test_issues_flow.py`
  (5 tests) + `tests/contract/test_issues_contract.py` (4 tests), todos contra el servicio y Mongo **reales**
  en Docker (no mockeados), tal como pedia el plan de migracion. Carpetas que antes solo tenian `__init__.py`.
- **`AttachmentService`/`JiraAttachmentFetcher` portados** (ultimo gap grande de la migracion): 226 lineas de
  TS portadas 1:1 (`mammoth` para `.docx`, `httpx` para descarga desde Jira), 9 tests unitarios portados
  literalmente de los `.test.ts` originales, conectado al flujo real (`issue_service.py`:
  `_post_process_tickets` enriquece adjuntos antes de despachar al orquestador, igual orden que TS).
  Verificado en real con un `.txt` (convertido a texto) y un `.png` (marcado `unsupported`).
- Suite completa: **48/48 tests en verde** (30 originales + 9 adjuntos + 5 integracion + 4 contrato).
- Detalle completo: HANDOFF seccion 18.

### Added — 2026-09-28: arranca la migracion Python de bkt-integration-service (Fases 0-4)
- Nueva subcarpeta `bkt-integration-service/bkt_integration_service_python/`: implementacion Python
  (Litestar + Dishka) de las Fases 0-4 del plan de migracion, portada 1:1 leyendo el TypeScript real fichero
  a fichero (config, auth por API key con SHA-256 + `hmac.compare_digest`, `X-Request-Id`, motor de mappings
  `getValueByPath`/`setValueByPath` con soporte `[*]`/`[n]` y transformadores `copy`/`mapToString`/`severity`,
  repositorios Mongo de las 4 colecciones, cliente hacia `agent-runtime` sin reintentos, dispatch
  fire-and-forget).
- 30 tests unitarios en verde (motor de mappings, comparacion de API key, validacion de payload).
- **Verificado end-to-end contra el Mongo real** del stack TypeScript (mismo `MESH_ID`, mismos mappings
  reales): `POST /api/v1/issues` con un payload tipo `BFC-4` devuelve `201` con exactamente la misma forma que
  el TypeScript (mismo `transformedIssue.content` campo a campo); persistencia correcta en `itsm_tickets`/
  `tickets`/`executions` (`_id` siempre string, nunca `ObjectId`); probado tambien el caso de fallo del
  orquestador (`successOrchestrator` queda en `false`, error registrado con el mismo `function` de origen que
  el TS, sin romper la respuesta `201`).
- 3 bugs reales encontrados y corregidos durante la verificacion: lifespan de Litestar sin
  `@asynccontextmanager`, `AsyncCollection.aggregate()` de pymongo async necesita `await` antes de poder
  encadenar `.to_list()` (a diferencia de `.find()`, que es sincrono y no lo necesita), y `UnicodeEncodeError`
  del logger en consola Windows (cp1252) al no forzar UTF-8.
- Carpeta renombrada de `integration_service_python` a `bkt_integration_service_python` (consistencia con el
  prefijo `bkt-` de los demas repos del workspace); se probo tambien sacarla a la raiz del workspace y se
  revirtio a petición del usuario, se queda anidada dentro de `bkt-integration-service/`.
- Revisado el plan de subida a GitLab (rama existente `feature/bkt-integration-service-python` del repo
  `bkt-integration-service`) por un consejo de 5 perspectivas independientes antes de ejecutar nada; consenso:
  revisar el contenido real de esa rama tiene que ser el primer paso, no uno intermedio. Plan final documentado
  en HANDOFF seccion 16, pendiente de ejecutar (Fase 0, solo lectura, en curso).
- Mismo riesgo de rutas largas de OneDrive (R2) confirmado tambien en Python: el venv de `uv sync` no puede
  vivir dentro de esta ruta porque el DLL nativo de `msgspec` (dependencia de Litestar) falla al cargar;
  solucionado con `UV_PROJECT_ENVIRONMENT` apuntando fuera de OneDrive.
- Plan de implementacion escrito para Codex (no ejecutado por Codex, ejecutado directamente en esta sesion a
  peticion del usuario): `contexto_para_proyectos/Plan_implementacion_codex_bkt_integration_service_python_28_09_2026.md`.
- Pendiente (no bloqueante): `AttachmentService`/camino secundario `BFC-2`, Fases 5-7 del plan (matriz de
  comparacion formal, prueba controlada documentada, plan de corte), build real de `Dockerfile`/
  `docker-compose.python.yml` (escritos, no verificados con `docker build`), tests de integracion/contrato
  automatizados (carpetas creadas, sin tests todavia).
- `graphify update .`: primer salto real de topologia del grafo desde que se mide (las corridas anteriores solo
  tocaban documentacion): 4039/7358/395 -> **4344 nodos, 7829 aristas, 437 comunidades**.

### Added — 2026-09-27 (sesion tarde): limpieza de apps Forge duplicadas, incidente del trigger y re-validacion con BFC-7
- `bkt-jira-forge`: desplegada e instalada una app Forge **nueva** (id `5624f551-6944-4a89-ad4c-e6239e541e69`,
  Developer Space `portal-ia-sdlc-pablo`) tras topar con `Authorization failed: insufficient permissions` en la
  app vieja del repo (id `430a4a8f-...`, resulto ser una referencia huerfana, nunca correspondio a una app real
  accesible). Panel renombrado a `bkt-jira-forge`, rebuild limpio del frontend (`vite build --emptyOutDir`), sin
  el bloque "PRUEBA BACKEND LOCAL / Ejecutar pipeline / Enviar a integration-service".
- Detectadas y retiradas **3 apps Forge duplicadas** instaladas en el mismo site, cada una anadiendo su propio
  panel al ticket BFC-5 (identificadas por el contenido real de cada panel, no solo por nombre):
  `BJF Demo Pablo` (id `3e30bae2-...`, panel "BJF - Asistente de incidencias (Demo)", con el bloque sucio),
  `bankdesk-ai-forge-original` (id `cac71f9e-...`, panel "Ticketing Agents Original", caso demo "BAFO-1"),
  `bankdesk-ai-forge-pablo` (id `d899c911-...`, panel "Ticketing Agents BAF Demo", caso demo "transferencias").
  Desinstaladas via `admin.atlassian.com -> Aplicaciones conectadas -> Desinstalar`; verificado con
  `forge install list --app-id-override <id>` -> `not installed anywhere` en las 3. Sus registros siguen
  existiendo en el Developer Console (no se borraron, solo se desinstalaron del site).
- Se reviso tambien `portal-ia-sdlc` (id `ae8f2d77-...`): ya no estaba instalada en ningun site, sin accion.
- **Incidente critico detectado y resuelto:** durante la limpieza anterior, la app real de `bkt-jira-triggers`
  (Console: `trigger-incidencias-jira-demo`, id `1130f0bf-...`) se desinstalo por accidente del site (causa exacta
  no determinada). Se detecto porque el ticket `BFC-6` no genero ninguna llamada a ngrok ni entrada en Forge logs.
  Reinstalada con `forge install -e development -p Jira -s pablodefranchi.atlassian.net --confirm-scopes
  --non-interactive` (nueva instalacion `809bce48-...`, version 26). Pendiente: renombrarla a `bkt-jira-triggers`
  en el Developer Console (bloqueado por un problema de cuenta del navegador de automatizacion en
  `developer.atlassian.com`/`admin.atlassian.com`, distinta de la que funciona en Jira; queda como accion manual).
- **Flujo E2E re-validado de punta a punta con el ticket real `BFC-7`** ("Hola mundo") tras la reinstalacion:
  ngrok `POST /api/v1/issues` -> `201`; Forge logs `jira.event.received` -> `jira.contract.payload.built`
  (`contractValid:true`) -> `jira.integration.response` (`status 201`, `ticketsSucceeded:1`,
  `orchestratorDispatched:true`); Mongo `executions` (`initiatedBy: bkt-jira-triggers`,
  `successIntegration/successOrchestrator: true`), `itsm_tickets` y `tickets` correctos; `agent-runtime` dispatch
  `status=200` con el mismo `correlationId` que Forge; `bkt-cortex-proxy-llm` `chat/completions` -> `200`, modelo
  `gpt-5.2-nextai`. Sin duplicados.
- Prueba adicional del tramo core (sin Jira) reproducida por PowerShell contra `bkt-integration-service` local
  (equivalente a la request 02 de la coleccion Postman), leyendo la API key en memoria desde
  `.env.local-e2e` sin imprimirla nunca; `201`, `successIntegration: true`, verificado en Mongo.
- `graphify update .` (sin LLM), segunda vez en el dia: 4039 nodos, 7358 aristas, 395 comunidades
  (antes 4016/7345/398).

### Added — 2026-09-27: flujo E2E validado en real con BFC
- Adaptador `POST /api/v1/orchestrator/dispatch` en `agent-runtime` (controller/router/schema/model/service nuevos)
  que resuelve el `rol` recibido de integration-service contra la coleccion `agents` y ejecuta el chat correspondiente.
  Cierra el riesgo R8 (contrato de dispatch), antes bloqueante.
- Switch `CORTEX_PROXY_ENABLED` en `agent-runtime/src/providers/azure_openai.py`: permite enrutar el LLM por
  `bkt-cortex-proxy-llm` (Chat Completions, `stream=false`) en vez de Azure OpenAI directo (Responses API), con
  rollback inmediato apagando la variable.
- `bkt-jira-triggers`: filtro reescrito de `DTJF` a **BFC** unico, evento `updated` retirado (solo `created`),
  `onError: IGNORE_AND_LOG`, egress `*.ngrok-free.dev`. Cambios reflejados en manifest, handler, tests y demo local.
- `bkt-cortex-proxy-llm` levantado en local mediante `.env` + `docker-compose.override.yml` **externos al repo**
  (red `bkt-agentic-ticketing-network`, puerto solo en `127.0.0.1:8010`), sin tocar el compose versionado.
- **Prueba real cerrada:** ticket `BFC-4` recorrio Jira BFC -> `bkt-jira-triggers` -> `bkt-integration-service`
  (`201`) -> Mongo (`executions` 13->14, `tickets`/`itsm_tickets` 9->10) -> `agent-runtime` (dispatch `200`) ->
  `bkt-cortex-proxy-llm` -> Azure OpenAI, sin duplicados y con trazabilidad por `X-Request-Id` de punta a punta.
- `graphify update .` (sin LLM): 4016 nodos, 7345 aristas, 398 comunidades (antes 3865/7903/241); curado previo
  respaldado en `graphify-out/2026-09-27/`.
- `HANDOFF.md`, `README.md` y `CLAUDE.md` reescritos para reflejar el estado real (ver secciones nuevas de HANDOFF:
  adaptador de dispatch, puerta cortex, estado del agente publicador, correcciones pendientes en los documentos de
  demo de `contexto_para_proyectos/`).

### Findings (documentados, sin corregir)
- `bkt-integration-service`: el `.git` esta roto (`fatal: bad object HEAD`); no se puede fiar `git status`/`log`
  ni commitear ahi sin re-clonar. Nuevo, mas grave que el problema de rutas largas ya conocido.
- `bkt-jira-forge` **no es una entrada previa al trigger**: es una segunda app Forge independiente con su propio
  boton manual de envio a integration-service, egress distinto (`.ngrok-free.app`) y frontend mayormente en mock.
  Los documentos de `contexto_para_proyectos/` sugerian lo contrario; corregido en `HANDOFF.md` seccion 4.
- El agente publicador (`agentic-publisher-application`) **no esta activo**: solo aparece en un fixture de tests
  antiguo y en los documentos de demo. Estos ultimos lo describian como "integrado", lo cual es optimista
  (ver HANDOFF seccion 5c).
- `bkt-cortex-proxy-llm`: `config.py` exige `DEFAULT_LLM_SCORE_MODEL` sin default y el `docker-compose.yaml`
  original no la define (no arranca tal cual); sin autenticacion real pese a declarar `PROXY_API_KEY`; su
  anonimizacion de PII quita las tildes del texto (conserva la `ñ`); su modo streaming no emite SSE real. R1
  (secretos inline en el compose de cortex) sigue sin rotar.
- Documentos `contexto_para_proyectos/Pruebas_manuales_flujo_E2E_BFC_trigger.md` y
  `Como_funciona_bkt_jira_triggers_en_el_flujo.md`: revisados por 6 subagentes en paralelo; tienen comandos
  PowerShell que fallan (API de ngrok mal modelada) o que imprimirian una API key en pantalla. Correcciones
  detalladas y aun sin aplicar en HANDOFF seccion 13.

### Findings — sesion tarde 2026-09-27 (limpieza de apps + incidente trigger)
- El script PowerShell de `Pruebas_manuales_flujo_E2E_BFC_trigger.md` que busca `ERROR` en los logs de
  `bkt-integration-service` (`ticketsFailed.*[1-9]|ERROR`) da falso positivo: los codigos de color ANSI del log
  de Docker (`[35m`, `[39m`) contienen digitos que matchean `[1-9]`. Pendiente de correccion en el doc (anadir a
  HANDOFF seccion 13).
- El schema real de la coleccion `itsm_tickets` anida los campos bajo `content.fields.*` (p. ej.
  `content.fields.summary`), no bajo `fields.*` directamente como sugiere el doc de pruebas manuales.
- El navegador de automatizacion (Claude in Chrome) resuelve de forma inconsistente `developer.atlassian.com` y
  `admin.atlassian.com` a una cuenta Atlassian distinta de la de Jira en pestañas nuevas; bloqueo repetido para
  el rename de la app del trigger, sin workaround encontrado en esta sesion.
- El clasificador de seguridad de Auto Mode bloquea escrituras directas a Jira (crear tickets, escribir en
  formularios de `admin.atlassian.com`) aunque el usuario ya haya autorizado la accion en el chat; requiere que
  el usuario la ejecute el mismo en el navegador.

### Not changed
- Ningun deploy adicional salvo el ya autorizado del trigger (`forge deploy`/`forge variables set` para BFC,
  documentado en HANDOFF); ninguna escritura en Jira mas alla de crear los tickets de prueba `BFC-3` (quedo sin
  procesar por un 401, no editado), `BFC-4` (procesado con exito, no editado), `BFC-6` (creado antes de reinstalar
  el trigger, sin procesar, no editado) y `BFC-7` (procesado con exito, no editado). Ningun `.env` real leido ni
  reproducido; ninguna credencial impresa en estos documentos. Los registros de las 3 apps Forge desinstaladas
  siguen existiendo en el Developer Console (solo se quito su instalacion del site, no se borraron).
