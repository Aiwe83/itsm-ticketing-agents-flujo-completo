## Why

El catalogo actual de mappings ya cubre el bloque inicial de datos basicos, pero el modelo funcional incorpora nuevas secciones: Alta, Solucion, Impacto e Imputacion. Antes de cargar nada en MongoDB o tocar el flujo de ejecucion, hace falta convertir esas secciones en decisiones campo a campo, con evidencia clara y sin inventar `customfield_*`.

El objetivo de este cambio es dejar preparada una propuesta OpenSpec autosuficiente para ampliar el catalogo documental y que despues pueda implementarse de forma controlada.

## What Changes

- Ampliar el catalogo Jira -> modelo interno con las secciones funcionales Alta, Solucion, Impacto e Imputacion.
- Mantener el contexto `pilot-local` como contexto de trabajo documental.
- Exigir una auditoria previa de evidencia para cada campo antes de marcarlo como `confirmed`.
- Separar claramente campos `confirmed`, `pending-validation`, `excluded` y campos bloqueados por motor mediante `engine-blocked`.
- Documentar que `ejemplo_ticket.json` representa el modelo interno objetivo, no un payload Jira real.
- Definir matrices humanas por seccion para revisar campo funcional, ruta Jira, destino interno, evidencia, estado y motivo.
- Ampliar la evidencia sanitizada en `docs/mappings/evidence/pilot-local/` cuando existan payloads o metadata Jira reales.
- Mantener `catalog.json` como futura fuente documental para mappings cargables en MongoDB, pero sin cargar MongoDB en esta fase.
- Documentar el bloqueo actual de `timeEntries[]` y arrays anidados que no puede resolver el motor declarativo de mappings.
- Mantener `content.status` como destino correcto del estado y prohibir `content.statusSp`.

## Capabilities

### New Capabilities

- Ninguna capacidad runtime nueva. Este cambio es documental y de especificacion.

### Modified Capabilities

- `jira-mapping-catalog`: refina las reglas de ampliacion del catalogo por secciones funcionales, evidencia obligatoria, clasificacion de candidatos y bloqueo explicito de estructuras no soportadas por el motor actual.

## Impact

- Cambios OpenSpec en `openspec/changes/refinar-catalogo-mappings-alta-solucion-impacto-imputacion/`.
- Futura implementacion documental prevista sobre:
  - `docs/mappings/contexts/pilot-local/catalog.json`
  - `docs/mappings/contexts/pilot-local/catalog.md`
  - `docs/mappings/contexts/pilot-local/alta-data-matrix.md`
  - `docs/mappings/contexts/pilot-local/solucion-data-matrix.md`
  - `docs/mappings/contexts/pilot-local/impacto-data-matrix.md`
  - `docs/mappings/contexts/pilot-local/imputacion-timeentries.md`
  - `docs/mappings/evidence/pilot-local/`
  - `docs/mappings/README.md`
- Sin impacto en `src/`, endpoints, Docker, variables de entorno, MongoDB ni `openapi.yaml` durante esta fase.
- La carga real a MongoDB queda fuera de alcance y debera autorizarse como una tarea separada.
