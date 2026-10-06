## Context

El flujo actual recibe un ticket Jira por `POST /api/v1/issues`, guarda el bruto en `itsm_tickets`, consulta `mappings` por `tenantId`, `projectId` e `itsmId`, transforma `sourceField` hacia `targetField`, guarda el resultado en `tickets` y deja trazabilidad en `executions`.

El problema no esta en el mecanismo de traduccion, sino en la falta de un catalogo versionado que diga que mappings tienen sentido y con que evidencia.

## Decision

Se documenta un catalogo de mappings en `docs/mappings/`, agrupado por contexto:

```text
docs/
  mappings/
    README.md
    contexts/
      pilot-local/
        catalog.json
        catalog.md
```

Los identificadores completos del contexto se guardan dentro de los JSON. La carpeta usa un alias corto para evitar rutas demasiado largas en Windows.

`catalog.json` sera la fuente de verdad futura para una carga controlada. `catalog.md` sera solo una vista humana resumida para facilitar revisiones.

## Catalog JSON Shape

Cada mapping del catalogo tendra este formato minimo:

```json
{
  "sourceField": "fields.summary",
  "targetField": "content.title",
  "transformer": "copy",
  "required": true,
  "description": "Titulo visible del ticket",
  "options": {},
  "_evidence": {
    "source": "ticket-example | mapping-example | translated-ticket-example",
    "confidence": "confirmed | pending-validation",
    "notes": "Texto corto de revision"
  }
}
```

Las claves con prefijo `_` son documentales. Un futuro proceso de carga debera descartarlas antes de insertar en MongoDB.

## Mapping Rules

- Cada campo relevante tendra su propio mapping.
- No se permitira un mapping generico de toda la seccion `fields`.
- `sourceField`, `targetField`, `transformer`, `required`, `description` y `options` seran obligatorios en cada entrada.
- Los mappings se agruparan por `tenantId`, `projectId` e `itsmId`.
- Los campos sin evidencia suficiente se marcaran como `pending-validation`.
- El estado destino sera `content.status`.
- No se recuperara `content.statusSp`.
- No se mapearan campos que sean resultado posterior de procesamiento interno si no proceden del payload Jira inicial.

## Evidence Rules

La evidencia de cada mapping debera indicar de donde sale la decision:

- `ticket-example`: aparece en un ejemplo de ticket Jira en bruto.
- `mapping-example`: aparece en un ejemplo de documento `mappings`.
- `translated-ticket-example`: aparece en un ejemplo de ticket interno traducido.

La confianza sera:

- `confirmed`: hay evidencia suficiente para proponer el mapping.
- `pending-validation`: el campo parece candidato, pero necesita confirmacion con un payload Jira real o con quien consume el ticket traducido.

## Future Loader Guidance

Una implementacion posterior, en otro cambio separado, podra construir un script de carga hacia MongoDB.

Ese script futuro debera:

- Leer `catalog.json`.
- Validar que cada mapping contiene los campos obligatorios.
- Descartar claves documentales con prefijo `_`.
- Insertar o actualizar documentos compatibles con el modelo `Mapping`.
- No depender de parsear Markdown.

## Risks

- Algunos ejemplos disponibles pueden proceder de tickets ya procesados, no de intake Jira fresco.
- Puede haber campos Jira cuya forma real cambie respecto al ejemplo, como `components`, `comments` o `assignee`.
- Si dos mappings escriben el mismo `targetField`, el orden de aplicacion debe decidirse antes de cargar en Mongo.
- Campos internos como diagnostico o resolucion pueden confundirse con datos de entrada, aunque realmente los genere un procesamiento posterior.

## Rollback

Como esta fase solo define OpenSpec, el rollback consiste en eliminar el cambio `openspec/changes/catalogo-mappings-jira-campo-a-campo/`. No hay migracion ni cambios de runtime que revertir.
