## Context

La coleccion operativa `mappings` contiene los mappings que ejecuta el servicio al traducir tickets Jira. Esa coleccion no debe mezclarse con decisiones pendientes, notas funcionales, ejemplos ni explicaciones para demo.

La coleccion `mapping_catalog_review` es distinta: sirve para revisar el catalogo en MongoDB Compass. Su fuente de verdad sigue siendo Git, y la coleccion se puede regenerar desde los ficheros versionados.

## Current Gap

La vista documental ya permite revisar campos de mapping, decisiones y ejemplo de ticket. Sin embargo, las referencias al modelo funcional quedaban incompletas para una demo:

- algunos documentos `model-reference` solo indicaban `sourcePath` y `lineCount`;
- las notas funcionales del modelo no estaban representadas como documentos consultables;
- no era facil distinguir una nota de diseno de una nota funcional.

## Proposed Shape

### `model-reference`

Cada seccion funcional del modelo debe representarse como un documento independiente:

```json
{
  "docType": "model-reference",
  "meshId": "REVIEW-NOT-OPERATIONAL",
  "contextRef": "pilot-local",
  "sectionNumber": 1,
  "title": "Alta",
  "sourcePath": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
  "body": "Texto completo sanitizado de la seccion funcional",
  "updatedAt": "2026-08-14T00:00:00.000Z"
}
```

El campo `body` debe permitir explicar la seccion directamente desde Compass.

### `gotcha`

Las notas deben distinguir su origen mediante `scope`:

```json
{
  "docType": "gotcha",
  "scope": "functional",
  "meshId": "REVIEW-NOT-OPERATIONAL",
  "contextRef": "pilot-local",
  "section": "Alta",
  "title": "Nota funcional",
  "message": "Texto de la nota",
  "sourcePath": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md"
}
```

Valores esperados:

- `scope: "functional"` para notas extraidas del modelo funcional.
- `scope: "design"` para avisos de diseno del catalogo o de la proyeccion.

## Generator Rules

El generador documental debe:

- leer el modelo funcional desde `docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md`;
- partir el contenido por secciones funcionales;
- crear documentos `model-reference` con `body` cuando la seccion tenga texto suficiente;
- crear documentos `gotcha` de tipo funcional para las notas del modelo;
- conservar los `gotcha` de diseno existentes;
- generar `_id` deterministas para permitir `upsert`;
- usar siempre `meshId: "REVIEW-NOT-OPERATIONAL"`;
- fallar si aparece `targetField: "content.statusSp"`;
- no llamar nunca a `drop()`.

## Safety

- `mapping_catalog_review` no es fuente de verdad.
- `mapping_catalog_review` no se carga en runtime.
- `mappings` no debe modificarse en esta tarea.
- La carga futura debe ser idempotente mediante `bulkWrite`, `updateOne` y `upsert: true`.
- Cualquier documento huerfano solo podra eliminarse por `_id` exacto y con autorizacion explicita.

## Manual Demo

La demo debe permitir ensenar en Compass:

1. que existe una coleccion documental separada;
2. que se puede filtrar por `docType: "model-reference"`;
3. que las secciones funcionales tienen `body`;
4. que se puede filtrar por `docType: "gotcha", scope: "functional"`;
5. que la coleccion `mappings` sigue separada;
6. que no se recupera `content.statusSp`.

## Out Of Scope

- No tocar `src/`.
- No tocar Docker.
- No tocar `.env`.
- No tocar `openapi.yaml`.
- No cambiar endpoints.
- No cargar mappings operativos.
- No convertir campos pendientes en confirmados.
- No crear interfaz grafica.
