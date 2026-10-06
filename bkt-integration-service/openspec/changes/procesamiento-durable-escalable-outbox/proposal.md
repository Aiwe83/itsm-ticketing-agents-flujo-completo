## Why

El postproceso de adjuntos y la llamada al orquestador se lanzan actualmente con una promesa en memoria despues de responder al `POST`. Un reinicio puede perder ese trabajo y varias replicas no disponen de un mecanismo comun para evitar ejecuciones simultaneas, lo que impide considerar el piloto durable y escalable.

## What Changes

- Sustituir el `fire-and-forget` en memoria por una outbox MongoDB `processing_jobs` persistida antes de responder.
- Separar API y worker mediante `PROCESS_ROLE=api|worker|all`, usando la misma imagen y sin estado local.
- Reclamar trabajos con lease atomica para permitir varias replicas sin duplicar el procesamiento concurrente.
- Mantener un trabajo determinista por contexto y clave Jira, con revision para no perder una nueva entrega mientras una anterior esta en proceso.
- Reintentar cinco veces con esperas de 5 segundos, 30 segundos, 2 minutos, 10 minutos y 30 minutos; terminar en `failed` sin borrar el ticket traducido.
- Procesar adjuntos antes de invocar al orquestador y enviar una clave de idempotencia determinista.
- Anadir `processingQueued: true` a la respuesta `201`; mantener temporalmente `orchestratorDispatched` como campo obsoleto.
- Anadir indices fisicos y configuracion de concurrencia, polling y lease.

## Capabilities

### New Capabilities

- `durable-ticket-postprocessing`: cola outbox, worker escalable, leasing, reintentos, idempotencia y recuperacion del postproceso Jira.

### Modified Capabilities

Ninguna. La capacidad no existe todavia en `openspec/specs/`; el procesamiento actual en memoria sera sustituido durante Apply.

## Impact

- Afecta servicio de issues, modelo y repositorio nuevos de trabajos, arranque, Docker Compose, configuracion, indices, orquestador, ejecuciones y pruebas.
- Crea la coleccion `processing_jobs`; no introduce una cola externa.
- Mantiene el contrato de un ticket por peticion, el `201` y los IDs deterministas de raw y traducido.
- Permite desplegar y escalar API y worker de forma independiente.
