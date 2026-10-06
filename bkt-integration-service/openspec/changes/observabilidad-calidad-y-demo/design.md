## Context

El servicio registra hoy `successIntegration` y `successOrchestrator`, pero `false` puede significar fallo, fase pendiente o llamada omitida. `/health` sirve para saber que Express responde, no que MongoDB, los indices y los mappings necesarios esten disponibles. La calidad se comprueba manualmente: ESLint 9 carece de configuracion plana, Prettier detecta diferencias y el pipeline no protege todos los controles del piloto.

Este cambio se aplicara despues de la outbox durable para que los estados y las pruebas de carga reflejen el procesamiento real entre API y workers.

## Goals / Non-Goals

**Goals:**

- Expresar el estado de cada fase sin ambiguedad.
- Separar liveness de readiness.
- Correlacionar peticiones, tickets, trabajos e intentos sin exponer datos sensibles.
- Automatizar una linea base de calidad y seguridad.
- Demostrar que dos APIs y dos workers soportan 50 peticiones concurrentes sin perdidas ni duplicados.
- Conservar una demostracion manual corta y comprensible.

**Non-Goals:**

- Instalar una plataforma externa de metricas o trazas distribuidas.
- Crear paneles de observabilidad.
- Migrar masivamente todas las ejecuciones historicas.
- Prometer alta disponibilidad multirregion.
- Sustituir MongoDB como almacenamiento operativo.

## Decisions

### 1. Estados explicitos con compatibilidad temporal

`Execution` incorporara tres campos enum:

- `integrationStatus`: recepcion, persistencia y traduccion.
- `attachmentStatus`: enriquecimiento de adjuntos.
- `orchestratorStatus`: entrega al siguiente componente.

Los valores permitidos seran `pending`, `succeeded`, `failed` y `skipped`. Nuevas ejecuciones siempre los informaran. Los booleanos existentes se conservaran durante una ventana de compatibilidad y se actualizaran a partir de los nuevos estados, no al reves.

Para documentos historicos sin estados, las lecturas podran derivar una presentacion compatible desde booleanos y `endTime`, sin modificar esos documentos.

### 2. Liveness y readiness separados

`GET /health` seguira siendo publico, rapido y sin dependencias externas. `GET /ready` devolvera:

- `200` cuando MongoDB este conectado, existan los indices obligatorios y haya al menos un mapping valido para el `meshId` configurado.
- `503` cuando falle cualquier comprobacion.

La respuesta mostrara solo nombres de checks y estados; nunca URIs, credenciales ni documentos. En rol `all`, tambien comprobara que el bucle worker haya arrancado. En roles separados, la salud del contenedor worker dependera de que su proceso permanezca activo y su actividad quedara visible mediante logs y leases en MongoDB.

### 3. Logging estructurado y sanitizado

Cada linea sera JSON y podra contener `requestId`, `ticketKey`, `jobId`, `revision`, `attempt`, `phase`, `durationMs`, `status` y un error reducido a tipo, codigo y mensaje sanitizado. Se prohibiran body completo, adjuntos, descripciones, nombres, correos, tokens y cabeceras de autenticacion.

La aplicacion escribira a stdout/stderr. Docker se encargara de la rotacion; no se mantendran ficheros de log locales como fuente operativa.

### 4. Controles de calidad incrementales

Se incorporara `eslint.config.js` compatible con ESLint 9 y se aplicara Prettier como cambio mecanico aislado. El pipeline ejecutara, en este orden:

1. instalacion reproducible;
2. typecheck;
3. `format:check`;
4. lint;
5. Jest con cobertura;
6. auditoria de dependencias de produccion;
7. build TypeScript y build Docker.

La primera barrera de cobertura sera la linea base ya medida: 69% sentencias, 51% ramas, 53% funciones y 70% lineas. Tras completar la outbox, los minimos de sentencias y ramas subiran a 75% y 60%; funciones y lineas no podran retroceder.

### 5. Carga reproducible del piloto

Un script local enviara 50 tickets distintos de forma concurrente y recogera codigo HTTP, duracion y `executionId`. El escenario levantara dos replicas API y dos workers con concurrencia cinco. La comprobacion posterior consultara MongoDB por claves deterministas y trabajos finales.

Se considerara correcto cuando no haya peticiones perdidas, no exista procesamiento duplicado, todos los trabajos terminen en `succeeded` o `failed` y el p95 de recepcion sea inferior a un segundo en la maquina de referencia. Un resultado fuera del limite se registrara como fallo del ensayo, no se ocultara aumentando el umbral.

### 6. Demo manual separada de la prueba de carga

Las guias de Postman y Compass mantendran un recorrido de dos minutos: enviar un ticket, localizar raw, traducido, ejecucion y trabajo. La carga automatizada sera una validacion tecnica separada para no complicar la explicacion al responsable.

## Risks / Trade-offs

- [Duplicidad temporal entre enums y booleanos] -> Los enums seran fuente y se probaran reglas de compatibilidad.
- [Readiness lento] -> Se usaran consultas acotadas y comprobaciones de indices cacheables con tiempo limite.
- [Logs insuficientes para depurar] -> Se conservaran IDs y codigos tecnicos, evitando el contenido sensible.
- [Formateo produce un diff grande] -> Se aplicara en un commit separado y sin cambios funcionales.
- [Prueba de carga sensible a la maquina] -> Se registraran CPU, memoria, versiones y fecha junto al resultado.

## Migration Plan

1. Anadir enums opcionales y escritura dual en nuevas ejecuciones.
2. Actualizar lectores y pruebas para priorizar enums y tolerar documentos antiguos.
3. Implementar `/ready` y logs estructurados.
4. Incorporar ESLint/Prettier y fijar umbrales de linea base.
5. Actualizar el pipeline y ejecutar la prueba de carga local.
6. Elevar cobertura tras completar las pruebas de outbox.

Rollback: los booleanos existentes permiten volver temporalmente al lector anterior; `/ready`, la configuracion de calidad y los scripts de carga se pueden retirar sin cambiar el endpoint de negocio.

## Open Questions

- La herramienta corporativa que consumira los logs estructurados se elegira fuera de este cambio.
- La fecha de retirada de los booleanos se decidira despues del piloto.
