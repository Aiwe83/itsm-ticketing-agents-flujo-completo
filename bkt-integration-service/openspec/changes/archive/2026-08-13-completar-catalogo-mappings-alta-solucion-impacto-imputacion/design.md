## Context

El catalogo actual se organiza bajo `docs/mappings/contexts/pilot-local/` y usa `catalog.json` como fuente documental futura para mappings compatibles con MongoDB. La siguiente ampliacion funcional incorpora las secciones `Alta`, `Solucion`, `Impacto` e `Imputacion`, pero no todos sus campos pueden convertirse de forma directa en mappings.

La regla principal es mantener trazabilidad: todo campo confirmado debe tener una evidencia real y sanitizada que demuestre de donde sale en Jira, como se lee y a que destino interno se traduce.

## Target Structure

La futura implementacion debera mantener el contexto corto `pilot-local` para evitar rutas largas en Windows y guardar los identificadores reales dentro de los JSON.

```text
docs/mappings/
  README.md
  evidence/
    pilot-local/
      README.md
      batch-2-field-metadata.json
      batch-2-issue-shapes.json
      batch-2-decision-notes.md
  contexts/
    pilot-local/
      catalog.json
      catalog.md
      alta-data-matrix.md
      solucion-data-matrix.md
      impacto-data-matrix.md
      imputacion-timeentries.md
```

`catalog.json` seguira siendo la fuente documental para mappings cargables. Las matrices `.md` seran vistas humanas para explicar decisiones, pendientes y exclusiones.

## Decision States

Cada campo revisado debera quedar en uno de estos estados:

- `confirmed`: se puede convertir en mapping cargable porque tiene evidencia suficiente.
- `pending-validation`: falta evidencia, definicion funcional, ruta de lectura, tipo o destino interno.
- `excluded`: no debe entrar en el catalogo regular porque se genera despues, se procesa por otro flujo o no aplica al payload Jira inicial.

Solo los campos `confirmed` podran aparecer en el array de mappings cargables de `catalog.json`.

## Evidence Rules

Para confirmar un campo se requiere:

1. Identificacion del campo Jira: estandar o `customfield_XXXXX`.
2. Nombre funcional contrastado con el modelo.
3. Forma del dato en payload o metadata: texto, fecha, opcion, usuario, array u objeto.
4. Ruta de lectura concreta, por ejemplo `fields.customfield_12345.value`.
5. Destino interno acordado.
6. Nota breve que explique por que se confirma.

No se permite inventar `customfield_*` a partir de intuicion, posicion visual, nombres parecidos o valores aislados sin metadata.

## Mapping Shape

Los mappings promocionados a `catalog.json` deberan mantener esta forma minima:

```json
{
  "sourceField": "fields.customfield_12345.value",
  "targetField": "content.exampleField",
  "transformer": "copy",
  "required": false,
  "description": "Descripcion funcional del campo",
  "options": {},
  "_evidence": {
    "source": "jira-metadata | sanitized-jira-payload | functional-model",
    "confidence": "confirmed",
    "notes": "Motivo de confirmacion"
  }
}
```

Las propiedades documentales con prefijo `_` no deberan insertarse en MongoDB cuando exista un loader futuro.

## Section Rules

### Alta

La matriz `alta-data-matrix.md` debera separar datos que ya puedan estar cubiertos por `Datos basicos` de nuevos campos propios de alta. Si un campo duplica un destino ya existente, la matriz debera decidir si se reutiliza el mapping, se documenta como duplicado funcional o se deja pendiente.

Campos de persona, empresa, solicitante o responsable no se confirmaran hasta decidir si el modelo interno necesita ID, nombre, correo o estructura completa.

### Solucion

La matriz `solucion-data-matrix.md` debera distinguir:

- campos procedentes de Jira;
- campos generados por procesamiento interno;
- campos libres que pueden venir en descripcion;
- campos de resolucion que podrian no existir en el payload inicial.

No se mapearan diagnosticos, resoluciones generadas posteriormente ni conclusiones creadas por agentes si no proceden del payload Jira inicial.

### Impacto

La matriz `impacto-data-matrix.md` debera tratar con especial cuidado valores de negocio, criticidad, afectacion y ambitos de impacto. Si el campo Jira es un desplegable u objeto, la ruta debera usar `.value` solo cuando la evidencia lo demuestre.

Los arrays de afectados, componentes o ambitos multiples quedaran pendientes si el transformador actual no puede mantener su estructura de forma segura.

### Imputacion

La matriz `imputacion-timeentries.md` debera documentar el bloqueo de `timeEntries[]`.

Motivo del bloqueo: el motor actual de mappings transforma campos del payload hacia un documento final, pero no genera colecciones hijas ni expande arrays complejos hacia entradas independientes de imputacion. Por tanto:

- `timeEntries[]` no se cargara como mapping regular.
- No se crearan mappings parciales que aparenten soporte completo.
- La seccion quedara documentada como pendiente de motor, endpoint o flujo especifico.
- Si existe informacion simple resumible, podra documentarse como candidato, pero no como mapping cargable sin decision explicita.

## Naming Rules

- Mantener nombres tecnicos en ingles y `camelCase`.
- Mantener `content.status` como destino de estado.
- Prohibido introducir `content.statusSp`.
- No mezclar nombres funcionales en castellano dentro de claves runtime.
- Las matrices humanas pueden usar etiquetas en castellano para que negocio las entienda.

## Validation Rules

La futura aplicacion debera comprobar:

- `catalog.json` es JSON valido.
- No hay `targetField` duplicado sin decision explicita.
- No hay `targetField: "content.statusSp"`.
- Todo mapping confirmado tiene evidencia.
- Todo `customfield_XXXXX` confirmado aparece en evidencia sanitizada.
- Los candidatos pendientes no aparecen en mappings cargables.
- `timeEntries[]` queda documentado como bloqueado o fuera de alcance.
- No hay cambios en `src/`, MongoDB, Docker, `.env` ni `openapi.yaml`.

## Risks

- Confirmar customfields con evidencia insuficiente podria traducir datos incorrectos.
- Mezclar pendientes con mappings cargables podria provocar una carga accidental a MongoDB.
- Tratar `timeEntries[]` como mapping simple ocultaria una limitacion real del motor actual.
- Resolver campos de persona sin acuerdo funcional podria exponer datos no necesarios o usar identificadores incorrectos.
