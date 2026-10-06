## Why

Necesitamos dejar documentada la integracion Jira -> Mongo -> Agentes como una capacidad clara y verificable, porque el flujo ya no es solo "recibir un ticket": ahora conserva el original, lo traduce con mappings, notifica al orquestador y debe poder demostrarse de forma sencilla con Postman y MongoDB.

Además, hay cambios de contrato que conviene dejar trazados, como aceptar un solo ticket por llamada y alinear el naming traducido con Jira, incluida la renombrada de `statusSp` a `status`.

## What Changes

- **BREAKING**: el payload traducido deja de usar `statusSp` y pasa a usar `status`.
- Se formaliza la entrada de un solo ticket por `POST /api/v1/issues`.
- El ticket Jira se guarda primero en bruto en Mongo y después se traduce mediante mappings.
- El resultado traducido se guarda en la coleccion `tickets`.
- Se registra la ejecucion del flujo y la notificacion al orquestador en `executions`.
- Se documenta la demo manual con Postman y consultas directas en MongoDB for VS Code.
- Se deja constancia del flujo de agentes y de la trazabilidad necesaria para explicar el comportamiento al equipo.

## Capabilities

### New Capabilities
- `jira-mongo-agentes`: ingesta de un ticket Jira, persistencia en bruto, traduccion por mappings, almacenamiento del ticket traducido y notificacion al orquestador con trazabilidad.

### Modified Capabilities
- Ninguna.

## Impact

- `src/controllers/issue.controller.ts`
- `src/services/issue.service.ts`
- `src/services/orchestrator.service.ts`
- `src/utils/issue.util.ts`
- `src/models/ITSMTicket.model.ts`
- `src/models/Ticket.model.ts`
- `src/models/Execution.model.ts`
- `src/models/Mapping.model.ts`
- `src/__tests__/*`
- guias operativas locales de demostracion y prueba manual
- Datos de ejemplo en Mongo y colecciones `itsm_tickets`, `tickets`, `mappings`, `executions`.
