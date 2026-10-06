## Context

El catalogo de mappings gobierna la traduccion Jira -> modelo interno. La coleccion real `mappings` es ejecutada por el servicio durante la transformacion del ticket. Por eso no debe mezclarse con informacion documental, campos pendientes, gotchas ni ejemplos.

La coleccion `mapping_catalog_review` sera una proyeccion de revision. Se puede regenerar tantas veces como haga falta, pero Git seguira siendo la fuente de verdad.

## Data Model

La coleccion nueva se llamara:

```text
integration-service.mapping_catalog_review
```

Cada documento tendra un `docType`:

- `field`: una decision de campo del catalogo.
- `model-reference`: una seccion funcional legible.
- `gotcha`: aviso o decision importante del modelo.
- `example-ticket`: ticket completo de ejemplo.

Todos los documentos incluiran:

```json
{
  "docType": "field",
  "meshId": "REVIEW-NOT-OPERATIONAL",
  "contextRef": "pilot-local",
  "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
  "updatedAt": "2026-08-14T00:00:00.000Z"
}
```

### Documento `field`

Ejemplo:

```json
{
  "_id": "field:pilot-local:alta:tipo-de-incidencia",
  "docType": "field",
  "meshId": "REVIEW-NOT-OPERATIONAL",
  "contextRef": "pilot-local",
  "section": "1. Alta de la incidencia",
  "subsection": "1.1 Identificacion y clasificacion",
  "formField": "Tipo de incidencia",
  "sourceField": "fields.issuetype.name",
  "targetField": "ticketType",
  "decision": "confirmed",
  "engineBlocked": false,
  "evidence": {
    "source": "ticket-example | mapping-example",
    "notes": "Cubierto por el mapping actual de tipo de incidencia."
  },
  "futureMapping": {
    "sourceField": "fields.issuetype.name",
    "targetField": "ticketType",
    "transformer": "copy",
    "required": false,
    "description": "Tipo de incidencia.",
    "options": {}
  }
}
```

`futureMapping` representa como quedaria el mapping si una futura tarea aprobada lo carga en `mappings`. No se carga en esta fase.

## Source Files

El generador leera:

- `docs/mappings/contexts/pilot-local/catalog.json`;
- `docs/mappings/contexts/pilot-local/alta-data-matrix.md`;
- `docs/mappings/contexts/pilot-local/solucion-data-matrix.md`;
- `docs/mappings/contexts/pilot-local/impacto-data-matrix.md`;
- `docs/mappings/contexts/pilot-local/imputacion-timeentries.md`;
- `docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md`;
- `docs/mappings/modelo_de_datos_mappeos_nuevos/ejemplo_ticket.json`.

## Generator

Se creara:

```text
docs/mappings/scripts/build-mongo-review-seed.mjs
```

Reglas:

- No estara dentro de `src/`.
- No cambiara el build del servicio.
- No se registrara inicialmente en `package.json`.
- Generara un script `mongosh`, no un JSON para `mongoimport`.
- Imprimira recuentos por `docType`.
- Fallara si detecta `content.statusSp`.
- Fallara si algun documento usa un `meshId` distinto de `REVIEW-NOT-OPERATIONAL`.
- Fallara si faltan ficheros fuente requeridos.

Salida generada:

```text
docs/mappings/evidence/pilot-local/mapping-catalog-review-seed.js
```

El seed usara `bulkWrite` con `updateOne` y `upsert: true`.

## Sanitizacion

Antes de cargar el ejemplo en MongoDB se revisara `ejemplo_ticket.json`.

Reglas:

- No guardar correos reales.
- No guardar personas reales.
- No guardar accountIds reales.
- Si hay duda, reemplazar dominios por `example.invalid` y usar nombres ficticios.
- Mantener la forma tecnica del dato para que el ejemplo siga sirviendo.

## Safety

- `mapping_catalog_review` no sera consumida por el servicio.
- No se usara el `meshId` real.
- No se modificara `mappings`.
- No se usara `drop()`.
- MongoDB sera una proyeccion regenerable; Git sigue siendo la fuente de verdad.

## Compass Demo

Orden recomendado:

1. Abrir `integration-service > mapping_catalog_review > Documents`.
2. Filtrar `{ "docType": "gotcha" }`.
3. Filtrar `{ "docType": "field", "decision": "confirmed" }`.
4. Filtrar `{ "docType": "field", "decision": "pending-validation" }`.
5. Filtrar `{ "docType": "field", "engineBlocked": true }`.
6. Filtrar `{ "docType": "model-reference" }`.
7. Filtrar `{ "docType": "example-ticket" }`.
8. Abrir `itsm_tickets`, `tickets`, `executions` y `mappings` para comparar catalogo documental con flujo real.

## Risks

- Si se copia informacion documental a `mappings`, podria afectar el runtime. Mitigacion: coleccion separada y `meshId` sentinela.
- Si el ejemplo contiene datos personales, no debe cargarse. Mitigacion: sanitizacion bloqueante.
- Si se edita Compass manualmente, se pierde trazabilidad. Mitigacion: Git sigue siendo fuente de verdad y se regenera.
- Si el recuento esperado no coincide, puede haber solapamientos o campos omitidos. Mitigacion: generador con resumen por `docType`.
