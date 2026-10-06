## Context

El proyecto ya dispone de un catalogo documental de mappings Jira -> modelo interno en `docs/mappings/`, con contexto `pilot-local` y una primera cobertura de Datos basicos. El nuevo modelo funcional amplia el analisis con Alta, Solucion, Impacto e Imputacion.

Los ficheros de referencia de esta fase son documentales. `ejemplo_ticket.json` describe la forma objetivo del ticket interno, pero no demuestra por si mismo desde que campo Jira sale cada dato. Por eso, la ampliacion del catalogo debe empezar con evidencia Jira sanitizada antes de confirmar mappings.

El motor actual de mappings trabaja bien con campos escalares y transformadores existentes, pero no resuelve fan-out de arrays ni colecciones hijas complejas. Por eso `timeEntries[]` y arrays anidados similares deben documentarse como bloqueados por motor hasta que exista una implementacion dedicada.

## Goals / Non-Goals

**Goals:**

- Convertir Alta, Solucion, Impacto e Imputacion en decisiones campo a campo.
- Mantener `docs/mappings/contexts/pilot-local/catalog.json` como futura fuente documental de mappings cargables.
- Separar mappings confirmados, candidatos pendientes, campos excluidos y campos bloqueados por motor.
- Documentar evidencias sanitizadas en `docs/mappings/evidence/pilot-local/`.
- Mantener una vista humana clara por seccion para revision funcional.
- Evitar `customfield_*` inventados y `content.statusSp`.
- Dejar claro que Imputacion no se puede cargar como mapping normal mientras dependa de `timeEntries[]`.

**Non-Goals:**

- No modificar `src/`.
- No cargar ni modificar MongoDB.
- No cambiar endpoints, Docker, variables de entorno ni `openapi.yaml`.
- No crear un script automatico de carga a MongoDB.
- No resolver en esta fase el modelo tecnico definitivo de personas, arrays o colecciones hijas.

## Decisions

### Decision 1: Evidencia antes de clasificacion

Cada campo de Alta, Solucion, Impacto e Imputacion debe incluir una decision de evidencia: disponible o no disponible. Solo un campo con evidencia Jira real puede pasar a `confirmed`.

Alternativa descartada: usar `ejemplo_ticket.json` como prueba suficiente. Se descarta porque ese fichero representa el destino interno, no el origen Jira.

### Decision 2: Un contexto documental unico

La ampliacion continua en `pilot-local`. Los identificadores de contexto quedan dentro de los documentos de catalogo y evidencia, no en nombres largos de carpeta.

Alternativa descartada: crear carpetas por cada combinacion larga de identificadores. Se descarta para mantener rutas cortas y legibles.

### Decision 3: Matrices humanas por seccion

La futura aplicacion debe crear o mantener:

- `alta-data-matrix.md`
- `solucion-data-matrix.md`
- `impacto-data-matrix.md`
- `imputacion-timeentries.md`

Las tres primeras son matrices de campos. La ultima es una nota de diseno porque Imputacion depende de `timeEntries[]` y no puede representarse como mapping plano sin una mejora del motor.

### Decision 4: `engine-blocked` como marca independiente

Un campo puede estar pendiente por falta de evidencia y, ademas, bloqueado por motor. Para no mezclar ambos motivos se usara `engine-blocked: true` en candidatos que el motor actual no puede procesar como mapping normal.

Alternativa descartada: clasificar esos campos solo como `pending-validation`. Se descarta porque ocultaria una limitacion tecnica real.

### Decision 5: Carga a MongoDB fuera de alcance

Este cambio deja preparado el catalogo para una futura carga controlada, pero no ejecuta esa carga. Los campos documentales, evidencias y candidatos pendientes no deben convertirse en documentos de la coleccion `mappings`.

## Risks / Trade-offs

- Customfield incorrecto -> Mitigacion: no confirmar ningun `customfield_*` sin payload o metadata Jira sanitizada.
- Campo confirmado pero traduccion incorrecta -> Mitigacion: antes de promoverlo, verificarlo contra un payload Jira sanitizado con la misma logica de transformacion usada por el servicio.
- Exceso de pendientes -> Mitigacion: documentar que falta evidencia; no forzar mappings sin prueba.
- Arrays complejos mal representados -> Mitigacion: usar `engine-blocked` y documentar el bloqueo de `timeEntries[]`.
- Duplicados de destino -> Mitigacion: validar que no haya `targetField` duplicado sin decision explicita.
- Confusion entre destino interno y origen Jira -> Mitigacion: separar claramente `ejemplo_ticket.json` como modelo objetivo y evidencias Jira como fuente de `sourceField`.

## Migration Plan

Esta fase no tiene migracion runtime.

Cuando se autorice la aplicacion futura:

1. Revisar evidencias disponibles por campo.
2. Clasificar Alta y hacer un checkpoint.
3. Clasificar Solucion e Impacto.
4. Documentar Imputacion como bloqueo de motor.
5. Actualizar `catalog.json`, `catalog.md`, matrices y evidencia.
6. Validar JSON, duplicados, ausencia de `content.statusSp` y ausencia de `customfield_*` inventados.

Rollback: revertir solo los documentos creados o modificados bajo `docs/mappings/` y los artefactos OpenSpec del cambio.

## Open Questions

- Para campos de persona, falta decidir si el destino debe guardar `accountId`, `displayName`, email o una estructura compuesta.
- Para arrays anidados, falta decidir si se ampliara el motor de mappings o si se usara un servicio especifico.
- Para algunos campos funcionales, falta evidencia Jira real para resolver el `sourceField`.
- La carga a MongoDB debera definirse en una tarea separada con modo seco y confirmacion explicita.
