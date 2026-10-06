# 01 - Documentacion del servicio de integracion

## Objetivo del servicio

`bkt-integration-service` es la capa que recibe tickets externos, los conserva como payload bruto, los transforma al modelo interno mediante mappings configurables y deja trazabilidad de la ejecucion para que el resto del flujo pueda continuar.

Dentro del flujo completo actua entre el trigger de Jira y los componentes posteriores:

```text
Jira / Forge -> bkt-integration-service -> MongoDB -> agent-runtime
```

## Responsabilidades principales

- Recibir un ticket por peticion en `POST /api/v1/issues`.
- Validar la API key y el contrato de entrada.
- Persistir el ticket bruto sin perder informacion.
- Cargar los mappings activos desde MongoDB.
- Generar el ticket normalizado para el modelo interno.
- Procesar adjuntos compatibles y convertirlos a Markdown.
- Guardar trazabilidad de cada ejecucion.
- Notificar al orquestador sin bloquear la respuesta HTTP.

## Entrada HTTP

El endpoint principal es:

```text
POST /api/v1/issues
```

El contrato esperado tiene esta forma general:

```json
{
  "initiatedBy": "origen-del-evento",
  "issues": [
    {
      "id": "id-jira",
      "key": "BFC-XX",
      "fields": {
        "summary": "Resumen del ticket",
        "description": "Descripcion del ticket",
        "issuetype": { "name": "Consulta" },
        "status": { "name": "Recibida" },
        "priority": { "name": "Medium" },
        "attachment": []
      }
    }
  ]
}
```

El servicio acepta exactamente un ticket por peticion. Si llegan cero tickets, mas de uno o un JSON mal formado, devuelve error de validacion.

## Seguridad de entrada

- `GET /health` es publico porque funciona como sonda de salud.
- `GET /api/v1` y `POST /api/v1/issues` requieren API key.
- El nombre de la cabecera se configura con `API_KEY_HEADER`.
- El valor esperado se configura con `API_KEY`.
- El servicio no arranca si falta una variable obligatoria.
- Los errores HTTP no exponen stack trace ni detalles internos.

## Persistencia en MongoDB

El servicio trabaja principalmente con estas colecciones:

- `itsm_tickets`: guarda el ticket bruto recibido.
- `tickets`: guarda el ticket normalizado, listo para el flujo interno.
- `executions`: guarda el estado de la ejecucion y la comunicacion con el orquestador.
- `mappings`: contiene la configuracion que traduce campos de Jira al modelo interno.

La relacion importante es:

```text
ticket bruto -> ticket normalizado -> ejecucion
```

Esto permite auditar que llego, como se transformo y si se despacho al siguiente componente.

## Transformacion por mappings

Los mappings determinan como se traduce cada campo de entrada hacia el modelo interno. La documentacion versionada vive en:

```text
docs/mappings
```

La logica asociada esta principalmente en:

```text
src/services/issue.service.ts
src/utils/issue.util.ts
src/repositories/mapping.repository.ts
src/services/mapping-catalog.service.ts
```

Esta parte demuestra que el servicio no copia el payload directamente: conserva el bruto y genera una representacion normalizada.

## Adjuntos dentro del flujo

Los adjuntos son una parte del servicio, no el unico alcance. Cuando Jira envia `fields.attachment[]`, el servicio intenta descargar y convertir los formatos soportados a Markdown.

Formatos cubiertos:

- texto;
- Word;
- PDF;
- Excel;
- PowerPoint;
- JSON;
- Markdown.

Reglas relevantes:

- se valida el tipo real del fichero, no solo la extension;
- los ficheros corruptos, falsos o no soportados se omiten con motivo controlado;
- PDF y Excel se procesan aislados para evitar bloqueos;
- el resultado se guarda en `tickets.content.attachedDocuments`;
- un adjunto fallido no debe romper el procesamiento del ticket completo.

Codigo principal:

```text
src/services/attachment.service.ts
src/services/jira-attachment.fetcher.ts
src/services/attachment-converters
```

## Comunicacion con el orquestador

Despues de persistir el ticket, el servicio notifica al siguiente componente del flujo. Esa comunicacion no debe bloquear la respuesta principal del endpoint.

Codigo principal:

```text
src/services/orchestrator.service.ts
src/services/issue.service.ts
src/repositories/execution.repository.ts
```

La traza queda reflejada en `executions`, incluyendo si el despacho se ha producido correctamente o si queda registrado un fallo controlado.

## Estructura tecnica relevante

```text
src/
  config/        Entorno, MongoDB y logger
  controllers/   Entrada HTTP
  middlewares/   Seguridad, validacion, logging y errores
  models/        Modelos Mongoose
  repositories/  Acceso a MongoDB
  routes/        Rutas HTTP
  services/      Logica de negocio
  validators/    Schemas de validacion de entrada
  __tests__/     Pruebas unitarias, integracion y E2E local
```

## Que demuestra esta documentacion

- Se entiende el servicio completo, no solo la ampliacion de adjuntos.
- Se puede revisar el flujo desde la entrada HTTP hasta Mongo y el orquestador.
- Se separan claramente contrato, seguridad, transformacion, persistencia y pruebas.
- La persona que revise la tarea puede validar el proyecto sin leer todo el codigo desde cero.
