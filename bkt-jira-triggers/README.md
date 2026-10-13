# Demo de triggers con Jira Forge

Proyecto independiente de `integration-service` para demostrar como Jira Forge recibe eventos de Jira, construye un payload compatible con el servicio de integracion y mantiene una traza segura del flujo.

El `manifest.yml` versionado permite como unico egress `*.ngrok-free.dev` (tunel de desarrollo hacia `integration-service`). La salida solo funciona cuando las variables de ejecucion de Forge estan configuradas y desplegadas; sin ellas la app no llama a ningun servicio.

## Estado

| Area | Estado |
|---|---|
| Implementacion local | Completa |
| Validaciones | `typecheck`, `lint`, `forge lint` y tests automatizados |
| Trigger Jira real | Proyecto `BFC`, solo altas de ticket (`created`) |
| Lectura del ticket completo | Por REST (`src/jira-client.ts`): adjuntos, descripcion, prioridad, componentes y responsable |
| Envio a `integration-service` | Verificado puntualmente durante la demo |
| Estado permanente | Egress versionado para túnel ngrok de desarrollo |

## Flujo implementado

```text
Jira
  -> Forge trigger
  -> saneado del evento
  -> filtro de proyecto y tipo de evento
  -> lectura del ticket completo por REST (si falla, se sigue con lo del evento)
  -> construccion del payload
  -> envio opcional a integration-service
  -> respuesta clasificada
  -> traza por correlationId
```

Para la primera prueba E2E real, el trigger escucha solo altas de tickets:

```text
avi:jira:created:issue
```

Los eventos `updated` quedan fuera para evitar dobles ejecuciones durante la
prueba controlada.

Y filtra por proyecto:

```text
event.issue.fields?.project.key == 'BFC'
```

El handler repite la guardia (`jira.event.skipped` con `UNSUPPORTED_EVENT_TYPE` o `PROJECT_NOT_ALLOWED`).

## Lectura del ticket por REST

El evento `created` de Jira no trae descripcion, prioridad, componentes, responsable ni adjuntos. Por eso el
handler lee el ticket con `GET /rest/api/3/issue/{key}?fields=...` (`asApp().requestJira`, ambito
`read:jira-work`) y lo mezcla con el evento antes de construir el payload. La traza lo indica con
`issueSource: "jira-rest"` (o `"event"` si la lectura fallo) y `jiraRead`. Del adjunto solo viajan metadatos
(`id`, `filename`, `mimeType`, `size` y la URL de descarga en `content`); el servicio descarga y convierte el fichero.
La traza nunca incluye nombres de fichero, URLs ni datos personales: solo contadores (`attachmentCount`,
`componentCount`, `descriptionLength`, `assigneePresent`).

## Contrato con integration-service

Cuando la demo activa el envio, Forge llama a:

```text
POST {INTEGRATION_SERVICE_BASE_URL}/api/v1/issues
```

El payload contiene exactamente una incidencia:

```json
{
  "initiatedBy": "bkt-jira-triggers",
  "issues": [
    {
      "key": "DAT-XX",
      "fields": {
        "summary": "titulo del ticket",
        "project": {
          "key": "DAT"
        },
        "status": {
          "name": "En curso"
        },
        "description": "texto plano (el ADF de Jira se aplana)",
        "components": [{ "id": "10100", "name": "Pagos" }],
        "assignee": { "accountId": "...", "displayName": "..." },
        "attachment": [
          { "id": "10040", "filename": "informe.pdf", "mimeType": "application/pdf", "size": 1435, "content": "https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/attachment/content/10040" }
        ]
      }
    }
  ]
}
```

`description`, `components`, `assignee` y `attachment` solo aparecen si el ticket los tiene (maximo 20 adjuntos;
se descartan los que no tienen nombre o una URL http(s) valida).

El envio solo se considera correcto si el servicio responde con exito HTTP y confirma exito funcional:

```text
HTTP 201
data.summary.successIntegration = true
data.tickets[0].success = true
```

## Configuracion Forge para llamar a integration-service

El envio al servicio se activa exclusivamente mediante variables de ejecucion de Forge. No hay claves ni URLs reales en el codigo, en el manifiesto ni en `.env.example`.

Variables necesarias:

| Variable | Uso | Validacion aplicada |
|---|---|---|
| `INTEGRATION_SERVICE_BASE_URL` | URL base del servicio, sin `/api/v1/issues` | Debe ser HTTPS, no puede traer credenciales, no puede duplicar esquema y no puede incluir path/query/hash |
| `INTEGRATION_SERVICE_API_KEY` | Credencial esperada por el servicio | Obligatoria, cifrada en Forge y distinta del marcador de ejemplo |
| `INTEGRATION_SERVICE_API_KEY_HEADER` | Nombre de la cabecera de autenticacion | Opcional; por defecto `X-API-KEY`; si se informa debe ser un nombre de cabecera HTTP valido |

Ejemplo de configuracion de desarrollo:

```powershell
forge variables set --encrypt INTEGRATION_SERVICE_API_KEY "<valor-real>"
forge variables set INTEGRATION_SERVICE_BASE_URL "https://<subdominio>.ngrok-free.dev"
forge variables set INTEGRATION_SERVICE_API_KEY_HEADER "X-API-KEY"
forge deploy
forge variables list --environment development
```

La URL es la base del servicio. No debe incluir el endpoint completo:

```text
Correcto:   https://demo.ngrok-free.dev
Incorrecto: https://demo.ngrok-free.dev/api/v1/issues
Incorrecto: https://https://demo.ngrok-free.dev
Incorrecto: http://demo.ngrok-free.dev
```

Si falta la URL o la credencial, la app no intenta llamar al servicio y registra:

```text
MISSING_RUNTIME_CONFIG
```

Si la configuracion existe pero no es segura o no es valida, tambien falla cerrado y no realiza la peticion HTTP:

| Codigo | Motivo registrado |
|---|---|
| `INVALID_INTEGRATION_SERVICE_BASE_URL` | `not_a_url`, `duplicated_scheme`, `not_https`, `contains_endpoint_path` o `contains_credentials` |
| `INVALID_API_KEY_HEADER` | `invalid_header_name` |
| `PLACEHOLDER_API_KEY` | `placeholder_api_key` |

Avisos operativos:

- **Las variables de Forge solo se aplican al desplegar.** Tras `forge variables set`, ejecutar
  `forge deploy` y comprobar con `forge variables list`.
- **La URL lleva `https://` una sola vez.** Con `https://https://...` Forge lee el host como `https`, lo bloquea
  (egress no permitido) y devuelve un `403` sin llegar a salir a la red.

Cambiar los dominios de `permissions.external.fetch` en `manifest.yml` provoca una actualizacion de version mayor y
`forge deploy` pide `--approve MAJOR_VERSION_RULE`.

Cuando la configuracion es invalida, `jira.integration.response` incluye `configIssue` con un motivo corto y seguro.
Cuando el servicio responde con un error HTTP, incluye `diagnostic` (host, cabeceras `server`, `cf-ray` y
`ngrok-error-code`, y un trozo corto del cuerpo) para saber quien respondio, sin datos del ticket.

## Seguridad y trazabilidad

La app no registra el evento crudo completo. La traza usa una lista de campos permitidos y evita exponer datos sensibles.

Por cada invocacion se registran cuatro pasos con el mismo `correlationId`:

| Paso | Que indica |
|---|---|
| `jira.event.received` | Forge recibio el evento saneado |
| `jira.event.shape` | Campos reales que llegaron desde Jira |
| `jira.contract.payload.built` | Payload construido y validado |
| `jira.integration.response` | Resultado del envio al servicio |

El `correlationId` viaja tambien como cabecera:

```text
X-Request-Id
```

Asi se puede seguir una invocacion desde Forge hasta `integration-service`.

## Comandos principales

Instalar dependencias:

```powershell
npm install
```

Validar localmente:

```powershell
npm run typecheck
npm run lint
npm test
npm run forge:lint
```

Ejecutar demo local:

```powershell
npm run demo -- all
```

Leer logs de Forge formateados:

```powershell
npm run logs -- --since 120m
```

## Carpeta scripts

La carpeta `scripts/` es necesaria y forma parte del repositorio:

| Archivo | Uso |
|---|---|
| `scripts/demo-local.js` | Ejecuta `npm run demo` |
| `scripts/format-logs.js` | Ejecuta `npm run logs` y ordena la salida de Forge |

## Estado de reposo tras la demo

Para dejar la integracion inactiva al cerrar la demo basta con quitar las variables de Forge de
`integration-service` y volver a desplegar (el egress `*.ngrok-free.dev` del manifest puede quedarse: quitarlo
exige `forge deploy --approve MAJOR_VERSION_RULE`):

```text
Forge sin variables activas de integration-service
```

Comprobacion:

```powershell
forge variables list --environment development
```

Salida esperada:

```text
There are no variables in the development environment.

Use forge variables set to create a variable.
```

## Alcance

El proyecto demuestra el flujo tecnico entre Jira Forge e `integration-service` en un entorno de prueba.

No modifica `integration-service`: solo le envia el payload. La conversion de los adjuntos a Markdown
(PDF, Excel, PowerPoint, Word, JSON, Markdown y texto) ocurre en el servicio; aqui solo se leen y pasan sus metadatos.
