## Context

El servicio Node.js/TypeScript recibe exactamente un ticket Jira por `POST /api/v1/issues`, crea una ejecucion, guarda el payload bruto en `itsm_tickets`, consulta mappings, guarda el resultado en `tickets` y notifica al orquestador en segundo plano. Los documentos bruto y traducido comparten actualmente `${itsmId}:${ticketKey}` como `_id`.

El contexto operativo esta repetido como `tenantId`, `projectId` e `itsmId` en configuracion, modelos, repositorios, mappings, fixtures y OpenSpec pendientes. Las respuestas de error locales incluyen `stack`. MongoDB contiene fechas creadas por Mongoose como BSON `Date`, pero algunos mappings importados conservan `createdAt` y `updatedAt` como strings ISO. La aplicacion usa `caf_agents`, Compose expone `tc-integration-service` y el orquestador recibe un cuerpo distinto al contrato objetivo.

La linea base comprobada antes de la propuesta tiene typecheck correcto y 39 pruebas superadas. El repositorio no dispone todavia de un commit inicial util, por lo que la implementacion debera crear primero una linea base segura. Las capturas de una ruta retirada indican ademas que el contenedor local puede estar ejecutando una imagen anterior al codigo actual.

## Goals / Non-Goals

**Goals:**

- Sustituir el contexto triple por `meshId` en todo el estado operativo nuevo.
- Mantener una relacion 1:1 verificable entre ticket bruto y traducido.
- No exponer stacks y conservar diagnostico completo, estructurado y sanitizado en logs.
- Persistir todas las fechas de MongoDB como BSON `Date` y serializar fechas HTTP/log como ISO 8601 UTC.
- Adaptar el orquestador al cuerpo plano acordado sin confundir el registro `executions` con el ticket persistido.
- Migrar de `caf_agents` a `integration-service` con dry-run, apply, comprobacion y rollback.
- Normalizar los nombres Docker sin impedir replicas futuras.
- Mantener las 39 pruebas actuales y anadir cobertura para todos los contratos modificados.

**Non-Goals:**

- No cambiar el contrato de entrada de `POST /api/v1/issues`, su limite de un ticket ni su estado `201` correcto.
- No implementar la outbox ni los workers definidos en otro OpenSpec.
- No crear frontend, paneles, endpoints administrativos ni una interfaz de migracion.
- No eliminar automaticamente `caf_agents` ni el volumen Docker existente.
- No reescribir el contenido normativo de OpenSpec completados; se conservaran como historia y se podran marcar como obsoletos.
- No crear, modificar, validar ni depender de OpenAPI o ficheros YAML de contrato.

## Decisions

### 1. Contexto operativo unico

`MESH_ID` sera una variable obligatoria y no vacia. Internamente se usara `meshId` en camelCase. `tenantId`, `projectId`, `itsmId` y sus variables de entorno se retiraran de codigo, modelos, datos activos, fixtures, documentacion operativa y OpenSpec pendientes.

Los mappings se consultaran por `meshId`. Se creara un indice simple `meshId_1` en las cuatro colecciones y, para mappings, un indice unico compuesto `{ meshId, sourceField, targetField }` una vez que el dry-run confirme que no hay duplicados.

Alternativa descartada: mantener el contexto triple como compatibilidad permanente. Duplicaria fuentes de verdad y permitiria documentos incoherentes.

### 2. Identificador y relacion 1:1

El identificador determinista de `itsm_tickets` y `tickets` sera `${meshId}:${ticketKey}`. Ambos documentos usaran exactamente el mismo `_id`; `ticketKey` sera `payload.key`. El upsert mantendra un solo bruto y un solo traducido en reintentos.

`Execution._id` seguira siendo el identificador unico de cada intento. En codigo se denominara `executionRecordId`; `storedTicketId` identificara el `_id` compartido. La respuesta HTTP conservara temporalmente `executionId` como alias del registro `executions` para no romper consumidores existentes.

### 3. Ciclo del ticket bruto

El bruto se insertara o actualizara con `status: persisted`. Tras guardar correctamente el traducido se actualizara a `translated`. Si falla la carga/aplicacion de mappings o la persistencia posterior, pasara a `failed`. Un fallo de adjuntos u orquestador no cambiara un ticket ya traducido a `failed`.

El valor `received` dejara de generarse. La migracion convertira documentos `received` a `persisted`; conservara `translated` y `failed`.

### 4. Contrato del orquestador

La frontera externa enviara exactamente:

```json
{
  "rol": "agentic-orchestrator-application",
  "ticket_id": "PA-205",
  "mesh_id": "dc9ca342-4622-4a00-b115-62e963c5d8cf",
  "execution_id": "dc9ca342-4622-4a00-b115-62e963c5d8cf:PA-205"
}
```

`ticket_id` sera la clave Jira, `mesh_id` vendra de `MESH_ID` y `execution_id` sera `storedTicketId`. `ORCHESTRATOR_ROLE` sustituira a `INITIAL_ROL`. El codigo interno permanecera en ingles y camelCase; `rol` y snake_case son una excepcion limitada al serializador externo.

Alternativa descartada: usar `Execution._id` como `execution_id`. Contradice el contrato solicitado, que exige el `_id` almacenado en `itsm_tickets`.

### 5. Errores sin stack en respuestas

`ErrorResponse` no declarara `stack` y ningun entorno lo incluira en JSON. El logger recibira el objeto de error y su stack para errores operativos y no operativos, junto con `requestId`, metodo, ruta y codigo. Los logs no contendran body, adjuntos, descripciones, tokens, cookies ni cabeceras de autenticacion.

### 6. Fechas BSON y serializacion corporativa

MongoDB almacenara fechas como BSON `Date`. Los timestamps de Mongoose seguiran siendo `Date`; la migracion convertira strings ISO validos de `createdAt`, `updatedAt`, `startTime`, `endTime` y `error.timestamp` a `Date`. Un string ausente o invalido se reportara como conflicto y no se corregira por aproximacion.

API y logs usaran ISO 8601 UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`). Una utilidad unica serializara fechas HTTP; no se guardaran representaciones localizadas en MongoDB.

### 7. Migracion de base

Se creara un comando con `db:migrate-mesh:dry-run` y `db:migrate-mesh:apply`. El origen sera `caf_agents` y el destino `integration-service`. Apply exigira una confirmacion explicita del nombre de destino y nunca eliminara el origen.

La migracion procesara `itsm_tickets`, `tickets`, `executions` y `mappings`; reemplazara el contexto, recalculara IDs de tickets, actualizara `ticketList.transformedTicketId`, convertira fechas y preservara `Execution._id`. Antes de escribir validara claves Jira, duplicados, pares 1:1 y fechas. La repeticion de apply sera idempotente: un documento identico quedara unchanged y una diferencia incompatible sera conflict.

### 8. Docker y configuracion

`MONGODB_DATABASE` usara `integration-service`. Compose declarara `name: integration-service` y renombrara el servicio de aplicacion a `integration-service`. El servicio Mongo seguira siendo `mongo` y el volumen actual no cambiara, de modo que la base origen y destino puedan coexistir en el mismo servidor durante el corte.

No se anadira `container_name`, porque impediria escalar replicas. El Compose de depuracion aplicara el mismo nombre de servicio. Tras la implementacion se reconstruira con `docker compose up -d --build --force-recreate` para no validar una imagen antigua.

### 9. OpenSpec y documentacion

Los OpenSpec pendientes que dependen de IDs antiguos se actualizaran antes de aplicarse. Los cambios completados se conservaran sin reescribir su historia y se documentara que pertenecen al modelo anterior. README, CHANGELOG, documentacion operativa, catalogo de mappings y pruebas manuales activas reflejaran `meshId`, la nueva base, fechas BSON y el contrato del orquestador.

## Risks / Trade-offs

- [Cambio incompatible del orquestador] -> Validar el JSON exacto con un mock de contrato antes del corte y mantener disponible la imagen anterior para rollback.
- [`_id` es inmutable] -> Copiar a una base nueva con IDs recalculados; no intentar actualizar `_id` en `caf_agents`.
- [Dos documentos origen convergen en el mismo ID] -> Detener apply, listar el conflicto y exigir resolucion manual.
- [Fecha string invalida] -> Reportarla en dry-run y bloquear ese documento; no inventar una fecha.
- [Mappings duplicados por mesh] -> Crear el indice unico solo despues del analisis de duplicados.
- [Confusion entre dos ejecuciones] -> Usar `executionRecordId` y `storedTicketId` internamente y probar ambos contratos.
- [Contenedor desactualizado] -> Reconstruccion forzada y prueba negativa de rutas retiradas.
- [OpenSpec pendientes incompatibles] -> Reconciliarlos como tarea explicita antes de cualquier apply posterior.
- [Sin linea base Git] -> Crear y revisar un commit inicial sin secretos, logs, cobertura ni temporales antes de modificar codigo.

## Migration Plan

1. Crear una linea base Git revisada y ejecutar typecheck, 39 pruebas y build.
2. Implementar contratos, modelos, repositorios y pruebas sin cambiar aun la base activa.
3. Implementar y probar `db:migrate-mesh:dry-run` con fixtures sanitizados.
4. Hacer backup/export de `caf_agents` y registrar recuentos por coleccion.
5. Ejecutar dry-run contra local; resolver todos los conflictos.
6. Ejecutar apply hacia `integration-service` con confirmacion explicita.
7. Repetir dry-run y exigir cero added/updated/conflicts.
8. Verificar recuentos, fechas BSON, indices, IDs compartidos y referencias de ejecucion.
9. Cambiar configuracion y reconstruir Compose con recreacion forzada.
10. Ejecutar salud, Postman, Compass y mock del orquestador.
11. Mantener `caf_agents` y el backup durante la ventana de validacion.

Rollback: detener la imagen nueva, restaurar la configuracion e imagen anteriores y volver a `caf_agents`. La base origen no habra sido modificada ni eliminada. Los tickets aceptados durante la ventana nueva se identificaran por sus ejecuciones y se reprocesaran de forma controlada tras volver al servicio anterior.

## Open Questions

Ninguna. Las decisiones de formato de fecha, estado, origen de `meshId`, identificadores, contrato externo, migracion y naming Docker estan fijadas en este documento.

