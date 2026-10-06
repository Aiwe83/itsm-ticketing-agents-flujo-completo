## 1. Proteger la linea base y fijar contratos

- [ ] 1.1 Revisar el conjunto actualmente no versionado y crear una linea base Git que excluya `.env`, `.env.test`, secretos, logs, cobertura, builds y temporales.
- [x] 1.2 Ejecutar y registrar la linea base: `tsc --noEmit`, las 39 pruebas actuales y el build TypeScript antes de modificar codigo.
- [x] 1.3 Definir los tipos internos `MeshContext`, `StoredTicketId`, `ExecutionRecordId` y el DTO externo del orquestador, manteniendo ingles y camelCase salvo la serializacion externa acordada.
- [x] 1.4 Documentar en el codigo la diferencia entre `executionRecordId`, `storedTicketId` y `ticketKey` para impedir usos intercambiables.

## 2. Endurecer errores y fechas

- [x] 2.1 Eliminar `stack` de `ErrorResponse` y de todas las ramas de respuesta de `error.middleware.ts`, incluido local, desarrollo, JSON malformado y errores inesperados.
- [x] 2.2 Ajustar el logging para registrar stack, mensaje, codigo, `requestId`, metodo y ruta tanto en errores operativos como no operativos.
- [x] 2.3 Confirmar que el logging no incluye body, adjuntos, descripciones, tokens, cookies, contrasenas ni cabeceras de autorizacion.
- [x] 2.4 Crear una utilidad unica para serializar fechas HTTP y logs como ISO 8601 UTC con milisegundos y sufijo `Z`.
- [x] 2.5 Revisar health, errores, respuestas del procesamiento y timestamps manuales para usar la utilidad comun sin convertir los campos BSON a string antes de persistir.
- [x] 2.6 Anadir pruebas del middleware que comprueben respuesta sin stack, logger con stack sanitizado y timestamps ISO 8601 UTC.

## 3. Migrar configuracion y modelos a meshId

- [x] 3.1 Sustituir `TENANT_ID`, `PROJECT_ID` e `ITSM_ID` por `MESH_ID` obligatorio en `environment.ts` y `.env.example`, sin editar ni versionar secretos locales.
- [x] 3.2 Sustituir `INITIAL_ROL` por `ORCHESTRATOR_ROLE` y actualizar sus consumidores y ejemplos.
- [x] 3.3 Reemplazar los tres campos de contexto por `meshId` en `ITSMTicket`, `Ticket`, `Execution` y `Mapping`.
- [x] 3.4 Actualizar repositorios para insertar y consultar por `meshId`, incluido `MappingRepository.findByContext`.
- [x] 3.5 Actualizar utilidades, tipos de transformacion y fixtures para que no generen los identificadores retirados.
- [x] 3.6 Ampliar `ensureDatabaseIndexes` con indices `meshId_1` y preparar el indice unico `{ meshId, sourceField, targetField }` despues de validar duplicados.
- [x] 3.7 Anadir pruebas de validacion del entorno, modelos, repositorios e indices con `meshId`.

## 4. Corregir persistencia e idempotencia 1:1

- [x] 4.1 Cambiar el ID determinista a `${meshId}:${payload.key}` y usarlo como `_id` del bruto y traducido.
- [x] 4.2 Sustituir `received` por `persisted` en el enum y guardar el raw inicialmente con ese estado.
- [x] 4.3 Mantener la transicion a `translated` solo despues del upsert traducido y la transicion a `failed` ante fallo de mapping o persistencia posterior.
- [x] 4.4 Mantener `translated` cuando solo fallen adjuntos u orquestador y registrar esos fallos en `Execution`.
- [x] 4.5 Renombrar variables internas ambiguas a `executionRecordId`, `storedTicketId` y `ticketKey`, conservando `executionId` en la respuesta HTTP como alias compatible del registro de ejecucion.
- [x] 4.6 Actualizar las pruebas unitarias e integracion para primera entrega, reintento, fallo de mapping, fallo de persistencia y fallo del orquestador.
- [x] 4.7 Verificar en las pruebas que un reintento mantiene exactamente un raw y un traducido con el mismo `_id`.

## 5. Adaptar el orquestador

- [x] 5.1 Sustituir el cuerpo actual con contexto triple y `messages` por el DTO interno `role`, `ticketId`, `meshId` y `storedTicketId`.
- [x] 5.2 Implementar un unico serializador de frontera que emita exactamente `rol`, `ticket_id`, `mesh_id` y `execution_id`.
- [x] 5.3 Mapear `ticket_id` desde `payload.key`, `mesh_id` desde `MESH_ID`, `execution_id` desde el `_id` de `itsm_tickets` y `rol` desde `ORCHESTRATOR_ROLE`.
- [x] 5.4 Mantener la llamada asincrona y la trazabilidad de exito o fallo sin bloquear el `201` ni degradar el estado del ticket traducido.
- [x] 5.5 Anadir pruebas de contrato con mock que comparen el JSON completo y rechacen los identificadores antiguos y el wrapper `messages`.

## 6. Implementar la migracion MongoDB

- [x] 6.1 Crear un modulo de migracion que lea `caf_agents` y proyecte `itsm_tickets`, `tickets`, `executions` y `mappings` hacia `integration-service` sin modificar el origen.
- [x] 6.2 Implementar `db:migrate-mesh:dry-run` sin permisos de escritura y `db:migrate-mesh:apply` con confirmacion explicita del nombre de destino.
- [x] 6.3 Validar antes de escribir las claves Jira, la relacion 1:1, IDs destino, duplicados de mappings y referencias de `Execution.ticketList`.
- [x] 6.4 Reemplazar el contexto triple por `meshId`, recalcular IDs de bruto/traducido y actualizar `transformedTicketId`, preservando `Execution._id`.
- [x] 6.5 Convertir strings ISO validos de `createdAt`, `updatedAt`, `startTime`, `endTime` y `error.timestamp` a BSON `Date`, incluyendo mappings importados.
- [x] 6.6 Reportar fechas invalidas, claves ausentes y colisiones como conflictos bloqueantes sin inventar valores ni sobrescribir documentos.
- [x] 6.7 Hacer apply idempotente y clasificar cada documento como added, updated, unchanged o conflict.
- [ ] 6.8 Crear pruebas con fixtures para dry-run sin escrituras, apply, segunda ejecucion idempotente, fechas BSON, colisiones y referencias cruzadas.
- [ ] 6.9 Documentar backup, recuentos anteriores/posteriores, comprobacion de indices y procedimiento de rollback a `caf_agents`.

## 7. Actualizar MongoDB, Docker y despliegue

- [x] 7.1 Cambiar `MONGODB_DATABASE` de ejemplo y configuracion operativa documentada a `integration-service`.
- [x] 7.2 Anadir `name: integration-service` y renombrar el servicio de aplicacion a `integration-service` en ambos Compose.
- [x] 7.3 Mantener el servicio `mongo`, preservar el volumen heredado como respaldo, usar un volumen nuevo para `integration-service` y evitar `container_name` para conservar escalabilidad.
- [x] 7.4 Actualizar referencias de scripts, Dockerfiles, Jenkinsfile y documentacion que dependan del nombre anterior cuando existan.
- [x] 7.5 Validar `docker compose config`, reconstruir con `--build --force-recreate` y confirmar que las rutas de ingesta retiradas siguen devolviendo 404.

## 8. Reconciliar mappings, documentacion y OpenSpec

- [x] 8.1 Actualizar el catalogo y evidencias activas para usar `meshId`; mantener variables de dominio como `sourceField` y `targetField` sin traducir ni renombrar.
- [x] 8.2 Convertir las fechas documentales cargables del catalogo a una representacion que el cargador proyecte como BSON `Date`, sin cambiar su instante UTC.
- [x] 8.3 Actualizar README, CHANGELOG, documentacion operativa y pruebas manuales con la nueva base, contexto, estados, contrato y visualizacion azul `Date` en Compass.
- [x] 8.4 Reconciliar los OpenSpec pendientes `procesamiento-durable-escalable-outbox`, `operacionalizar-catalogo-mappings`, `observabilidad-calidad-y-demo` y `endurecer-ingesta-jira-piloto` con `meshId` y el nuevo ID determinista.
- [x] 8.5 Conservar los OpenSpec completados como historia y marcar su contexto triple como modelo anterior sin reescribir sus decisiones originales.
- [x] 8.6 Confirmar que este cambio no crea, modifica ni valida OpenAPI o ficheros YAML de contrato.

## 9. Validacion y aceptacion

- [x] 9.1 Ejecutar typecheck, Jest con las 39 pruebas existentes mas las nuevas, cobertura y build TypeScript.
- [x] 9.2 Ejecutar `docker compose config`, levantar la solucion reconstruida y comprobar health y conexion a `integration-service`.
- [x] 9.3 Enviar un ticket con Postman y comprobar en Compass raw `translated`, ticket final, `meshId`, `_id` compartido y fechas BSON mostradas como fecha.
- [ ] 9.4 Simular errores de JSON, mapping, persistencia y orquestador, verificando ausencia de stack en HTTP y presencia de diagnostico sanitizado en logs/ejecuciones.
- [ ] 9.5 Ejecutar dry-run y apply sobre una copia local, repetir dry-run y exigir cero added, updated y conflicts antes del corte.
- [x] 9.6 Buscar referencias operativas residuales a `caf_agents`, `TENANT_ID`, `PROJECT_ID`, `ITSM_ID`, `tenantId`, `projectId` e `itsmId`, separando explicitamente la historia no operativa.
- [x] 9.7 Revisar el diff final para confirmar que no hay secretos, payloads sensibles, borrados de OpenSpec fuera de alcance ni cambios OpenAPI/YAML. Evidencia (2026-08-05): scan de secretos/credenciales en `openspec/`, `docs/` y `src/` sin coincidencias; sin emails reales en docs/OpenSpec; `.gitignore` cubre `.env`, `.env.*` (con excepcion de `.env.example`), `*.pem`, `*.key`, dist/build/coverage/logs/nodos_modules y temporales; `docker-compose.yaml` referencia credenciales por env var sin valores hardcodeados; `Jenkinsfile` solo contiene `nodeapplication()`; `.env.example` usa valores `example_*`; `git ls-files` vacio (nada trackeado, sin borrados de OpenSpec fuera de alcance); sin ficheros OpenAPI y los 15 YAML existentes son compose/config/metadata OpenSpec/lockfiles, no cambios OpenAPI.
- [ ] 9.8 Ejecutar y documentar un ensayo de rollback restaurando la imagen/configuracion anterior contra `caf_agents` sin borrar la nueva base.

