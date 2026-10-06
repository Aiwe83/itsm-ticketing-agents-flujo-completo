## Why

Los booleanos actuales no distinguen con claridad si una fase esta pendiente, fallo o se omitio, y `/health` no demuestra que el servicio este preparado para procesar tickets. Para sostener un piloto escalable se necesitan estados operativos inequívocos, trazas correlacionadas y controles automaticos que impidan degradar la calidad.

## What Changes

- Incorporar a `Execution` los estados `integrationStatus`, `attachmentStatus` y `orchestratorStatus`, con valores `pending`, `succeeded`, `failed` o `skipped`.
- Conservar temporalmente `successIntegration` y `successOrchestrator` para compatibilidad.
- Mantener `/health` como comprobacion de vida y anadir `/ready` para MongoDB, indices obligatorios y mappings minimos del contexto.
- Emitir logs estructurados con identificadores de peticion, ticket, trabajo, revision, intento, fase, duracion y error sanitizado.
- Evitar payloads completos, datos personales y secretos en logs.
- Anadir ESLint 9 con configuracion plana y aplicar Prettier sin cambios funcionales.
- Incorporar al pipeline typecheck, formato, lint, Jest con cobertura, auditoria de produccion y build Docker.
- Fijar umbrales iniciales equivalentes a la linea base y elevar sentencias a 75% y ramas a 60% al completar la outbox.
- Crear una prueba de carga reproducible con dos APIs, dos workers y 50 peticiones concurrentes.
- Mantener guias sencillas de Postman y MongoDB Compass que puedan demostrarse en dos minutos.

## Capabilities

### New Capabilities

- `pilot-operability`: estados de ejecucion, readiness, correlacion y trazabilidad segura del piloto.
- `quality-gates`: controles reproducibles de formato, calidad, pruebas, seguridad, build y carga.

### Modified Capabilities

Ninguna. No existen especificaciones canonicas en `openspec/specs/` que deban modificarse.

## Impact

- Modelos, repositorios y servicios de ejecucion.
- Rutas de salud y arranque de la aplicacion.
- Configuracion de logging y Docker.
- Configuracion de ESLint, Prettier, Jest, scripts de paquete y pipeline.
- Documentacion operativa y pruebas manuales.
- No cambia el contrato de entrada de `POST /api/v1/issues`.
