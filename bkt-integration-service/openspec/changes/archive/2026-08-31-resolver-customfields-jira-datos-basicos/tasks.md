## 1. Preparar el contexto y las evidencias

- [x] 1.1 Confirmar que la evidencia Jira pertenece al mismo contexto funcional y tecnico del catalogo que se va a actualizar.
- [x] 1.2 Crear `docs/mappings/evidence/pilot-local/README.md` con el origen permitido de las evidencias y las reglas de sanitizacion.
- [x] 1.3 Obtener fuera del repositorio la metadata de campos Jira mediante `names/schema`, listado de campos o metadata equivalente del proyecto y tipo de incidencia correctos.
- [x] 1.4 Crear `sanitized-field-metadata.json` conservando solo ID, nombre aprobado, tipo y estructura de cada campo relevante.
- [x] 1.5 Crear `sanitized-issue-shapes.json` con formas y valores sinteticos, sin tokens, cookies, personas, correos, comentarios sensibles, adjuntos ni URLs internas completas.
- [x] 1.6 Documentar como candidatos no confirmados los IDs observados sin nombre funcional, incluidos `customfield_10147` y `customfield_10152` si aparecen en la evidencia disponible.

## 2. Construir el diccionario de 27 campos

- [x] 2.1 Crear `jira-field-dictionary.json` con exactamente los 27 campos de `Datos basicos` en el orden fijado por `design.md`.
- [x] 2.2 Asignar a cada entrada una decision valida: `confirmed`, `pending-validation` o `excluded`.
- [x] 2.3 Registrar inicialmente como confirmados los mappings directos de Tipo de incidencia, Referencia y Descripcion, manteniendo Adjuntos como excluido.
- [x] 2.4 Para cada campo Jira confirmado, registrar ID, nombre, tipo, `readPath`, destino interno, evidencia y notas.
- [x] 2.5 Aplicar las reglas de ruta segun la forma del valor: texto directo, objeto `.value`, fecha, usuario o array.
- [x] 2.6 Mantener pendientes los campos calculados, ambiguos o de persona cuyo origen o representacion interna no esten acordados.
- [x] 2.7 Confirmar que prioridad tecnica Jira permanece separada de Es Urgente, Motivo de urgencia y Grado de urgencia mientras no exista validacion funcional.

## 3. Actualizar la documentacion del catalogo

- [x] 3.1 Ampliar `docs/mappings/README.md` con el flujo para resolver customfields y la diferencia entre evidencia, candidatos y mappings consumibles.
- [x] 3.2 Actualizar `basic-data-matrix.md` para que sus 27 filas reflejen las decisiones y evidencias del diccionario.
- [x] 3.3 Actualizar `catalog.md` con una tabla de campo funcional, campo Jira, ruta, destino interno y estado.
- [x] 3.4 Promover a `catalog.json` exclusivamente los mappings que hayan quedado confirmados con evidencia completa.
- [x] 3.5 Mantener todos los campos `pending-validation` y `excluded` fuera del array `mappings` de `catalog.json`.
- [x] 3.6 Mantener los adjuntos fuera de mappings regulares y referenciar su procesamiento hacia `content.attachedDocuments`.

## 4. Validar el resultado documental

- [x] 4.1 Validar que `jira-field-dictionary.json`, `sanitized-field-metadata.json`, `sanitized-issue-shapes.json` y `catalog.json` son JSON validos.
- [x] 4.2 Validar que el diccionario contiene exactamente 27 entradas, sin omisiones ni duplicados, y una decision permitida por entrada.
- [x] 4.3 Validar que cada entrada `confirmed` contiene evidencia, ruta de lectura y destino interno completos.
- [x] 4.4 Validar que ningun campo pendiente o excluido aparece como mapping definitivo.
- [x] 4.5 Validar que no existe `targetField: "content.statusSp"` y que el estado usa `content.status`.
- [x] 4.6 Revisar que las evidencias no contienen credenciales, cabeceras, cookies, datos personales, comentarios sensibles ni URLs internas completas.
- [x] 4.7 Confirmar mediante el diff que solo se han modificado este OpenSpec y `docs/mappings`, sin cambios en `src/`, `.env`, MongoDB o colecciones.
- [x] 4.8 Registrar los campos que sigan pendientes y la evidencia concreta necesaria para resolverlos en una iteracion posterior.

Nota de validacion: este repositorio no tiene commits en la rama `main`, por lo que `git diff` no dispone de una base historica util. Se comprobo el alcance con rutas concretas, fechas de `src`/`.env.test`/`package.json`, y validaciones sobre `docs/mappings` y este cambio OpenSpec. No se ejecuto ninguna operacion sobre MongoDB.
