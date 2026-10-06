# bkt-integration-service

Servicio de integracion del flujo ITSM Ticketing Agents, implementado en Python
con Litestar y Dishka. Esta version sustituye la implementacion TypeScript en la
rama de migracion y conserva el contrato funcional principal del servicio:
recepcion de tickets, validacion, persistencia en MongoDB, transformacion por
mappings y despacho hacia `agent-runtime`.

## Objetivo

El servicio actua como frontera entre la entrada de tickets y la malla agentica.
Su responsabilidad es aceptar un ticket, guardar el payload original, generar la
representacion interna mediante mappings configurables y dejar registrada la
ejecucion completa para trazabilidad operativa.

Responsabilidades principales:

- Exponer `GET /health` como sonda tecnica.
- Exponer `POST /api/v1/issues` con autenticacion por API key.
- Validar que cada peticion contiene exactamente un ticket.
- Persistir el ticket bruto en `itsm_tickets`.
- Aplicar mappings de MongoDB para construir el ticket normalizado.
- Persistir el ticket transformado en `tickets`.
- Registrar ejecuciones en `executions`.
- Lanzar el dispatch hacia `agent-runtime` sin bloquear la respuesta HTTP.

## Estado de la migracion

La migracion cubre el camino principal usado por `bkt-jira-triggers`:

```text
Jira / Forge trigger
  -> bkt-integration-service
  -> MongoDB
  -> agent-runtime
  -> bkt-cortex-proxy-llm
```

Queda fuera de esta primera version el enriquecimiento de adjuntos de Jira usado
por caminos secundarios. El payload puede conservar adjuntos en el ticket bruto,
pero no se procesan como documentos enriquecidos dentro de `content.attachedDocuments`.

## Arquitectura

```text
bkt_integration_service_python/
  api/             Rutas HTTP y validacion de entrada
  clients/         Cliente hacia agent-runtime
  core/            Configuracion, seguridad, logging, errores y DI
  domain/          Modelos de dominio y motor de mappings
  repositories/    Acceso a MongoDB
  services/        Orquestacion de ingesta, persistencia y dispatch
tests/
  unit/            Tests unitarios de validacion, mappings y seguridad
```

Componentes principales:

- **Litestar**: framework HTTP.
- **Dishka**: inyeccion de dependencias.
- **PyMongo async**: acceso a MongoDB.
- **httpx**: cliente HTTP para `agent-runtime`.
- **pytest**: suite de validacion.

## Configuracion

La plantilla de variables esta en `.env.example`. Para entorno local:

```powershell
Copy-Item .env.example .env
```

Variables obligatorias para arranque:

- `MONGODB_USERNAME`
- `MONGODB_PASSWORD`
- `MONGODB_HOST`
- `MONGODB_DATABASE`
- `API_KEY`
- `ORCHESTRATOR_BASE_URL`
- `ORCHESTRATOR_ENDPOINT`
- `MESH_ID`
- `ORIGINAL_TICKET_COLLECTION_NAME`
- `PROCESSED_TICKET_COLLECTION_NAME`
- `EXECUTIONS_COLLECTION_NAME`
- `MAPPINGS_COLLECTION_NAME`

No versionar `.env` ni valores reales de credenciales.

## Arranque local sin Docker

Usar Python 3.13. El proyecto declara `>=3.13,<3.14`.

En rutas OneDrive largas se recomienda crear el entorno virtual fuera del
directorio del proyecto:

```powershell
$env:UV_PROJECT_ENVIRONMENT = "C:\pyenvs\bkt_integration_service_python"
uv sync --locked --python "C:\Users\0021260\AppData\Local\Programs\Python\Python313\python.exe"
uv run litestar --app bkt_integration_service_python.main:app run --host 127.0.0.1 --port 8000
```

## Arranque con Docker Compose

El stack Docker esta aislado para convivir con el servicio TypeScript durante la
migracion:

- API Python: `http://localhost:8002`
- Mongo Python: `localhost:27019`
- Contenedor API: `bkt-integration-service-python`
- Contenedor Mongo: `bkt-integration-service-python-mongo`

Comandos:

```powershell
docker compose config
docker compose build
docker compose up -d
```

Healthcheck:

```powershell
Invoke-RestMethod http://localhost:8002/health | ConvertTo-Json -Depth 5
```

Respuesta esperada con Mongo conectado:

```json
{
  "message": "OK",
  "environment": "local",
  "database": "connected"
}
```

## API

### `GET /health`

Sonda publica de estado del servicio.

- `200`: MongoDB conectado.
- `503`: MongoDB no disponible.

### `POST /api/v1/issues`

Ingesta de tickets ITSM/Jira. Requiere cabecera `X-API-KEY`.

Forma minima:

```json
{
  "initiatedBy": "bkt-jira-triggers",
  "issues": [
    {
      "id": "70010",
      "key": "DAT-3",
      "fields": {
        "summary": "Consulta tecnica",
        "issuetype": { "name": "Consulta" },
        "status": { "name": "Recibida" }
      }
    }
  ]
}
```

Respuesta esperada:

```json
{
  "success": true,
  "message": "Issues accepted",
  "data": {
    "summary": {
      "ticketsProcessed": 1,
      "ticketsSucceeded": 1,
      "ticketsFailed": 0,
      "successIntegration": true,
      "orchestratorDispatched": true
    }
  }
}
```

## Mappings

El servicio lee los mappings desde la coleccion `mappings`, filtrando por
`MESH_ID`. Si el `meshId` de los mappings no coincide con el `MESH_ID` del
servicio, la ingesta puede responder correctamente pero el `transformedIssue`
quedara sin campos de negocio transformados.

Colecciones usadas:

- `mappings`: catalogo de transformacion.
- `itsm_tickets`: ticket bruto recibido.
- `tickets`: ticket normalizado.
- `executions`: trazabilidad de la ejecucion y del dispatch.

Para validar con mappings reales, cargar primero el catalogo en MongoDB y
asegurar que `MESH_ID` coincide.

## Validacion

Instalacion reproducible:

```powershell
$env:UV_PROJECT_ENVIRONMENT = "C:\pyenvs\bkt_integration_service_python"
uv sync --locked --python "C:\Users\0021260\AppData\Local\Programs\Python\Python313\python.exe"
```

Tests:

```powershell
uv run python -m pytest tests -v
```

Resultado esperado:

```text
30 passed
```

Los tests cubren:

- Validacion del contrato de entrada.
- Comparacion segura de API key.
- Motor de mappings, incluyendo rutas anidadas, arrays, campos obligatorios y
  transformadores.

## Validacion E2E local

1. Arrancar Docker Compose.
2. Cargar mappings reales en la coleccion `mappings`.
3. Confirmar que `MESH_ID` coincide con el `meshId` del catalogo.
4. Ejecutar `GET /health`.
5. Ejecutar `POST /api/v1/issues`.
6. Verificar MongoDB:
   - `itsm_tickets` contiene el ticket bruto.
   - `tickets` contiene el ticket transformado.
   - `executions` contiene la ejecucion.
   - `successIntegration` queda en `true`.
   - `successOrchestrator` refleja el resultado real del dispatch.

## Decisiones tecnicas

- El dispatch al orquestador es fire-and-forget: la respuesta `201` confirma que
  el dispatch fue lanzado, no necesariamente que haya terminado.
- Las dependencias quedan fijadas en `uv.lock` para evitar incompatibilidades con
  versiones nuevas de Litestar, pytest, multidict o click.
- El Dockerfile usa `uv sync --locked` para que el contenedor instale exactamente
  las versiones validadas.
- El servicio Python usa puertos locales distintos al servicio TypeScript para
  permitir comparacion paralela durante la migracion.

## Limitaciones conocidas

- No procesa adjuntos de Jira como documentos enriquecidos en esta primera
  version.
- Las carpetas `tests/contract` y `tests/integration` existen como estructura,
  pero la cobertura automatizada actual esta en `tests/unit`.
- La comparacion formal contra TypeScript requiere ejecutar ambos servicios con
  los mismos mappings y los mismos payloads de referencia.
