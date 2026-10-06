# Catalogo de mappings Jira

Esta carpeta documenta los mappings Jira -> ticket interno por `meshId`.

La idea es separar tres cosas:

- Evidencia: informacion sanitizada que ayuda a entender que envia Jira.
- Candidatos: campos que parecen utiles, pero aun no estan confirmados.
- Mappings consumibles: campos ya confirmados y preparados para una futura carga en MongoDB.

La fuente de verdad sigue siendo Git. Para facilitar la demo se puede regenerar una coleccion documental en MongoDB llamada `mapping_catalog_review`, pero no se modifica la coleccion operativa `mappings` ni se toca codigo de aplicacion.

## Relacion con los datos de entrada

Los ficheros recibidos en `context_para_el_proyecto/datos_para_crear_proyecto` son material bruto de referencia. Sirven para entender el problema, comparar ejemplos y extraer evidencia, pero no se cargan directamente en MongoDB ni se tratan como fuente final.

El flujo correcto es:

1. Revisar el dato bruto.
2. Sanitizar lo que haga falta conservar.
3. Copiar solo la parte util a `docs/mappings/`.
4. Clasificar cada campo con una decision.
5. Usar MongoDB solo para mostrar una vista de revision o para una carga controlada posterior.

Con esto evitamos mezclar ejemplos de trabajo con mappings operativos.

## Fuente funcional

La referencia funcional de entrada es la seccion `1.- Datos basicos` validada para el formulario de intervenciones Jira.

Esa seccion contiene 27 campos. Cada campo debe tener una decision:

- `confirmed`: existe evidencia suficiente para mapearlo.
- `pending-validation`: falta confirmar el campo real de Jira o su significado.
- `excluded`: no se trata como mapping normal.

Estado actual:

- 27 campos revisados.
- 3 campos confirmados: `Tipo de incidencia`, `Referencia` y `Descripcion`.
- 23 campos pendientes de validacion.
- 1 campo excluido: `Adjuntos`.
- 6 mappings consumibles en `catalog.json`, porque tambien se conservan identificadores tecnicos ya necesarios para el flujo (`itsmTicketId`, `ticketType`, `content.issueDescription`, `content.title`, `content.status`, `content.severityLevel`).
- OpenSpec aplicado: `resolver-customfields-jira-datos-basicos`.

## Estructura

```text
docs/
  mappings/
    README.md
    evidence/
      pilot-local/
        README.md
        jira-field-dictionary.json
        sanitized-field-metadata.json
        sanitized-issue-shapes.json
        batch-2-field-metadata.json
        batch-2-issue-shapes.json
        batch-2-decision-notes.md
        mapping-catalog-review-seed.js
        mappings-before.json
        mappings-after.json
    contexts/
      pilot-local/
        catalog.json
        catalog.md
        basic-data-matrix.md
        alta-data-matrix.md
        solucion-data-matrix.md
        impacto-data-matrix.md
        imputacion-timeentries.md
    modelo_de_datos_mappeos_nuevos/
      README.md
      ejemplo_ticket.json
      json_modelo_datos _1.md
    scripts/
      build-mongo-review-seed.mjs
```

La guia de demo manual (`Pruebas_manuales_modelo_funcional_mapping_catalog_review.md`) vive fuera
de `docs/`, en `context_para_el_proyecto/documentos_importantes_para_este_proyecto/` — es material
de trabajo local, no versionado, igual que el resto de guias de esa carpeta.

El identificador operativo del contexto se conserva como `meshId` dentro de los JSON. La carpeta usa `pilot-local` para evitar rutas demasiado largas en Windows.

## Para que sirve cada archivo

- `evidence/.../README.md`: explica de donde puede salir la evidencia y que datos no se pueden guardar.
- `evidence/.../jira-field-dictionary.json`: diccionario campo a campo de los 27 campos de `Datos basicos`.
- `evidence/.../sanitized-field-metadata.json`: metadata o candidatos Jira, siempre sanitizados.
- `evidence/.../sanitized-issue-shapes.json`: formas de payload Jira con valores sinteticos.
- `evidence/.../batch-2-field-metadata.json`: evidencia documental para Alta, Solucion, Impacto e Imputacion.
- `evidence/.../batch-2-issue-shapes.json`: formas sanitizadas de referencia para el segundo bloque funcional.
- `evidence/.../batch-2-decision-notes.md`: reglas de decision usadas en el segundo bloque.
- `evidence/.../mapping-catalog-review-seed.js`: seed idempotente para crear o actualizar la vista documental `mapping_catalog_review`.
- `evidence/.../mappings-before.json` y `mappings-after.json`: comprobacion de que la coleccion operativa `mappings` no cambia.
- `contexts/.../catalog.json`: fuente futura para generar documentos compatibles con la coleccion MongoDB `mappings`.
- `contexts/.../catalog.md`: vista humana resumida del catalogo.
- `contexts/.../basic-data-matrix.md`: matriz sencilla para revisar los 27 campos funcionales.
- `contexts/.../*-data-matrix.md`: matrices humanas por seccion funcional.
- `contexts/.../imputacion-timeentries.md`: nota de diseno para `timeEntries[]`, que no se puede cargar como mapping plano.
- `scripts/build-mongo-review-seed.mjs`: generador documental. No forma parte del runtime del servicio.
- `context_para_el_proyecto/.../Pruebas_manuales_modelo_funcional_mapping_catalog_review.md`: guia
  corta para mostrar el catalogo navegable en MongoDB Compass (local, no versionada).

## Vista documental en MongoDB

La coleccion `mapping_catalog_review` sirve para revisar el catalogo en MongoDB Compass sin mezclarlo con el runtime.

- Base de datos: `integration-service`.
- Coleccion documental: `mapping_catalog_review`.
- Coleccion operativa real: `mappings`.
- Mesh documental: `REVIEW-NOT-OPERATIONAL`.

Esta coleccion permite filtrar por `docType`, `decision` y `engineBlocked`. Si se cambia el catalogo en Git, se regenera el seed y se vuelve a cargar. No se editan mappings reales desde Compass.

Contenido actual (regenerado desde `catalog.json` + `modelo_de_datos_mappeos_nuevos/`):

- 163 documentos `docType: field` (confirmados, pendientes, excluidos y bloqueados por motor).
- 6 documentos `docType: model-reference`: 4 son el texto completo de cada seccion funcional
  (Alta, Solucion, Impacto, Imputacion) con el cuerpo embebido en `body`; los otros 2 son
  punteros a `catalog.json` y a `imputacion-timeentries.md` (solo `sourcePath` + `lineCount`,
  sin `body`, porque no son texto de modelo funcional).
- 14 documentos `docType: gotcha`: 10 son las notas funcionales del modelo (`scope: "functional"`,
  una por vineta de "Notas de la seccion N"), 4 son avisos de diseno de la propia coleccion
  (`scope: "design"`, ej. separacion de colecciones, mesh centinela).
- 1 documento `docType: example-ticket`, sanitizado (dominios `@bankinter.com` sustituidos por
  `@example.invalid` antes de cargar).
- Total: 184 documentos.

Regla de actualizacion: el generador nunca hace `drop()` (upsert por `_id` unicamente). Si un
cambio en el generador renombra el `_id` de un documento (por ejemplo, al pasar de un unico
`model-reference` del modelo completo a uno por seccion), el `_id` antiguo queda huerfano en
Mongo — el upsert no lo toca ni lo borra. Tras cualquier cambio de `_id` en el generador, buscar
huerfanos comparando los `_id` de Mongo contra los del seed regenerado, y borrarlos con
`deleteOne({_id: "..."})` explicito, nunca con `drop()`.

Evidencia `(nativo)` vs `confirmed`: `json_modelo_datos _1.md` marca campos que existen tal cual en
la API de Jira (`reporter`, `creator`, `assignee`, `created`, `resolution`, `resolutiondate`,
`environment`, `id`...), pero eso solo confirma que el campo existe — no la ruta de lectura exacta
ni el destino interno. 9 entradas `pendingCandidates` de `catalog.json` ya llevan esa evidencia
anotada en su `reason` sin cambiar de `decision`; ninguna paso a `confirmed` (mismo criterio que
`batch-2-decision-notes.md`). Dos conflictos quedan marcados sin resolver: `Entorno` tiene ahora dos
posibles origenes Jira (`customfield_10147` vs el campo nativo `fields.environment`), y `Grado de
urgencia` no debe fusionarse con `priority`/`content.severityLevel`, ya confirmado como campo
distinto.

## Cuantos campos estan realmente cargados en Mongo

De los 163 documentos `docType: field`, en la coleccion operativa `mappings` solo hay **10
cargados de verdad**:

- **6** confirmados y documentados en `catalog.json` (`key`, `issuetype`, `description`,
  `summary`, `status`, `priority`).
- **4** cargados tambien, pero sin subir de `pending-validation` en el catalogo
  (`assignee.accountId/emailAddress/displayName`, `components`) — divergencia conocida entre lo
  documentado y lo cargado, anotada en `contexts/pilot-local/catalog.json` (array `notes`).

Los otros 153 no estan en `mappings`:

| Estado | Cantidad | ¿Cargado en `mappings`? |
| --- | --- | --- |
| `confirmed` (9 son duplicados de los 6 de arriba) | 15 | No aportan nada nuevo |
| `pending-validation` | 139 | No, salvo los 4 de la divergencia (incluidos en este bloque) |
| `excluded` (ej. adjuntos, van por su propio flujo) | 8 | No, y no van a estar |
| `blocked` (`timeEntries[]`, el motor no soporta arrays) | 1 | No, hasta rehacer el motor |

El cuello de botella para cargar mas campos no es tecnico: los 139 `pending-validation` necesitan
que negocio confirme su significado y su campo real de Jira antes de poder implementarse. Detalle
completo y metodo de verificacion en `docs/mappings/Cantidad_campos_pendientes_implementacion.md`.

## Pipeline de promocion: `catalog.json` -> MongoDB

Implementado en `src/services/mapping-catalog.service.ts` (grupos 1-4 del change OpenSpec
`operacionalizar-catalogo-mappings`). Compara `catalog.json` contra la coleccion `mappings` real
por identidad logica (`meshId + sourceField + targetField`, nunca por `_id`) para no duplicar
mappings ya cargados a mano con UUID aleatorio.

```bash
pnpm mappings:dry-run
```

Solo lee. Muestra `added` (nuevo en catalogo), `updated` (mismo mapping, metadata distinta),
`unchanged`, `conflicts` (dos documentos Mongo con la misma identidad logica — bloquea cualquier
`apply` mientras existan) y `mongoOnly` (cargado en Mongo pero fuera del catalogo — nunca se borra
solo). Nunca imprime el payload Jira real, solo la forma proyectada del mapping.

```bash
pnpm mappings:apply -- --confirm-version=<catalogVersion>
```

`<catalogVersion>` es el valor exacto del campo `catalogVersion` en `catalog.json` en ese momento
(cambia cada vez que se sube version, por eso no esta fijo en el script `npm` como si esta
`--confirm=integration-service` en `db:migrate-mesh:apply`). Sin ese flag, o con un valor que no
coincide, o si el `context.meshId` del catalogo no coincide con `env.MESH_ID`, o si hay
`conflicts`: no escribe nada.

Al aplicar: si ya existe un documento Mongo con la misma identidad logica, se actualiza ese mismo
documento (`updateOne` sobre su `_id` existente, incluido un UUID aleatorio ya cargado a mano) — no
inserta uno nuevo. Si no existe, inserta uno con `_id = map:<sha256(identidad)>`. Las entradas
`mongoOnly` nunca se borran automaticamente.

Ejemplo de ciclo completo verificado en local: `dry-run` -> `apply --confirm-version=X` -> segundo
`dry-run` sin diferencias (todo `unchanged`).

## Flujo para resolver customfields

1. Partir siempre de los 27 campos de `Datos basicos`.
2. Buscar en Jira metadata de campos: `names`, `schema`, listado de campos o metadata equivalente.
3. Revisar un payload real, pero guardarlo solo si esta sanitizado.
4. Confirmar para cada campo:
   - ID Jira real.
   - Nombre funcional.
   - Tipo de dato.
   - Ruta de lectura.
   - Destino interno.
5. Si falta cualquiera de esas piezas, el campo queda como `pending-validation`.
6. Solo los campos `confirmed` pasan a `catalog.json`.

## Reglas de mapping

- Cada campo relevante debe tener su propio mapping.
- No se debe crear un mapping generico desde `fields` hacia un objeto interno completo.
- Cada mapping debe incluir `sourceField`, `targetField`, `transformer`, `required`, `description` y `options`.
- Los mappings se agrupan por `meshId`.
- Los campos pendientes no se cargan en MongoDB.
- El estado traducido debe ir a `content.status`.
- No se debe recuperar el campo legacy `statusSp`.
- Los campos generados despues del intake, como diagnostico o resolucion, no se mapean desde Jira.
- Las claves con prefijo `_`, como `_evidence`, son documentales y no deben insertarse en MongoDB.
- No se deben inventar identificadores `customfield_*`.
- Los candidatos con `engineBlocked: true` quedan documentados, pero no entran en la lista `mappings`.

## Customfields candidatos

Un `customfield_XXXXX` visto en un payload no basta para crear un mapping. Por ejemplo:

- `customfield_10147.value = "Temporales"` demuestra que el campo parece una opcion, pero no confirma su nombre funcional.
- `customfield_10152.value = "SI"` demuestra que el campo parece una opcion booleana, pero no confirma si corresponde a garantia, urgencia u otra decision.

Esos casos se documentan como candidatos pendientes hasta tener metadata o confirmacion funcional.

Para confirmar un `customfield_XXXXX` hace falta una de estas evidencias:

- metadata Jira donde se vea el nombre funcional del campo;
- confirmacion funcional de negocio;
- payload Jira sanitizado donde el valor y el contexto permitan identificarlo sin duda.

Hasta entonces, el campo queda fuera del array `mappings` de `catalog.json`.

## Prioridad y urgencia

`fields.priority.name -> content.severityLevel` representa prioridad tecnica de Jira.

No se considera equivalente a:

- `Es Urgente`
- `Motivo de urgencia`
- `Grado de urgencia`

Hasta validacion funcional, esos campos siguen como `pending-validation`.

## Adjuntos

Los adjuntos no son mappings regulares. Se procesan por la logica de adjuntos del servicio y terminan como texto plano en `content.attachedDocuments`.

## Campos bloqueados por motor

Algunas partes del modelo no se pueden resolver con mappings planos:

- `modifiedComponents[]`
- `performedTests[]`
- `timeEntries[]`

Estos campos quedan documentados como `engineBlocked: true`. No se cargan en MongoDB como mappings regulares hasta que exista una mejora especifica del motor o un flujo dedicado.
