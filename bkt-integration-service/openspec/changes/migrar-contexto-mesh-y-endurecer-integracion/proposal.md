## Why

El servicio expone trazas `stack` en respuestas locales, persiste el contexto mediante `tenantId`, `projectId` e `itsmId`, mezcla fechas BSON con strings ISO y utiliza nombres de base, Docker y contratos que ya no representan el modelo objetivo. El cambio debe unificar estas decisiones antes de continuar con mejoras de escalabilidad para evitar migraciones incompatibles y ambiguedades entre el ticket, la ejecucion interna y el identificador enviado al orquestador.

## What Changes

- Eliminar `stack` de todas las respuestas HTTP y conservar el diagnostico completo exclusivamente en logs estructurados y sanitizados.
- Normalizar las fechas persistidas: los campos de fecha en MongoDB, incluidos `createdAt` y `updatedAt` de mappings importados, se almacenaran como BSON `Date`; las fechas serializadas por API y logs usaran ISO 8601 UTC.
- **BREAKING** Sustituir `tenantId`, `projectId` e `itsmId` por un unico `meshId`, obtenido de la variable obligatoria `MESH_ID`, en modelos, repositorios, mappings, tickets, ejecuciones, configuracion y documentacion activa.
- **BREAKING** Cambiar el identificador determinista de bruto y traducido a `${meshId}:${ticketKey}` y mantener una correspondencia estricta 1:1 mediante el mismo `_id`.
- Cambiar el ciclo del ticket bruto para guardarlo con `persisted` y pasarlo posteriormente a `translated` o `failed`.
- **BREAKING** Sustituir el cuerpo actual del orquestador por el contrato plano `rol`, `ticket_id`, `mesh_id` y `execution_id`; `ticket_id` sera la clave Jira y `execution_id` sera el `_id` de `itsm_tickets`.
- **BREAKING** Cambiar la base de datos activa de `caf_agents` a `integration-service` y normalizar el proyecto y servicio Docker como `integration-service`, manteniendo el servicio Mongo `mongo` y el volumen existente.
- Proporcionar una migracion controlada con modos dry-run y apply que copie y transforme los datos sin borrar la base de origen.
- Actualizar los OpenSpec pendientes que dependan del contexto triple; preservar los cambios completados como historial y marcarlos como obsoletos cuando corresponda.
- No crear, modificar ni validar OpenAPI o ficheros YAML dentro de este cambio.

## Capabilities

### New Capabilities

- `secure-error-and-date-contract`: respuestas sin `stack`, logs diagnosticos sanitizados, fechas BSON `Date` en MongoDB y serializacion ISO 8601 UTC.
- `mesh-ticket-persistence`: contexto unico `meshId`, identificadores deterministas y relacion 1:1 entre ticket bruto y traducido con ciclo de estados explicito.
- `orchestrator-mesh-contract`: adaptacion del limite externo al contrato plano acordado y separacion entre identificador de ejecucion interna y `_id` del ticket persistido.
- `integration-runtime-migration`: cambio de base y nombres Docker, migracion idempotente y estrategia operativa de validacion y rollback.

### Modified Capabilities

Ninguna. `openspec/specs/` no contiene especificaciones canonicas previas; los cambios OpenSpec existentes son propuestas locales y se reconciliaran durante la aplicacion.

## Impact

- Codigo afectado: configuracion de entorno y MongoDB, middleware de errores, modelos, repositorios, servicio de issues, transformacion, orquestador, indices y scripts operativos.
- Datos afectados: `itsm_tickets`, `tickets`, `executions` y `mappings`, incluidos sus identificadores de contexto, referencias cruzadas y campos de fecha importados como string.
- Contratos afectados: cuerpo enviado al orquestador, identificadores persistidos y variables de entorno. `POST /api/v1/issues` seguira aceptando exactamente un ticket y mantendra su respuesta `201`.
- Infraestructura afectada: `.env.example`, Docker Compose normal y de depuracion, nombres visibles del servicio, documentacion activa, fixtures y pipeline de validacion.
- No existe frontend en este repositorio y no se incorpora trabajo frontend.
- No se modificaran codigo, MongoDB, Docker ni configuracion durante la fase OpenSpec; la implementacion requerira una autorizacion posterior mediante `/opsx-apply`.

