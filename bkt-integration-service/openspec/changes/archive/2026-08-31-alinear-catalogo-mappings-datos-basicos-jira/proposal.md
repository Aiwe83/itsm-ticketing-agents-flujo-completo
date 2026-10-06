## Why

El catalogo de mappings Jira ya existe como documentacion versionada, pero su primera version se construyo principalmente desde ejemplos tecnicos de ticket, mappings y ticket traducido.

Ese punto de partida es util, pero queda incompleto frente al formulario funcional real de intervenciones Jira. La seccion `1.- Datos basicos` describe 27 campos funcionales que negocio espera considerar en el intake.

El catalogo actual solo cubre de forma directa tres campos de esa seccion:

- `Tipo de incidencia`
- `Referencia`
- `Descripcion`

Antes de cargar nuevos mappings en MongoDB o seguir ampliando el flujo, hay que convertir esa diferencia en una propuesta controlada: que campos ya estan cubiertos, que campos faltan, cuales parecen `customfield_*`, cuales son calculados o parametrizados y cuales no deben tratarse como mapping normal.

## What Changes

- Mantener este cambio como OpenSpec `spec-driven`.
- Alinear el catalogo de mappings con los 27 campos de `1.- Datos basicos`.
- Mantener la disciplina de un mapping por campo.
- Evitar mappings genericos del bloque completo `fields`.
- Documentar los campos pendientes sin inventar IDs `customfield_*`.
- Anotar que `fields.issuetype.name -> ticketType` queda confirmado, pero debe recoger que el formulario define un desplegable cerrado.
- Documentar la discrepancia entre `fields.priority.name -> content.severityLevel` y los campos funcionales `Es Urgente` / `Grado de urgencia`.
- Mantener `content.status` como destino correcto del estado, sin recuperar `content.statusSp`.
- Mantener los adjuntos fuera del catalogo de mappings regulares porque se procesan mediante la logica de adjuntos hacia `content.attachedDocuments`.

## Scope

Esta propuesta cubre solo la alineacion documental del catalogo de mappings con `Datos basicos`.

Incluye:

- La matriz de los 27 campos funcionales.
- Las decisiones por campo: `mapped`, `pending-validation`, `derived`, `parametrized` o `excluded`.
- Las reglas para actualizar `docs/mappings` en una aplicacion futura.
- La advertencia sobre prioridad Jira frente a urgencia funcional.
- Las validaciones que debera cumplir la futura aplicacion.

## Out Of Scope

- No modificar `src/`.
- No modificar MongoDB.
- No crear ni modificar colecciones.
- No cargar mappings en la coleccion `mappings`.
- No consultar Jira desde esta fase.
- No inventar `customfield_*`.
- No tocar credenciales ni `.env`.
- No resolver la deuda tecnica general del proyecto en este cambio.
- No ejecutar `/opsx-apply` hasta autorizacion explicita.
- No ejecutar `/opsx-verify`.

## Impact

Artefactos OpenSpec de esta propuesta:

- `openspec/changes/alinear-catalogo-mappings-datos-basicos-jira/.openspec.yaml`
- `openspec/changes/alinear-catalogo-mappings-datos-basicos-jira/proposal.md`
- `openspec/changes/alinear-catalogo-mappings-datos-basicos-jira/design.md`
- `openspec/changes/alinear-catalogo-mappings-datos-basicos-jira/tasks.md`
- `openspec/changes/alinear-catalogo-mappings-datos-basicos-jira/specs/jira-mapping-catalog/spec.md`

Archivos candidatos para una aplicacion futura:

- `docs/mappings/README.md`
- `docs/mappings/contexts/pilot-local/catalog.json`
- `docs/mappings/contexts/pilot-local/catalog.md`
- `docs/mappings/contexts/pilot-local/basic-data-matrix.md`

## Validation

La propuesta queda correcta si:

- El OpenSpec identifica los 27 campos reales de `1.- Datos basicos`.
- Solo tres campos quedan como cubiertos directamente por el catalogo actual.
- Los demas campos quedan como pendientes, derivados, parametrizados o excluidos segun corresponda.
- No aparece ningun `customfield_*` inventado.
- No se recupera `content.statusSp`.
- Los adjuntos quedan fuera de mappings regulares.
- La aplicacion futura queda pendiente hasta autorizacion.
- No se modifica codigo ni MongoDB en esta fase.

## Open Questions

- V1: El formulario funcional pertenece al mismo contexto `tenantId/projectId/itsmId` del catalogo actual o requiere una carpeta de contexto nueva.
- V2: Los 24 campos no cubiertos llegan como `customfield_*` y cuales son sus IDs reales.
- V3: `fields.priority.name -> content.severityLevel` equivale realmente a alguna decision funcional de urgencia o debe mantenerse como prioridad tecnica separada.
- V4: `Responsable de la empresa externa` coincide con `fields.assignee` o es otro campo/regla.
- V5: `Compromiso de resolucion` llega en el payload Jira o se calcula por SLA fuera del payload.
- V6: Los campos de resultado, reproduccion, mensaje literal y codigo de error llegan separados o dentro de `fields.description`.
- V7: Los adjuntos de la seccion `Datos basicos` y posibles adjuntos de otras secciones llegan todos como `fields.attachment` o como campos distintos.
