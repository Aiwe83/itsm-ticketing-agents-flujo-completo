## 1. Inventario y proteccion de la linea base

- [x] 1.1 Clasificar las rutas actuales como versionables, generadas, locales, sensibles o pendientes sin abrir archivos de credenciales.
- [x] 1.2 Actualizar `.gitignore` para excluir entornos locales con secretos, dependencias, builds, cobertura, logs, temporales y artefactos regenerables.
- [x] 1.3 Crear o corregir plantillas de entorno con valores ficticios y confirmar que `.env.test` no entra en el conjunto versionable.
- [x] 1.4 Ejecutar una busqueda de secretos y datos internos sobre el conjunto candidato, sin imprimir valores sensibles en la salida.

## 2. Reconciliacion OpenSpec

- [x] 2.1 Auditar las 21 tareas pendientes de `jira-attachment-processing-hardening` contra codigo, pruebas y comandos reproducibles.
- [x] 2.2 Anadir las pruebas que falten antes de marcar como completas tareas ya implementadas.
- [x] 2.3 Actualizar los checkboxes y notas del OpenSpec de adjuntos con la evidencia final, sin marcar tareas por inferencia.
- [x] 2.4 Confirmar que no existe ninguna ruta paralela o referencia funcional al servicio externo del que solo se tomo la logica de adjuntos.

## 3. Portabilidad y documentacion

- [x] 3.1 Renombrar las carpetas largas de contexto de mappings con un alias corto y conservar los IDs completos dentro de los JSON.
- [x] 3.2 Actualizar todas las referencias Markdown y validar que no queden enlaces a las rutas anteriores.
- [x] 3.3 Corregir enlaces rotos de README y documentos relacionados sin copiar datos sensibles.
- [x] 3.4 Eliminar o excluir temporales evidentes, incluido `tempCodeRunnerFile.js`, solo tras confirmar que no contienen trabajo necesario.

## 4. Documentacion tecnica acotada

- [x] 4.1 Configurar la documentacion tecnica para analizar exclusivamente `src`, `docs/mappings` y `openspec`.
- [x] 4.2 Excluir contexto auxiliar, dependencias, cobertura, builds, logs y salidas generadas anteriores.
- [ ] 4.3 Regenerar la documentacion y comprobar que sus elementos proceden unicamente de las rutas permitidas.
- [x] 4.4 Documentar el alcance, la fecha y el comando de regeneracion del informe.

## 5. Validacion y puerta de revision

- [x] 5.1 Ejecutar typecheck, Jest, build y comprobaciones documentales aplicables sin modificar codigo por formateo automatico.
- [x] 5.2 Revisar `git status` y preparar una lista explicita de archivos candidatos para la linea base.
- [x] 5.3 Confirmar que el conjunto candidato no contiene `.env.test`, secretos, logs, payloads internos sin sanitizar ni artefactos generados.
- [x] 5.4 Presentar el conjunto para autorizacion separada; no crear commit ni hacer push dentro de este cambio.
