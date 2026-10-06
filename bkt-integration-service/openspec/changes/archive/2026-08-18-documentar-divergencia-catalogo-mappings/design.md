## Context

`docs/mappings/contexts/pilot-local/catalog.json` es la fuente documental versionada del catalogo
de mappings Jira -> modelo interno (capacidad `jira-mapping-catalog`). La coleccion `mappings` en
MongoDB es la fuente operativa real que usa `POST /api/v1/issues`. Ambas deberian coincidir para
los campos `confirmed`, pero una comprobacion en vivo (2026-08-17) encontro 4 mappings
(`fields.assignee.accountId/emailAddress/displayName`, `fields.components`) cargados en Mongo sin
estar reflejados como tal en `catalog.json` — siguen `pending-validation` porque la subruta de
persona a usar y la forma de `components` no estan confirmadas por negocio.

Por separado, la coleccion documental `mapping_catalog_review` (vista de solo revision de los 163
campos del catalogo funcional) estuvo a punto de eliminarse por confundirse con datos de prueba
desechables.

## Goals / Non-Goals

**Goals:**

- Dejar constancia explicita, en `catalog.json` y en la documentacion del repositorio, de la
  divergencia real entre lo clasificado en el catalogo y lo cargado en Mongo.
- Corregir los recuentos de campos operativos que estaban desactualizados en la documentacion.
- Anadir un requisito de spec que impida que una divergencia similar quede sin documentar en el
  futuro.
- Dejar claro, en la documentacion del proyecto, que `mapping_catalog_review` no es desechable.

**Non-Goals:**

- No se implementa el pipeline `mappings:dry-run`/`mappings:apply` (cubierto por el change
  separado `operacionalizar-catalogo-mappings`, sin solapamiento).
- No se promueve ningun mapping de `pending-validation` a `confirmed`. La ambiguedad de subruta de
  `assignee` y la forma de `components` siguen sin resolver — resolverla exige decision de
  negocio, no es parte de este change.
- No se modifica la coleccion `mappings` ni `mapping_catalog_review` en MongoDB.
- No se toca `src/`, `openapi.yaml`, ni ningun contrato o schema de runtime.

## Decisions

- **Formalizar retroactivamente, no revertir y rehacer.** El trabajo documental ya estaba aplicado
  en el arbol de trabajo antes de crear este change. En vez de deshacerlo para "hacerlo bien" via
  `/opsx:apply`, este change documenta lo ya escrito con trazabilidad OpenSpec — evita reescribir
  contenido correcto solo para cumplir el orden formal de fases.
- **Usar el schema `spec-driven`, no `quick-fix`.** El repo solo tiene `spec-driven` registrado
  (`openspec new change --schema quick-fix` fallo con `Schema 'quick-fix' not found`). Se evaluo en
  fase de exploracion que `quick-fix` habria encajado mejor por el tamano del cambio, pero no esta
  disponible en este repo.
- **Extender `jira-mapping-catalog` en vez de crear una capacidad nueva.** La divergencia y la
  naturaleza de `mapping_catalog_review` son comportamiento del mismo catalogo ya especificado en
  esa capacidad (requisitos existentes sobre `mapping_catalog_review` como proyeccion de revision).
  Anadir una capacidad nueva solo para dos requisitos habria fragmentado la spec sin necesidad.

## Risks / Trade-offs

- **[Riesgo] El nuevo requisito de "documentar divergencias" es dificil de verificar
  automaticamente** (no hay ningun test que compare `catalog.json` contra Mongo real hoy) →
  **Mitigacion**: el requisito exige documentacion explicita, verificable por lectura humana de
  `catalog.json` y los README afectados; una verificacion automatica queda fuera de alcance y
  pertenece al pipeline de `operacionalizar-catalogo-mappings` si se decide construir esa
  comparacion en codigo.
- **[Riesgo] Formalizar trabajo ya aplicado puede sentar el precedente de saltarse el orden
  propose -> apply** → **Mitigacion**: este caso es explicito y documentado (ver Decisions); no se
  usa como patron general, y `tasks.md` se marca completado reflejando el estado real en vez de
  fingir trabajo pendiente.

## Migration Plan

No aplica — no hay migracion de datos ni despliegue. Los 6 ficheros ya estan en el arbol de trabajo
local, pendientes de commit segun decida el usuario.

## Open Questions

Ninguna abierta por este change. La pregunta de fondo (que subruta usar para `assignee`, que forma
tiene `components`) sigue abierta pero es responsabilidad de negocio, no de este change — queda
registrada en `catalog.json` (`pendingCandidates`) y en el requisito nuevo de este change, no aqui.
