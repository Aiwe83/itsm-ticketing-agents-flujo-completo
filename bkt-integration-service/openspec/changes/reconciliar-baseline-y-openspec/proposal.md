## Why

El repositorio no dispone todavia de una linea base Git auditable y el cambio `jira-attachment-processing-hardening` mantiene 21 tareas sin marcar aunque parte de su implementacion y sus pruebas ya existen. Antes de ampliar el servicio es necesario reconciliar documentacion, codigo y validaciones sin versionar secretos ni artefactos generados.

## What Changes

- Revisar una a una las tareas pendientes de `jira-attachment-processing-hardening` y completarlas solo cuando exista evidencia verificable en codigo, pruebas o validaciones.
- Preparar una linea base Git limpia con una lista explicita de archivos permitidos y exclusiones para credenciales, temporales, logs, cobertura, builds y salidas generadas.
- Mantener `.env.test` fuera del versionado cuando contenga credenciales y proporcionar solamente ejemplos con valores ficticios.
- Acortar las rutas documentales de mappings que exceden los limites habituales de Windows, conservando los IDs de contexto dentro de los JSON.
- Corregir enlaces documentales rotos y regenerar la documentacion tecnica derivada con alcance limitado a `src`, `docs/mappings` y `openspec`.
- No modificar comportamiento de negocio, contratos HTTP, MongoDB ni datos existentes dentro de este cambio.

## Capabilities

### New Capabilities

- `repository-baseline-governance`: define una linea base reproducible y segura, la reconciliacion de OpenSpec con evidencias y el alcance valido de artefactos tecnicos generados.

### Modified Capabilities

Ninguna. No existe una especificacion canonica previa en `openspec/specs/` para el gobierno de la linea base.

## Impact

- Afecta `.gitignore`, documentacion raiz, rutas bajo `docs/mappings` y los checkboxes del OpenSpec de adjuntos.
- No autoriza un commit ni un push automaticos; el conjunto a versionar se revisara antes de crear la linea base.
- No permite leer, copiar o publicar secretos, payloads internos sin sanitizar ni credenciales de entorno.
