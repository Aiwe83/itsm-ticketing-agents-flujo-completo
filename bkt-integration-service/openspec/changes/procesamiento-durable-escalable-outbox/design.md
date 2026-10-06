## Context

`IssueService` guarda el ticket raw y traducido, completa la ejecucion y lanza `postProcessTickets()` con `void ...catch()`. Ese trabajo solo existe en memoria: si el proceso termina, no queda una unidad reanudable. Varias instancias tampoco coordinan quien procesa cada ticket. MongoDB ya es la dependencia persistente del servicio y permite resolver el piloto sin incorporar otra infraestructura.

## Goals / Non-Goals

**Goals:**

- Confirmar la aceptacion solo cuando el trabajo de postproceso quede persistido.
- Recuperar trabajos despues de reinicios.
- Permitir multiples replicas de API y worker sin estado local ni doble reclamacion concurrente.
- Mantener idempotencia por ticket y soportar nuevas revisiones mientras una anterior se procesa.
- Conservar el ticket traducido aunque adjuntos u orquestador fallen.

**Non-Goals:**

- No introducir Kafka, RabbitMQ, Redis ni servicios externos de colas.
- No ofrecer orden global entre tickets distintos.
- No garantizar exactamente una entrega al orquestador si este no respeta la clave de idempotencia.
- No soportar lotes en `POST /api/v1/issues`.

## Decisions

### 1. Outbox Mongo transaccional

MongoDB se ejecutara como replica set de un nodo en local y como replica set administrado en entornos compartidos. Tras guardar el raw y transformar, una transaccion confirmara conjuntamente el ticket traducido, el estado raw `translated`, el resumen de integracion y el upsert del trabajo. Si la transaccion falla, no existira un ticket nuevo sin su trabajo asociado y el raw quedara trazado como `failed` fuera de la transaccion.

Alternativa descartada: dos escrituras independientes. Deja una ventana de caida entre persistir el ticket y crear el trabajo.

### 2. Documento `processing_jobs`

El `_id` sera `${meshId}:${ticketKey}`. El documento contendra:

```text
meshId, ticketKey, transformedTicketId, executionId
revision, processedRevision, claimedRevision
status: pending | processing | retry | succeeded | failed
phase: attachments | orchestrator
attempts, nextAttemptAt
leaseOwner, leaseUntil
lastError, createdAt, updatedAt, completedAt
```

No almacenara una copia del payload. El worker recuperara raw, traducido y ejecucion por sus IDs deterministas.

### 3. Revisiones concurrentes

Cada entrega valida incrementara `revision`. Si el trabajo no esta procesandose, quedara `pending`, con intentos reiniciados y ejecucion inmediata. Si esta `processing`, el upsert solo incrementara la revision y actualizara la referencia de ejecucion. Al terminar, el worker comparara `claimedRevision` con `revision`: si avanzo, volvera a `pending`; si no, podra finalizar.

### 4. Lease atomica y concurrencia

Cada worker tendra un `workerId` unico. Reclamara con `findOneAndUpdate` un trabajo vencido y elegible, fijando `status=processing`, `leaseOwner`, `leaseUntil` y `claimedRevision`. `WORKER_CONCURRENCY` tendra valor inicial `5`, polling de `1000 ms`, lease de `120000 ms` y heartbeat cada `30000 ms`. Una lease vencida podra ser reclamada por otra replica.

### 5. Fases reanudables

El trabajo comenzara en `attachments`. El worker procesara adjuntos, persistira el enriquecimiento y trazara omisiones o errores no fatales. Despues cambiara la fase a `orchestrator`, evitando volver a descargar adjuntos en reintentos normales del orquestador. Solo `succeeded` indicara que la fase final termino correctamente.

### 6. Reintentos y fallo definitivo

Los fallos reintentables usaran cinco intentos con esperas de 5 segundos, 30 segundos, 2 minutos, 10 minutos y 30 minutos. Tras el quinto fallo, el trabajo quedara `failed`, la ejecucion registrara el error y el ticket traducido no se eliminara ni se marcara como fallo de integracion.

Errores de validacion o ausencia del ticket referenciado seran no reintentables. Errores de red, timeout u orquestador 5xx seran reintentables. Los 4xx del orquestador seran definitivos salvo `408` y `429`.

### 7. Roles de proceso

`PROCESS_ROLE=api` iniciara Express sin consumidor; `worker` iniciara solo el consumidor; `all` mantendra ambos para desarrollo local. El mismo artefacto compilado y la misma imagen serviran a los tres roles. El cierre ordenado detendra nuevas reclamaciones, esperara los trabajos activos hasta el limite de lease y cerrara MongoDB.

### 8. Idempotencia externa

El orquestador recibira `X-Idempotency-Key: <jobId>:<claimedRevision>`. Los reintentos de la misma revision conservaran la clave. La garantia interna evita dos reclamaciones activas; la eliminacion de duplicados despues de un timeout requiere que el orquestador respete esa cabecera.

### 9. Respuesta y compatibilidad

La respuesta `201` incluira `processingQueued: true`. `orchestratorDispatched` se mantendra durante una transicion y reflejara que el postproceso fue aceptado, no que la llamada externa ya finalizo; se documentara como obsoleto.

## Risks / Trade-offs

- [Replica set aumenta la configuracion local] -> Automatizar su inicializacion en Docker y usar `MongoMemoryReplSet` en integracion.
- [Lease corta duplica trabajo] -> Heartbeat periodico y lease superior al timeout de una operacion individual.
- [Worker cae despues de invocar al orquestador] -> Reutilizar clave de idempotencia en el reintento.
- [Nueva revision llega durante el proceso] -> Comparar revisiones antes de finalizar y reencolar la mas reciente.
- [Outbox crece indefinidamente] -> Medir volumen en el piloto y definir retencion en un cambio operativo posterior.
- [Dos ejecuciones apuntan al mismo trabajo] -> Guardar la ejecucion mas reciente en el trabajo y mantener cada intento HTTP trazado en su propia Execution.

## Migration Plan

1. Configurar replica set y validar transacciones en local y tests.
2. Crear modelo, repositorio, indices y servicio de outbox.
3. Adaptar repositorios existentes para aceptar sesiones Mongo.
4. Sustituir el lanzamiento en memoria por la transaccion que encola.
5. Implementar worker, fases, lease, reintentos e idempotencia.
6. Incorporar roles a servidor, scripts y Docker Compose.
7. Desplegar primero con `PROCESS_ROLE=all`, comprobar trabajos y despues separar API y worker.

Rollback: detener workers nuevos y volver a la imagen anterior. Los trabajos persistidos se conservaran para una reanudacion posterior; no se borraran automaticamente.

## Open Questions

- El orquestador debera confirmar fuera de este repositorio si aplica deduplicacion por `X-Idempotency-Key`.
