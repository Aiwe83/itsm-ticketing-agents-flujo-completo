## Why

El catalogo Jira actual identifica los 27 campos funcionales de `1.- Datos basicos`, pero 23 siguen sin un `sourceField` confirmado. Las respuestas reales de Jira contienen numerosos `customfield_XXXXX`; sin relacionarlos con su nombre y esquema mediante evidencia verificable, cualquier mapping nuevo podria traducir datos incorrectos.

## What Changes

- Crear un diccionario versionado y sanitizado que relacione cada campo funcional con su campo Jira, tipo, ruta de lectura, destino interno y estado de validacion.
- Registrar evidencia procedente de metadata Jira (`names` y `schema`), del listado de campos o de un payload real sanitizado, sin conservar credenciales, datos personales ni URLs internas completas.
- Mantener una decision explicita para los 27 campos: `confirmed`, `pending-validation` o `excluded`.
- Incorporar a `catalog.json` un mapping campo a campo solo cuando el `customfield_XXXXX`, su estructura y su significado funcional esten confirmados.
- Mantener los candidatos pendientes separados de los mappings preparados para una futura carga a MongoDB.
- Conservar `content.status` como destino del estado y mantener los adjuntos fuera de los mappings regulares.
- No modificar `src/`, MongoDB, credenciales ni configuracion de entorno dentro de este cambio.

## Capabilities

### New Capabilities

- `jira-customfield-resolution`: resolucion trazable de campos Jira, incluidos `customfield_XXXXX`, contra los 27 campos de `Datos basicos` antes de convertirlos en mappings definitivos.

### Modified Capabilities

Ninguna. No existe una especificacion canonica previa en `openspec/specs/` para esta capacidad.

## Impact

- Documentacion futura afectada: `docs/mappings/README.md` y el contexto actual bajo `docs/mappings/contexts/pilot-local/`.
- Nuevas evidencias sanitizadas bajo `docs/mappings/evidence/` o una subcarpeta equivalente por contexto.
- Sin cambios en APIs, codigo de aplicacion, dependencias, MongoDB ni colecciones.
- La carga a MongoDB quedara fuera de alcance hasta una tarea posterior expresamente autorizada.
