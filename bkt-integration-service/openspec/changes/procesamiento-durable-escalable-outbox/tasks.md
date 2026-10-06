## 1. Preparar MongoDB transaccional

- [ ] 1.1 Configurar MongoDB local como replica set de un nodo sin incluir credenciales en scripts o documentacion.
- [ ] 1.2 Adaptar las pruebas de integracion que necesiten transacciones para usar `MongoMemoryReplSet`.
- [ ] 1.3 Permitir que los repositorios raw, traducido, ejecucion y trabajos reciban una sesion Mongo opcional.
- [ ] 1.4 Probar commit y rollback atomicos de ticket traducido, estado raw, ejecucion y trabajo.

## 2. Modelo y repositorio de trabajos

- [ ] 2.1 Crear el modelo `ProcessingJob` con el esquema y estados definidos en `design.md`.
- [ ] 2.2 Crear el repositorio con upsert por ticket, incremento de revision y lectura por ID.
- [ ] 2.3 Implementar reclamacion atomica, heartbeat, finalizacion, reintento y fallo definitivo.
- [ ] 2.4 Anadir indices fisicos para polling, lease y contexto al comando idempotente de indices.
- [ ] 2.5 Anadir pruebas de modelo, revisiones, lease vencida e indices ejecutados dos veces.

## 3. Encolado durable desde la API

- [ ] 3.1 Sustituir el lanzamiento en memoria por una transaccion que persista traduccion y outbox antes de responder.
- [ ] 3.2 Mantener el raw guardado antes de mappings y dejarlo `failed` cuando transformacion o transaccion fallen.
- [ ] 3.3 Incrementar la revision del mismo trabajo en entregas repetidas sin crear documentos duplicados.
- [ ] 3.4 Anadir `processingQueued` y mantener `orchestratorDispatched` documentado como obsoleto.
- [ ] 3.5 Verificar que una caida al encolar no produce una traduccion nueva sin trabajo asociado.

## 4. Worker y fases

- [ ] 4.1 Crear el bucle de worker con polling, concurrencia configurable y `workerId` unico.
- [ ] 4.2 Implementar la fase de adjuntos y persistir el enriquecimiento antes de avanzar.
- [ ] 4.3 Trazar adjuntos omitidos o fallidos sin convertir el ticket traducido en fallo de integracion.
- [ ] 4.4 Implementar la fase de orquestador con timeout y clasificacion de errores reintentables.
- [ ] 4.5 Enviar `X-Idempotency-Key` estable por trabajo y revision en todos los reintentos.
- [ ] 4.6 Implementar las cinco esperas configuradas y el estado final `failed`.
- [ ] 4.7 Comparar revision reclamada y actual antes de finalizar para reencolar entregas nuevas.
- [ ] 4.8 Anadir heartbeat y recuperacion de trabajos con lease vencida.

## 5. Roles y despliegue

- [ ] 5.1 Anadir y validar `PROCESS_ROLE`, `WORKER_CONCURRENCY`, nombre de coleccion, polling, lease y heartbeat.
- [ ] 5.2 Adaptar el arranque para soportar roles `api`, `worker` y `all` desde el mismo build.
- [ ] 5.3 Implementar cierre ordenado que detenga polling, espere trabajos activos y cierre MongoDB.
- [ ] 5.4 Actualizar Docker Compose para replica set y servicios API/worker escalables con la misma imagen.
- [ ] 5.5 Actualizar `.env.example`, README y guias operativas con valores ficticios.

## 6. Pruebas y aceptacion

- [ ] 6.1 Probar dos workers reclamando a la vez y confirmar una unica lease activa.
- [ ] 6.2 Probar reinicio despues de encolar y confirmar que otro worker termina el trabajo.
- [ ] 6.3 Probar entrega duplicada y concurrente manteniendo un raw, un traducido y un trabajo revisionado.
- [ ] 6.4 Probar una revision nueva recibida mientras la anterior esta en proceso.
- [ ] 6.5 Probar fallos de adjuntos y orquestador conservando la ultima traduccion valida.
- [ ] 6.6 Probar los cinco reintentos, errores definitivos y clave de idempotencia estable.
- [ ] 6.7 Levantar dos APIs y dos workers y ejecutar 50 peticiones concurrentes sin perdidas ni procesamiento duplicado.
- [ ] 6.8 Medir y registrar el percentil 95 de la recepcion, con objetivo inferior a un segundo en el entorno local de referencia.
- [ ] 6.9 Ejecutar typecheck, formato, lint, Jest con cobertura, build e indices sobre Docker.
