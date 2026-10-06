## Why

El catalogo de mappings Jira -> modelo interno ya dispone de una base para `Datos basicos`, pero el modelo funcional continua creciendo con las secciones `Alta`, `Solucion`, `Impacto` e `Imputacion`. Esas secciones no se pueden cargar directamente en MongoDB porque mezclan campos Jira estandar, posibles `customfield_XXXXX`, campos derivados, arrays, personas, adjuntos y estructuras que el motor actual de mappings no soporta como colecciones hijas.

Este cambio formaliza como ampliar el catalogo de forma controlada: campo a campo, con evidencia, sin inventar `customfield_*` y separando lo confirmado de lo que aun requiere validacion funcional o tecnica.

## What Changes

- Crear una propuesta OpenSpec documental para ampliar el catalogo de mappings con las secciones `Alta`, `Solucion`, `Impacto` e `Imputacion`.
- Definir que la futura implementacion solo podra afectar a:
  - `docs/mappings/contexts/pilot-local/catalog.json`
  - `docs/mappings/contexts/pilot-local/catalog.md`
  - nuevas matrices humanas por seccion
  - evidencias sanitizadas bajo `docs/mappings/evidence/pilot-local/`
- Establecer que cada mapping debe resolverse individualmente mediante `sourceField`, `targetField`, `transformer`, `required`, `description`, `options` y evidencia.
- Documentar que `timeEntries[]` queda bloqueado para mapping directo porque el motor actual no genera colecciones hijas ni expande arrays complejos hacia documentos derivados.
- Mantener `content.status` como destino correcto de estado y prohibir recuperar `content.statusSp`.
- Mantener los candidatos pendientes fuera de mappings cargables.

## Scope

Incluido en esta fase:

- Artefactos OpenSpec autosuficientes para que la futura aplicacion pueda implementarse sin consultar documentos locales auxiliares.
- Reglas de decision para clasificar campos como `confirmed`, `pending-validation` o `excluded`.
- Diseno de matrices humanas por seccion funcional.
- Delta spec de la capacidad `jira-mapping-catalog`.

Fuera de alcance:

- No se modifica `src/`.
- No se modifica MongoDB.
- No se modifican Docker, `.env`, endpoints, contratos runtime ni `openapi.yaml`.
- No se crean todavia `docs/mappings/contexts/pilot-local/alta-data-matrix.md`, `solucion-data-matrix.md`, `impacto-data-matrix.md` ni `imputacion-timeentries.md`.
- No se carga ningun mapping nuevo en la coleccion Mongo `mappings`.
- No se ejecutan fases de aplicacion, verificacion ni archivado sin autorizacion posterior.

## How

La futura aplicacion debera trabajar por secciones:

1. Preparar evidencias sanitizadas de Jira para los campos de `Alta`, `Solucion`, `Impacto` e `Imputacion`.
2. Crear una matriz humana por seccion donde cada fila represente un campo funcional.
3. Resolver cada campo con una decision explicita:
   - `confirmed`: existe evidencia suficiente y se puede transformar a un mapping cargable.
   - `pending-validation`: el campo parece necesario, pero falta confirmar ID, significado, forma o destino.
   - `excluded`: el campo no debe entrar en el catalogo de mappings regular.
4. Promocionar a `catalog.json` solo los mappings `confirmed`.
5. Mantener campos pendientes y excluidos fuera de mappings cargables, documentados en las matrices.
6. Validar que no se introduce `content.statusSp`, duplicados ambiguos ni `customfield_*` inventados.

## Impact

El impacto es documental y de preparacion. Esta propuesta reduce el riesgo de cargar mappings incorrectos cuando se empiecen a integrar nuevas secciones del modelo funcional. Tambien deja claro donde el motor actual no llega, especialmente en `timeEntries[]`, para evitar una implementacion que parezca completa pero traduzca mal estructuras complejas.

## Validations

El cambio OpenSpec debera poder validarse con:

```powershell
openspec validate completar-catalogo-mappings-alta-solucion-impacto-imputacion --type change --strict
```

La futura aplicacion del catalogo debera validar:

- JSON valido.
- Una decision por cada campo revisado.
- Evidencia obligatoria para cada campo `confirmed`.
- Ningun `targetField: "content.statusSp"`.
- Ningun `customfield_XXXXX` sin evidencia.
- Ningun candidato pendiente dentro de mappings cargables.
- Ningun cambio en `src/`, MongoDB, `.env`, Docker ni `openapi.yaml`.

## Open Questions

- Que campos de `Alta`, `Solucion` e `Impacto` existen realmente como campos Jira independientes y cuales proceden de textos o procesos posteriores.
- Que representacion interna se necesita para personas: identificador, nombre visible, correo o estructura completa.
- Si `Imputacion` debe resolverse en una tarea posterior mediante un motor nuevo para colecciones hijas o mediante otro flujo de persistencia.
- Que evidencias Jira sanitizadas se usaran como batch 2 para confirmar los nuevos `customfield_XXXXX`.
