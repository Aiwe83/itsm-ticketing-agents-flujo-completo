# INTEGRATION-SERVICE

Servicio Node.js con Express, TypeScript y MongoDB para recibir tickets ITSM (Jira/TC), persistir
el payload original, traducirlo mediante mappings configurables y continuar el flujo operativo
con trazabilidad de extremo a extremo.

## Tabla de contenidos

- [Objetivo](#objetivo)
- [Flujo](#flujo)
- [Adjuntos convertidos a Markdown](#adjuntos-convertidos-a-markdown)
- [API](#api)
- [Seguridad](#seguridad)
- [Puesta en marcha](#puesta-en-marcha)
- [Comandos utiles](#comandos-utiles)
- [Contrato OpenAPI](#contrato-openapi)
- [Catalogo de mappings](#catalogo-de-mappings)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Stack tecnico](#stack-tecnico)
- [Contribucion](#contribucion)

## Objetivo

El proyecto actua como capa de integracion entre la entrada externa del ticket y el modelo interno
de trabajo. Su responsabilidad principal es:

- recibir un ticket por peticion;
- guardar el ticket bruto sin perder informacion;
- generar una version normalizada a partir de mappings configurables;
- convertir a Markdown los adjuntos compatibles (Word, PDF, Excel, PowerPoint, JSON, Markdown y texto);
- dejar trazabilidad completa de la ejecucion;
- notificar al siguiente componente del flujo sin bloquear la recepcion.

## Flujo

1. `POST /api/v1/issues` recibe exactamente un ticket por peticion.
2. El ticket bruto se guarda en `itsm_tickets`, etiquetado con `meshId`.
3. El servicio resuelve los mappings activos en MongoDB para ese `meshId`.
4. El ticket traducido se guarda en `tickets`, con el mismo `_id` que el bruto (relacion 1:1).
5. En segundo plano, sin bloquear la respuesta: los adjuntos compatibles se transforman a
   `content.attachedDocuments` y se notifica al orquestador.
6. Cada ejecucion queda registrada en `executions`, incluyendo que identificadores se
   despacharon realmente al orquestador (`dispatchedExecutionIds`).

## Adjuntos convertidos a Markdown

Cada adjunto del ticket (`fields.attachment[]`, con la URL de descarga en `content`) se descarga de Jira y se
guarda en `tickets.content.attachedDocuments[]` como `{ filename, markdown, skippedReason? }`.

| Formato | Extension | Resultado |
|---|---|---|
| Texto | `txt`, `log`, `csv`, `xml`, `htm`, `html`, `n43`, `n34`, `mt940` | Tal cual |
| Word | `docx`, `dotx`, `odt` | Markdown, con las tablas conservadas (mammoth + turndown) |
| PDF | `pdf` | `## Pagina N` con el texto de cada pagina (maximo 200); sin texto (escaneado) no se convierte |
| Excel | `xlsx` | `## Hoja: nombre` y una tabla por hoja (maximo 20 hojas, 1000 filas y 50 columnas) |
| PowerPoint | `pptx` | `## Diapositiva N` con su texto (maximo 200) |
| JSON | `json` | Con sangria, dentro de un bloque de codigo |
| Markdown | `md`, `markdown` | Tal cual |

Cada conversor vive en `src/services/attachment-converters/` y se registra en `registry.ts`; para anadir un
formato basta un conversor nuevo y una linea en el registro. Los conversores marcados `isolated` (PDF y Excel)
se ejecutan en `conversion.worker.ts` a traves de `worker-runner.ts`.

Variables de entorno relacionadas (solo nombres; los valores van en `.env`):

| Variable | Obligatoria | Efecto |
|---|---|---|
| `ATTACHMENT_BYTES_LIMIT` | No (por defecto 4 MiB) | Tamano maximo de un adjunto descargado; por encima, `too_large` |
| `JIRA_BASE_URL`, `JIRA_USER`, `JIRA_PASSWORD` | Solo para descargar adjuntos | Credenciales de la API de Jira Cloud; sin ellas los adjuntos se devuelven como `download_failed` |
| `ATTACHMENT_CONVERT_CONCURRENCY` | No (por defecto 2) | Conversiones PDF/Excel simultaneas en workers; el resto espera turno |

Reglas de seguridad (el adjunto es entrada no confiable):

- El tipo real se comprueba por la firma del fichero (`%PDF`, zip con `xl/`, `ppt/` o `word/`), no solo por la
  extension. Un fichero que no coincide con su extension se omite. Sin extension se convierte solo si la firma
  es de un formato soportado; las extensiones en mayusculas valen.
- Topes: bytes descargados (`ATTACHMENT_BYTES_LIMIT`), bytes descomprimidos de xlsx/pptx/docx (leidos del
  directorio central del zip antes de abrirlos), 15 s por conversion y 1.000.000 de caracteres de salida
  (se trunca con una marca `[... contenido truncado ...]`).
- Un fichero corrupto, con contrasena, escaneado o de tipo no soportado se devuelve con
  `skippedReason: "unsupported"`; uno desproporcionado, `too_large`; una descarga fallida, `download_failed`.
  Nunca rompe el resto del ticket.
- Aislamiento: los conversores de PDF y Excel (los de mayor riesgo) corren en un `worker_thread` con limite de
  memoria (512 MB) y se matan al vencer el timeout; un fichero hostil no bloquea ni tumba el servicio. Se
  ejecutan como maximo 2 a la vez (`ATTACHMENT_CONVERT_CONCURRENCY`). Memoria agotada -> `too_large`; timeout o
  error -> `unsupported`. No se ejecutan macros ni contenido activo.

## API

| Metodo | Ruta | Autenticacion | Descripcion |
|---|---|---|---|
| `GET` | `/health` | Ninguna (sonda publica) | Liveness/readiness. `200` si Mongo esta conectado, `503` si no. |
| `GET` | `/api/v1` | `X-API-KEY` | Informacion basica del servicio. |
| `POST` | `/api/v1/issues` | `X-API-KEY` | Ingesta de un ticket Jira/TC. |

Contrato completo, ejemplos y esquemas de error en [`openapi.yaml`](./openapi.yaml).

## Seguridad

- `GET /api/v1` y `POST /api/v1/issues` exigen la cabecera `X-API-KEY` (nombre configurable via
  `API_KEY_HEADER`). Sin ella, o con un valor incorrecto, responden `401` con el mismo mensaje en
  ambos casos, para no revelar cual de los dos fallo.
- `API_KEY` es una variable de entorno obligatoria: el servicio no arranca sin ella (fail-closed).
- `GET /health` no requiere autenticacion, a proposito: es la sonda de liveness/readiness que usa
  docker-compose (y cualquier orquestador) para decidir si el contenedor esta vivo.
- El contrato publicado (`openapi.yaml`) solo anuncia `https` como protocolo de transporte. El
  stack local de `docker-compose.yaml` sigue sirviendo en `http://localhost:8000` sin TLS: es un
  detalle del despliegue local, no algo que el contrato publicado deba prometer.
- El detalle tecnico de los errores (`stack`) nunca sale en la respuesta HTTP; solo en logs.
- Los ficheros `.env` y `.env.test` no deben versionarse ni usarse como documentacion.

## Puesta en marcha

```bash
cp .env.example .env
# edita .env: pon un API_KEY propio y ajusta el resto de variables a tu entorno

pnpm install
docker compose up -d --build
pnpm dev
```

El servicio no arranca si falta cualquier variable obligatoria del `.env` (incluida `API_KEY`) —
la validacion de entorno falla con un mensaje explicito por variable.

## Comandos utiles

| Comando | Proposito |
|---|---|
| `pnpm dev` | Arranque en modo desarrollo |
| `pnpm build` | Build de produccion |
| `pnpm start` | Arranque del build compilado |
| `pnpm test` | Suite de tests (Jest + Supertest) |
| `pnpm test:e2e` | Solo la prueba E2E de adjuntos: un Jira falso local sirve 10 ficheros (con autenticación y una redirección) y se comprueba en Mongo lo que guarda el servicio. Sin Docker ni ngrok. Con `E2E_HOSTILE=1` añade el caso del Excel hostil (~10 s) |
| `pnpm lint` | Lint (ESLint 9) |
| `pnpm format` | Formato (Prettier) |
| `pnpm typecheck` | Chequeo de tipos sin emitir |
| `pnpm db:ensure-indexes` | Crea/verifica los indices de MongoDB |
| `pnpm db:migrate-mesh:dry-run` | Simulacro de migracion de `meshId` |
| `pnpm db:migrate-mesh:apply` | Aplica la migracion de `meshId` |
| `pnpm mappings:dry-run` | Compara `catalog.json` contra la coleccion `mappings` real (solo lectura) |
| `pnpm mappings:apply -- --confirm-version=<x>` | Aplica el catalogo a `mappings` (requiere version exacta) |
| `pnpm openapi:generate` | Regenera `openapi.yaml` desde los schemas Zod |
| `pnpm openapi:check` | Verifica que `openapi.yaml` esta en sync (no escribe) |
| `pnpm openapi:lint` | Lint del contrato OpenAPI (Redocly) |

## Contrato OpenAPI

`openapi.yaml` documenta los endpoints reales del servicio y se genera a partir de los schemas Zod
del propio codigo (`src/openapi/{schemas,examples,document}.ts`), reutilizando cuando aplica los
mismos schemas que validan las peticiones en runtime (`src/validators/`).

**No se edita a mano.** Cualquier cambio de contrato sale de la fuente tipada y se regenera:

```bash
pnpm openapi:generate && pnpm openapi:lint && pnpm openapi:check
```

## Catalogo de mappings

La documentacion versionada del catalogo Jira -> modelo interno vive en `docs/mappings/`.

Piezas clave:

- `docs/mappings/README.md`
- `docs/mappings/contexts/pilot-local/catalog.json`
- `docs/mappings/contexts/pilot-local/catalog.md`
- `docs/mappings/contexts/pilot-local/basic-data-matrix.md`
- `docs/mappings/Pruebas_manuales_puntos_integration_service_bkt.md` — demo paso a paso del flujo real
- `docs/mappings/Cantidad_campos_pendientes_implementacion.md` — estado real de implementacion
- `docs/mappings/README.md` (seccion "Cuantos campos estan realmente cargados en Mongo") — cuantos
  mappings estan operativos de verdad frente a documentados/pendientes/excluidos/bloqueados
- `docs/mappings/README.md` (seccion "Pipeline de promocion: `catalog.json` -> MongoDB") — como
  sincronizar el catalogo con la coleccion `mappings` real de forma segura

## Estructura del repositorio

```text
src/
  config/        Entorno, base de datos, logger
  controllers/   Entrada HTTP
  errors/        Jerarquia de errores tipados
  middlewares/   Auth, validacion, logging, manejo de errores
  models/        Esquemas Mongoose
  repositories/  Acceso a datos
  routes/        Definicion de rutas
  scripts/       Utilidades de mantenimiento (indices, migraciones, generador OpenAPI)
  services/      Logica de negocio (ingesta, adjuntos, orquestador)
    attachment-converters/  Conversores a Markdown (registro, utilidades, runner de workers)
  types/         Tipos compartidos
  utils/         Funciones auxiliares
  validators/    Schemas Zod de validacion de entrada
  __tests__/     Tests unitarios e integracion
docs/            Documentacion versionada (mappings)
openspec/        Especificacion y trazabilidad de cambios (OpenSpec)
```

## Stack tecnico

- TypeScript estricto
- Validacion con Zod
- Persistencia con Mongoose (MongoDB)
- Logging estructurado con Pino
- Testing con Jest y Supertest
- Formato con Prettier
- Lint con ESLint 9

## Contribucion

Antes de commitear:

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test`
4. `pnpm build`
5. Si cambian schemas o el contrato HTTP, regenera `openapi.yaml` (ver
   [Contrato OpenAPI](#contrato-openapi)).
