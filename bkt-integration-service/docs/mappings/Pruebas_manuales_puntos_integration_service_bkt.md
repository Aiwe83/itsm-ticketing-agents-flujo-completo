# Demo manual — Los 7 puntos de Tarea_7 (INTEGRATION-SERVICE)

Guía para hacer la demo en vivo ante el equipo evaluador del proyecto. Cada punto está numerado igual que en Tarea_7 (no es un orden libre), dice **qué programa abrir**, **qué pegar literalmente**, **qué verás exactamente** y **qué frase decir** para dejar claro que ese punto concreto está resuelto.

> **⚠️ Cambio importante (2026-08-12): autenticación por API key obligatoria.**
> Desde este cambio, toda petición a `/api/v1/*` (incluido `POST /api/v1/issues`) exige la cabecera
> `X-API-KEY`, salvo `GET /health`. Sin ella responde `401` en vez del código documentado en cada
> punto. **Excepción: el Punto 1 (JSON malformado) NO la necesita** — el parseo del body falla antes
> de llegar a la comprobación de la clave, así que ese `400` sale igual con o sin cabecera.
>
> **Antes de empezar la demo, en Postman:** en la petición `POST http://localhost:8000/api/v1/issues`,
> pestaña **Headers**, añade una fila: `Key: X-API-KEY`, `Value:` el valor de `API_KEY` en tu `.env`
> local (no versionado — cada máquina tiene el suyo; si no lo tienes, genera uno y añádelo a `.env`,
> el servicio no arranca sin él). Postman recuerda las cabeceras de cada petición guardada, así que
> basta con añadirla una vez por petición creada.

## Resumen ejecutivo (léelo antes de la demo)

| Punto Tarea_7 | Qué se demuestra | Dónde se ve |
|---|---|---|
| 1 | Los errores no exponen `stack` al usuario | Postman |
| 2 | Ticket bruto y traducido comparten el mismo `_id` + índice único que evita duplicados | Postman + Compass |
| 3 | Las fechas se guardan como `Date` real de Mongo, no como texto | Compass |
| 4 | Todo documento nuevo lleva `meshId` | Compass |
| 5 | La base de datos activa es la correcta (`integration-service`) | Docker Desktop (logs) |
| 6 | Se guarda un registro de qué tickets se notificaron al orquestador | Compass |
| 7 | Nombres de campos y logs en inglés/camelCase | Compass + Docker Desktop |
| Extra (Paso 0) | El servicio arranca aunque una variable de entorno booleana venga vacía | Terminal (test automático) |

Si solo hay 2 minutos disponibles, enseña esta tabla y luego el "Resumen en 20 segundos" del final.

## Herramientas que vas a usar (referencia rápida)

**Docker Desktop** — para arrancar el servicio y ver sus logs.
1. Abre Docker Desktop.
2. En el menú lateral izquierdo, pulsa **Containers**.
3. Deben aparecer en verde (running): `integration-service-1` y `mongo-1`. Si no están verdes, pulsa el botón de tres puntos (⋮) de la fila y elige **Restart**.
4. Para ver los logs de un contenedor: haz clic sobre su nombre (`integration-service-1`) → se abre un panel con pestañas arriba → pulsa la pestaña **Logs**.
5. Alternativa por terminal (PowerShell, desde la raíz del repo): `docker compose logs integration-service --tail 50`.

**Postman** — para enviar los tickets (simula lo que hace Jira).
1. Abre Postman.
2. Crea una petición nueva (botón **+** junto a las pestañas, o `Ctrl+N` → **HTTP Request**).
3. En el desplegable de método (pone `GET` por defecto), cambia a **POST**.
4. En la barra de la URL escribe: `http://localhost:8000/api/v1/issues`.
5. Debajo de la URL hay una fila de pestañas: **Params / Authorization / Headers / Body / ...** → pulsa **Body**.
6. Dentro de Body, marca el radio button **raw** (no "form-data" ni "x-www-form-urlencoded").
7. A la derecha del radio button "raw" hay un desplegable que suele poner "Text" → cámbialo a **JSON**. Esto es importante: si no lo cambias, Postman no manda el header `Content-Type: application/json` y la petición puede no comportarse como se espera.
7.5. Pestaña **Headers** (misma fila que Body) → añade `Key: X-API-KEY`, `Value:` tu `API_KEY` local (ver aviso al principio del documento). Sin esto, cualquier punto salvo el 1 devuelve `401`.
8. Pega el JSON de cada punto en el recuadro grande de abajo.
9. Pulsa el botón azul **Send** (a la derecha de la URL).
10. La respuesta aparece abajo: arriba a la izquierda del panel de respuesta verás el código de estado (`200 OK`, `201 Created`, `400 Bad Request`...) y el cuerpo de la respuesta en formato JSON.

**MongoDB Compass** — para ver los datos ya guardados.
1. Abre Compass y conecta a `localhost:27017` (si ya tienes una conexión guardada, haz doble clic sobre ella).
2. En el menú lateral izquierdo aparece la lista de bases de datos → haz clic en **integration-service**.
3. Se despliega la lista de colecciones (`executions`, `itsm_tickets`, `mappings`, `tickets`) → haz clic sobre el nombre de la colección que necesites.
4. Se abre una vista con pestañas arriba: **Documents / Aggregations / Schema / Indexes / Validation**. Por defecto estás en **Documents**.
5. Justo encima de la lista de documentos hay una barra de filtro (pone `{}` por defecto). Borra el `{}` y pega el filtro que se indica en cada punto.
6. Pulsa el botón **Find** (a la derecha de la barra de filtro, con forma de lupa o texto "Find").
7. Para ver índices: dentro de la misma colección, pulsa la pestaña **Indexes** (en vez de Documents).

## Antes de empezar (2 min)

1. Docker Desktop → pestaña **Containers** → `integration-service-1` y `mongo-1` en verde.
2. Postman → crea la petición `GET http://localhost:8000/api/v1/issues` y pulsa **Send**. Da igual que responda `401`, `404` o `405`: lo único que importa aquí es que responda algo (confirma que el servicio está vivo y escuchando en el puerto 8000). Lo más probable ahora es `401` (falta la cabecera `X-API-KEY`), y eso también vale como respuesta.
3. Compass → conecta a `localhost:27017` → confirma que ves la base **integration-service** en el menú lateral.
4. Si en el punto 4 (Tarea_7) no aparece ningún mapping con `targetField: content.status`, importa los mappings del proyecto antes de seguir (ver `docs/mappings/`).

Frase: "Entorno listo: Docker arriba, servicio en el puerto 8000, Mongo conectado."

---

## Punto 1 — Los errores no exponen `stack` al usuario

**Que se prueba:** que un error de entrada (JSON malformado) responde con codigo y mensaje claros,
sin filtrar el `stack trace` interno del servidor.
**Para que sirve:** evita fugas de informacion tecnica sensible a quien consume la API; el detalle
de depuracion solo vive en los logs internos, nunca en la respuesta HTTP.

**Herramienta: Postman.**

1. Crea/edita la petición `POST http://localhost:8000/api/v1/issues` (ver "Herramientas" arriba: Body → raw → JSON).
2. Pega esto exactamente tal cual, sin corregirlo:

```json
{
  "initiatedBy": "prueba-manual",
  "issues": [
    {
      "id": "ERR-001",
      "key": "PM-ERR-001",
      "fields": {
        "summary": "Ticket con error de sintaxis",
        "issuetype": { "name": "Incidencia" }
      }
    }
  ]
```

   **Aviso importante — LÉELO ANTES DE PULSAR SEND:** este JSON está roto a propósito (le falta la llave `}` final que cerraría el objeto raíz). No lo arregles. La prueba consiste precisamente en mandar un JSON mal formado para comprobar cómo responde el servicio a un error.

3. Pulsa **Send**.

**Verás en el panel de respuesta de Postman:**

- Código de estado (arriba a la izquierda del panel de respuesta): `400 Bad Request`
- Cuerpo de la respuesta (pestaña "Body" del panel de respuesta):

```json
{
  "success": false,
  "error": {
    "message": "Malformed JSON body",
    "code": "VALIDATION_ERROR",
    "statusCode": 400
  }
}
```

4. Revisa el JSON de respuesta de arriba abajo: **no existe ningún campo llamado `stack`**. Eso es justo lo que se demuestra: el detalle técnico del error (la traza de código, el `stack trace`) nunca llega al usuario final por HTTP; si hiciera falta para depurar, solo está en los logs internos del servidor (Docker Desktop → `integration-service-1` → Logs), nunca en la respuesta que recibe quien hizo la petición.

Frase: "El error llega al usuario sin detalle técnico interno; el `stack` solo existe en los logs del servidor, nunca en la respuesta HTTP."

---

## Punto 2 — Split 1:1 `itsm_tickets` / `tickets` con el mismo `_id`, protegido por índice único

**Que se prueba:** que el ticket bruto de Jira y su version traducida quedan vinculados por el
mismo `_id`, y que un indice unico en Mongo impide guardar el mismo ticket dos veces.
**Para que sirve:** garantiza trazabilidad 1:1 entre lo que llega y lo que se guarda, y protege
contra duplicados si Jira reenvia el mismo ticket (reintentos, webhooks repetidos).

**Herramienta: Postman primero, luego Compass.**

### 2.1 — Enviar un ticket correcto (Postman)

1. Misma petición `POST http://localhost:8000/api/v1/issues`. Body → raw → JSON.
2. Pega:

```json
{
  "initiatedBy": "prueba-manual-7-puntos",
  "issues": [
    {
      "id": "70010",
      "key": "PM-7P-DEMO-001",
      "fields": {
        "summary": "Incidencia de prueba final",
        "description": "Ticket usado para comprobar los siete puntos de la tarea.",
        "issuetype": { "name": "Incidencia" },
        "status": { "name": "Recibida" },
        "priority": { "name": "Medium" },
        "components": "COMPONENTE 1",
        "attachment": [
          {
            "filename": "nota.txt",
            "data": "Texto visible para comprobar que el adjunto llega en texto plano"
          }
        ]
      }
    }
  ]
}
```

3. Pulsa **Send**.

**Verás:**

- Código de estado: `201 Created`
- Cuerpo de la respuesta (los campos que importan para la demo, puede haber alguno más):

```json
{
  "success": true,
  "data": {
    "summary": {
      "ticketsProcessed": 1,
      "ticketsSucceeded": 1,
      "ticketsFailed": 0,
      "successIntegration": true,
      "orchestratorDispatched": true
    },
    "tickets": [
      { "ticketId": "PM-7P-DEMO-001", "success": true }
    ]
  }
}
```

   **Aviso:** `orchestratorDispatched: true` solo significa que el servicio *intentó* avisar al orquestador, no que el orquestador haya confirmado nada todavía. Eso se comprueba en el Punto 6.

Frase: "El ticket se guarda y se traduce; la petición HTTP responde al momento sin esperar al orquestador."

### 2.2 — Comprobar el mismo `_id` en las dos colecciones (Compass)

1. Compass → base `integration-service` → colección **itsm_tickets** → pestaña Documents.
2. Filtro (pégalo en la barra de filtro y pulsa Find):

```json
{ "content.key": "PM-7P-DEMO-001" }
```

3. Verás un documento con:

```text
_id: <meshId>:PM-7P-DEMO-001
content.key: PM-7P-DEMO-001
status: translated
meshId: <el meshId de tu entorno>
```

4. **Copia el valor completo de `_id`** (algo como `6a323e68-6f87-403a-a87d-72da69fcde0d:PM-7P-DEMO-001`). Lo necesitas en el siguiente paso.
5. Ahora ve a la colección **tickets** (mismo menú lateral, dentro de la base `integration-service`) → pestaña Documents.
6. Filtro:

```json
{ "itsmTicketId": "PM-7P-DEMO-001" }
```

7. Verás un documento con `_id` — **compáralo visualmente con el `_id` que copiaste en el paso 4: debe ser exactamente el mismo texto**. Ese `_id` compartido es la prueba del vínculo 1:1 entre el ticket bruto y el ticket traducido.

### 2.3 — Comprobar el índice único que evita duplicados (Compass)

1. Sigue dentro de la colección **tickets** → pulsa la pestaña **Indexes** (arriba, junto a Documents).
2. Verás una lista de índices. Busca en la columna **Name** uno llamado exactamente `meshId_1_itsmTicketId_1`, y en la columna correspondiente debe poner **Unique: true** (o aparecer una marca/check de "unique").
3. Para demostrar que funciona: vuelve a Postman y pulsa **Send** otra vez sobre la misma petición del apartado 2.1 (sin cambiar nada, mismo `key: "PM-7P-DEMO-001"`).
4. Verás de nuevo `201 Created` (no un error), y si vuelves a Compass y pulsas **Find** otra vez en `itsm_tickets` y en `tickets` con los mismos filtros de arriba, seguirá habiendo **un único documento** en cada colección, no dos.

Frase: "Bruto y traducido comparten el mismo identificador, y un índice único en base de datos impide que un mismo ticket se duplique aunque llegue repetido."

---

## Punto 3 — Fechas reales `Date` de Mongo, no texto

**Que se prueba:** que las fechas (`createdAt`, `updatedAt`, `startTime`, `endTime`) se guardan
como tipo `Date` real de Mongo, no como texto.
**Para que sirve:** permite ordenar, filtrar y comparar fechas correctamente en consultas futuras,
sin depender de parseos manuales de texto.

**Herramienta: Compass.**

1. Base `integration-service` → colección **tickets** → Documents → mismo filtro de antes: `{ "itsmTicketId": "PM-7P-DEMO-001" }` → Find.
2. Localiza los campos `createdAt` y `updatedAt` en el documento.
3. **Cómo distinguir un `Date` real de un texto en Compass:** un valor `Date` se muestra sin comillas y con un icono de calendario a la izquierda del valor; además, al pasar el cursor por encima, Compass indica el tipo `Date`. Un texto (`String`) se muestra entre comillas y sin ese icono.
4. Confirma que `createdAt` y `updatedAt` aparecen como `Date` (icono de calendario, sin comillas), no como texto entre comillas.
5. Repite el mismo chequeo en la colección **itsm_tickets** (`createdAt`/`updatedAt`) y en **executions** (`startTime`/`endTime`).

Frase: "Los timestamps son fechas reales del tipo `Date` de Mongo, no texto — se pueden ordenar y comparar como fechas."

---

## Punto 4 — `meshId` en todo el contexto nuevo

**Que se prueba:** que todo documento nuevo del flujo lleva el campo `meshId` del contexto
operativo activo.
**Para que sirve:** confirma que el servicio ya funciona con el modelo de contexto actual y no
depende de los campos antiguos (`tenantId`/`projectId`/`itsmId`), que quedaron descontinuados.

**Herramienta: Compass.**

1. En cualquiera de las tres colecciones que ya has abierto (`itsm_tickets`, `tickets`, `mappings`), localiza el campo **`meshId`** en el documento.
2. Confirma que el valor es el mismo UUID en las tres colecciones (es el identificador del entorno/contexto operativo).
3. Extra, para el punto 4 de mappings concretamente: base `integration-service` → colección **mappings** → Documents → filtro:

```json
{ "targetField": "content.status", "meshId": "<pega aquí el meshId que copiaste antes>" }
```

4. Verás:

```text
sourceField: fields.status.name
targetField: content.status
transformer: copy
meshId: <el meshId de tu entorno>
```

Frase: "Todo documento nuevo va etiquetado con `meshId`; no aparece `tenantId`, `projectId` ni `itsmId` en ningún sitio del flujo activo."

---

## Punto 5 — La base de datos activa es la correcta

**Que se prueba:** que el servicio, al arrancar, se conecta a la base de datos correcta
(`integration-service`), visible en sus propios logs.
**Para que sirve:** evita el riesgo silencioso de que el servicio escriba en la base equivocada
(por ejemplo la base historica `caf_agents`) sin que nadie lo note.

**Herramienta: Docker Desktop (logs del contenedor).**

Este punto no se ve en Postman ni en Compass — se demuestra en los logs de arranque del servicio.

1. Docker Desktop → **Containers** → haz clic sobre `integration-service-1` → pestaña **Logs**.
2. En el buscador del panel de logs (arriba del todo del panel), escribe: `Mongoose connected`.
3. Verás una línea parecida a esta (la hora cambia, el resto no):

```text
[12:34:56] INFO: Mongoose connected to MongoDB
    database: "integration-service"
```

4. El campo `database` es el nombre real de la base a la que se ha conectado el servicio en el arranque. Confirma que pone **`integration-service`** (todo en minúsculas), no `caf_agents` (esa es la base antigua, solo se usa como origen de lectura en migraciones, nunca para datos nuevos).

**Alternativa por terminal** (PowerShell, desde la raíz del repo), si no quieres usar la interfaz de Docker Desktop:

```powershell
docker compose logs integration-service --tail 100 | Select-String "Mongoose connected"
```

Frase: "El propio log de arranque confirma, sin ambigüedad, que el servicio está conectado a `integration-service`."

---

## Punto 6 — Trazabilidad de qué se notificó al orquestador

**Que se prueba:** que cada ejecucion registra que identificadores se enviaron realmente al
orquestador (`dispatchedExecutionIds`).
**Para que sirve:** deja rastro auditable de que tickets se notificaron de verdad — util para
investigar despues quien se entero de un ticket y quien no.

**Herramienta: Compass.**

1. Base `integration-service` → colección **executions** → Documents → filtro:

```json
{ "ticketList.itsmTicketRef": "PM-7P-DEMO-001" }
```

2. Pulsa **Find**. Verás un documento con estos campos (entre otros):

```text
initiatedBy: prueba-manual-7-puntos
ticketsProcessed: 1
ticketsSucceeded: 1
ticketsFailed: 0
successIntegration: true
ticketList.0.transformedTicketId: <el _id que copiaste en el punto 2.2>
dispatchedExecutionIds: [ "<meshId>:PM-7P-DEMO-001" ]
```

3. El campo clave para este punto es **`dispatchedExecutionIds`**: es una lista con el (o los) `execution_id` que el servicio envió realmente al orquestador. Si está vacía o no existe, es que no se llegó a notificar nada; si contiene el identificador del ticket, queda probado que la notificación se intentó y quedó registrada para poder auditarla después.
4. **Aviso importante:** justo después del `201 Created` de Postman, el campo `successOrchestrator` puede aparecer todavía como `false` o no existir — se actualiza en segundo plano, unos segundos después de responder al usuario. Espera 2-3 segundos y pulsa **Find** otra vez en Compass antes de dar el punto por fallido.

Frase: "Cada ejecución que notifica al orquestador deja registrado qué identificadores se le mandaron realmente — se puede auditar más adelante quién se enteró y quién no."

---

## Punto 7 — Nomenclatura en inglés y camelCase

**Que se prueba:** que los nombres de campos y los mensajes de log del servicio siguen una
convencion unica (ingles, camelCase), sin mezclas de idioma o estilo.
**Para que sirve:** evita confusion y errores de mantenimiento futuro — cualquiera que lea el
codigo o los logs encuentra siempre la misma convencion, sin sorpresas.

**Herramienta: Compass + Docker Desktop (no hace falta abrir código).**

1. En Compass, mira los nombres de campo que ya has visto en los puntos anteriores: `itsmTicketId`, `ticketType`, `meshId`, `dispatchedExecutionIds`, `successOrchestrator`, `ticketsProcessed`, `transformedTicketId`. Todos están en **inglés** y en **camelCase** (sin guiones bajos, sin español).
2. En Docker Desktop → `integration-service-1` → Logs, confirma que los mensajes del servicio están en inglés (por ejemplo `"Mongoose connected to MongoDB"`, no en español).
3. Dato adicional: hasta hace poco existía un log en español (`"Fallo al trazar el postproceso de tickets"`); se cambió a inglés (`"Failed to trace ticket post-processing"`) como parte de este mismo trabajo — ya no queda ningún log de la capa de servicio en español.

Frase: "Nombres de campos y mensajes de log siguen un único idioma y una única convención de escritura: inglés y camelCase, sin mezclas."
 
 ---
 
