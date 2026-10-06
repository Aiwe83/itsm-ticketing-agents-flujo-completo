## Why

El servicio ya traduce tickets Jira a un formato interno usando documentos de la coleccion `mappings`, pero hoy la definicion de esos mappings vive como ejemplo tecnico y no como catalogo de producto revisable.

Necesitamos formalizar un catalogo campo a campo para saber que datos de Jira se interpretan, a que campo interno llegan y con que nivel de evidencia. Este catalogo debe poder revisarse antes de cargar mappings reales en MongoDB.

## What Changes

- Crear una propuesta versionada para documentar mappings Jira -> ticket interno.
- Crear `docs/mappings/` como carpeta versionada para el catalogo de mappings.
- Crear `catalog.json` como fuente de verdad futura para carga en Mongo.
- Crear `catalog.md` como vista humana resumida para revision.
- Definir el formato minimo de cada mapping, incluyendo `sourceField`, `targetField`, `transformer`, `required`, `description`, `options` y `_evidence`.
- Mantener el analisis campo a campo, sin mappings genericos de bloques completos.
- Exigir que el estado traducido use `content.status`, no `content.statusSp`.
- Separar mappings confirmados de mappings pendientes de validacion.

## Capabilities

### Modified Capabilities

- `jira-mongo-agentes`: documenta el catalogo versionado de mappings que alimentara la traduccion Jira -> ticket interno.

### New Capabilities

- Ninguna en runtime. Este cambio solo formaliza documentacion y contrato de datos para una implementacion posterior.

## Out Of Scope

- No modificar `src/`.
- No crear ni modificar colecciones en MongoDB.
- No cargar mappings reales en MongoDB.
- No crear script de carga de mappings.
- No migrar datos existentes.
- No cambiar el endpoint `POST /api/v1/issues`.
- No recuperar `statusSp`.
- No mapear campos generados posteriormente por procesamiento interno, como diagnosticos o resoluciones que no procedan del payload Jira inicial.

## Impact

- `openspec/changes/catalogo-mappings-jira-campo-a-campo/`
- Carpeta documentada: `docs/mappings/`
- Fuente de verdad futura: `docs/mappings/contexts/pilot-local/catalog.json`
- Vista humana: `docs/mappings/contexts/pilot-local/catalog.md`

## Validation

- Confirmar que el cambio OpenSpec contiene `proposal.md`, `design.md`, `tasks.md` y `specs/jira-mapping-catalog/spec.md`.
- Confirmar que no se modifica `src/`.
- Confirmar que se crea `docs/mappings/` con `README.md`, `catalog.json` y `catalog.md`.
- Confirmar que no se modifica MongoDB.
- Confirmar que el delta spec exige `content.status` y no `content.statusSp`.
- Confirmar que el plan no requiere `/opsx-verify`.
