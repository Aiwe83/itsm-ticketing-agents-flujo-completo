## Why

El catalogo versionado describe los mappings Jira, pero hoy no existe una forma segura, repetible y auditable de comparar ese catalogo con MongoDB ni de aplicar solo las entradas confirmadas. Ademas, aceptar silenciosamente transformadores desconocidos como `copy` puede producir tickets incorrectos sin dejar una senal clara del problema.

## What Changes

- Mantener `catalog.json` como fuente documental versionada de los mappings Jira para cada contexto.
- Exigir una version explicita del catalogo y una clave estable por mapping.
- Incorporar `mappings:dry-run` para validar el catalogo y mostrar diferencias sin escribir en MongoDB.
- Incorporar `mappings:apply` para actualizar MongoDB solo con confirmacion explicita de la version.
- Excluir de la carga candidatos `pending-validation`, campos `excluded` y propiedades documentales como `_evidence`.
- Rechazar destinos obsoletos como `content.statusSp`, mappings generales de toda la seccion `fields`, destinos duplicados no resueltos y transformadores no soportados.
- Limitar los transformadores permitidos a `copy`, `mapToString` y `severity`.
- Registrar la version de mappings utilizada en el ticket traducido y en su ejecucion.
- Mantener los mappings ausentes del catalogo como diferencias informativas; esta fase no los borrara automaticamente de MongoDB.

## Capabilities

### New Capabilities

- `mapping-catalog-deployment`: validacion, comparacion y aplicacion idempotente del catalogo versionado en MongoDB.
- `mapping-version-traceability`: registro de la version concreta de mappings empleada en cada ticket y ejecucion.

### Modified Capabilities

Ninguna. No existen especificaciones canonicas en `openspec/specs/` que deban modificarse.

## Impact

- Documentacion y catalogos bajo `docs/mappings/`.
- Nuevos comandos operativos y scripts compilables para validar y aplicar mappings.
- Repositorio y servicio de mappings, para impedir transformadores desconocidos.
- Modelos de ticket traducido y ejecucion, que incorporaran `mappingVersion` sin migrar documentos historicos.
- MongoDB, solo cuando un operador ejecute conscientemente `mappings:apply` con la version confirmada.
- No cambia el contrato de `POST /api/v1/issues`.
