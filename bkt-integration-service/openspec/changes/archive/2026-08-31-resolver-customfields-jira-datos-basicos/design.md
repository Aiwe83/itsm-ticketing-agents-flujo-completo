## Context

La seccion `1.- Datos basicos` de `Formulario_intervenciones_Jira_v07072026_Felix.docx` contiene 27 campos funcionales. El catalogo actual solo relaciona directamente tres de ellos con campos Jira estandar: tipo de incidencia, referencia y descripcion. Adjuntos esta excluido del mapping regular; los otros 23 campos necesitan confirmar su origen.

Las respuestas observadas de Jira contienen muchos campos `customfield_XXXXX`, normalmente con valores `null`, texto directo, objetos con `value`, usuarios, fechas o arrays. Un ejemplo aislado permite conocer la forma del valor, pero no su significado funcional. Para resolver un ID hacen falta los metadatos `names/schema`, el listado de campos Jira o una evidencia funcional equivalente.

Este cambio es documental. Prepara una futura revision reproducible y no accede a Jira, no modifica el servicio y no carga mappings en MongoDB.

## Goals / Non-Goals

**Goals:**

- Mantener un diccionario trazable de los 27 campos de `Datos basicos` por contexto Jira.
- Distinguir con claridad campos `confirmed`, `pending-validation` y `excluded`.
- Definir cuando un `customfield_XXXXX` tiene evidencia suficiente para convertirse en mapping.
- Documentar la ruta de lectura correcta segun la forma real del campo Jira.
- Mantener separadas las evidencias documentales y las entradas Mongo-compatibles de `catalog.json`.
- Proteger credenciales, identidades y datos internos al conservar evidencias.

**Non-Goals:**

- No modificar `src/`, modelos, validadores, servicios ni endpoints.
- No consultar Jira automaticamente desde el repositorio.
- No cargar, actualizar ni borrar datos de MongoDB.
- No crear mappings para IDs inferidos solo por el valor observado.
- No decidir el formato interno de campos de persona sin confirmar si se necesita ID, nombre o correo.
- No parsear respuestas funcionales embebidas dentro de `fields.description`.
- No incluir adjuntos, diagnostico o resolucion en mappings regulares.

## Decisions

### 1. Diccionario de evidencia separado del catalogo

La futura aplicacion creara esta estructura por contexto:

```text
docs/mappings/
  README.md
  evidence/
    pilot-local/
      README.md
      jira-field-dictionary.json
      sanitized-field-metadata.json
      sanitized-issue-shapes.json
  contexts/
    pilot-local/
      catalog.json
      catalog.md
      basic-data-matrix.md
```

Los identificadores completos del contexto se conservan dentro de los JSON. Las carpetas usan el alias corto `pilot-local` para evitar rutas demasiado largas en Windows.

`jira-field-dictionary.json` contendra las 27 decisiones funcionales. Los ficheros `sanitized-*` conservaran solo los fragmentos estructurales necesarios para justificar esas decisiones. `catalog.json` seguira conteniendo exclusivamente mappings listos para una futura transformacion a documentos Mongo.

Alternativa descartada: guardar candidatos pendientes dentro de `mappings`. Mezclaria hipotesis con mappings consumibles y aumentaria el riesgo de carga accidental.

### 2. Formato del diccionario

Cada entrada tendra esta forma minima:

```json
{
  "order": 1,
  "formField": "Pais afectado",
  "jiraFieldId": null,
  "jiraFieldName": null,
  "jiraType": null,
  "readPath": null,
  "targetField": "content.affectedCountry",
  "decision": "pending-validation",
  "evidence": [],
  "notes": "Falta metadata Jira y confirmacion funcional."
}
```

Una entrada `confirmed` debera incluir `jiraFieldId`, `jiraFieldName`, `jiraType`, `readPath`, `targetField` y al menos una evidencia. Una entrada `excluded` podra omitir origen y destino de mapping, pero debera explicar la exclusion.

### 3. Inventario funcional obligatorio

El diccionario incluira exactamente estas 27 decisiones, en este orden:

1. Pais afectado
2. Tipo de incidencia
3. Solicitante
4. Empresa
5. Departamento
6. Centro
7. Direccion general
8. Fecha / hora apertura
9. Compromiso de resolucion
10. Aplicacion afectada
11. Entorno
12. Responsable de la empresa externa
13. En garantia de proyecto
14. Codigo proyecto
15. Es Urgente
16. Motivo de urgencia
17. Grado de urgencia
18. Referencia
19. Descripcion
20. Resultado obtenido
21. Resultado esperado
22. Reproduccion del problema
23. Mensaje de error literal
24. Codigo de error
25. Adjuntos
26. Hora del incidente
27. Usuario o numero de persona afectada

El estado inicial esperado es: tres `confirmed` por mapping directo (`Tipo de incidencia`, `Referencia`, `Descripcion`), un `excluded` (`Adjuntos`) y 23 `pending-validation`. Una evidencia posterior puede cambiar esos estados sin alterar el inventario.

### 4. Evidencia necesaria para confirmar un campo

Un campo solo pasara a `confirmed` cuando se cumplan las cuatro condiciones:

1. Jira identifica el campo mediante `names/schema`, el listado de campos o metadata equivalente.
2. Un payload real sanitizado confirma la forma del valor.
3. El significado coincide con el campo funcional del formulario.
4. El destino interno y su representacion han sido aceptados.

Fuentes validas de evidencia:

- respuesta de issue con expansion `names` y `schema`;
- listado de campos de Jira;
- metadata de creacion del proyecto/tipo de incidencia;
- payload real sanitizado unido a una confirmacion funcional.

Las capturas que muestran `customfield_10147.value = "Temporales"` y `customfield_10152.value = "SI"` sirven como candidatos de forma, pero no identifican por si solas el campo funcional. Permaneceran pendientes hasta obtener su nombre o confirmacion equivalente.

### 5. Reglas para construir `readPath`

- Texto plano: `fields.customfield_XXXXX`.
- Opcion simple: `fields.customfield_XXXXX.value`.
- Fecha: ruta directa, con formato y zona horaria documentados en `notes`.
- Usuario: no confirmar el destino hasta decidir si el consumidor necesita `accountId`, `displayName` o `emailAddress`.
- Array: documentar la forma de cada elemento y elegir `copy` o `mapToString` solo si el transformador existente soporta el resultado esperado.
- Campo estandar: usar su ruta Jira estable, por ejemplo `fields.created` o `fields.reporter.accountId`, solo tras confirmar la decision funcional.

El contenido de `fields.description` puede incluir respuestas de varios apartados en un unico texto. Eso no demuestra que existan customfields separados y no autoriza a crear mappings individuales ni una regla de parsing dentro de este cambio.

### 6. Sanitizacion

Antes de versionar evidencia se eliminaran o sustituiran:

- tokens, cookies, cabeceras de autorizacion y secretos;
- nombres, correos, account IDs y comentarios de personas reales;
- URLs internas completas y nombres internos no necesarios;
- descripcion libre y adjuntos, salvo ejemplos sinteticos sin datos reales.

Se conservaran unicamente IDs de campos, nombres funcionales aprobados, tipos, estructuras y valores sinteticos necesarios para reproducir la decision.

### 7. Promocion al catalogo

Cuando una entrada se confirme, se anadira a `catalog.json` como mapping individual con `sourceField`, `targetField`, `transformer`, `required`, `description`, `options`, contexto y `_evidence`. Los campos pendientes o excluidos no apareceran en `mappings`.

Se mantiene `fields.status.name -> content.status`; queda prohibido `content.statusSp`. `fields.attachment` continua fuera del catalogo regular y se procesa hacia `content.attachedDocuments` por el flujo especializado.

## Risks / Trade-offs

- [Metadata de otro proyecto Jira] -> Registrar siempre contexto y tipo de incidencia; no reutilizar IDs entre contextos sin evidencia.
- [Valor ambiguo] -> Un valor como `SI` o `Temporales` no confirma el significado; exigir nombre y esquema.
- [Datos personales en evidencias] -> Sanitizar y revisar los ficheros antes de versionarlos.
- [Campos calculados] -> Marcar SLA, empresa o departamento como pendientes si se derivan de reglas y no llegan en el payload.
- [Descripcion compuesta] -> No convertir fragmentos de texto libre en mappings sin una especificacion separada de parsing.
- [Destino interno prematuro] -> Mantener el candidato pendiente cuando el modelo consumidor no este acordado.
- [Catalogo y diccionario divergentes] -> Validar que todo mapping confirmado tenga una entrada confirmada en el diccionario y que ningun pendiente figure en `mappings`.

## Migration Plan

1. Crear la carpeta de evidencia del contexto sin copiar payloads sin sanitizar.
2. Construir las 27 entradas del diccionario con el estado inicial.
3. Incorporar metadata sanitizada de Jira y resolver campos uno a uno.
4. Actualizar `basic-data-matrix.md` y `catalog.md` con las decisiones justificadas.
5. Promover a `catalog.json` solo mappings confirmados.
6. Validar JSON, cobertura, ausencia de secretos, ausencia de `content.statusSp` y separación de pendientes.

Rollback: revertir exclusivamente los cambios documentales de `docs/mappings`. No existe rollback de codigo o base de datos porque no se modifican.

## Open Questions

- El issue y los metadatos disponibles pertenecen exactamente al mismo `tenantId/projectId/itsmId` del catalogo actual.
- Que campo funcional representa `customfield_10147` y si el valor `Temporales` corresponde a entorno, aplicacion u otro catalogo.
- Que campo funcional representa `customfield_10152` y si el valor `SI` es un booleano de garantia, urgencia u otra decision.
- Que campos se calculan por SLA o por datos del solicitante y no deben mapearse directamente.
- Para los campos de persona, que identificador consume el sistema interno.
- Si resultado, reproduccion y errores existen como campos separados o forman parte estructurada de `description`.
