## Context

La rama `main` no tiene commits y todos los archivos aparecen como no versionados. Ademas, Git avisa de rutas demasiado largas bajo `docs/mappings`, el informe tecnico actual incluye documentacion ajena al servicio y `jira-attachment-processing-hardening` mantiene sin completar tareas que parecen estar implementadas. Sin una base revisable no es posible distinguir con seguridad cambios nuevos, documentacion auxiliar, credenciales o salidas generadas.

## Goals / Non-Goals

**Goals:**

- Obtener una lista de archivos versionables revisada y libre de secretos.
- Reconciliar cada tarea del OpenSpec de adjuntos con evidencia concreta.
- Hacer compatibles las rutas documentales con Windows y Git.
- Mantener documentacion y grafo tecnico alineados con el servicio real.

**Non-Goals:**

- No crear automaticamente el commit inicial ni publicar cambios.
- No modificar codigo de aplicacion, contratos HTTP o MongoDB.
- No leer ni copiar el contenido de `.env.test`.
- No borrar documentacion historica sin una decision explicita.

## Decisions

### 1. Inventario explicito antes de la linea base

Se clasificara cada ruta como `versionar`, `generada`, `local`, `sensible` o `pendiente`. `.gitignore` cubrira como minimo entornos locales, `node_modules`, `dist`, `coverage`, logs, temporales y salidas regenerables. El commit inicial quedara como accion manual posterior a la revision del inventario.

Alternativa descartada: ejecutar `git add .`. No permite revisar datos sensibles ni distinguir artefactos auxiliares.

### 2. Reconciliacion por evidencia

Cada checkbox pendiente de `jira-attachment-processing-hardening` se asociara con uno de estos resultados: implementado y probado, implementado sin prueba, no implementado o ya no aplicable. Solo el primer resultado se marcara como completado; el segundo exigira primero la prueba faltante.

### 3. Alias corto para contextos documentales

Las carpetas de contexto usaran un alias corto y estable, por ejemplo `pilot-local`, mientras `catalog.json` y el diccionario conservaran `tenantId`, `projectId` e `itsmId`. Las referencias Markdown se actualizaran de forma atomica.

Alternativa descartada: depender unicamente de `core.longpaths`. No resuelve herramientas que siguen limitando rutas.

### 4. Informe tecnico con alcance controlado

La entrada se restringira a `src`, `docs/mappings` y `openspec`. Se excluiran dependencias, cobertura, build, logs y artefactos antiguos. El informe regenerado debera declarar el alcance y la fecha de generacion.

### 5. Documentacion como fuente verificable

Se repararan enlaces a archivos inexistentes y se evitara afirmar que una prueba o tarea esta completada sin salida reproducible. Los resultados de validacion se documentaran sin copiar payloads internos.

## Risks / Trade-offs

- [Un archivo sensible entra en la linea base] -> Revisar el inventario y ejecutar una busqueda de secretos antes de cualquier commit.
- [El cambio de alias rompe enlaces] -> Buscar todas las referencias al nombre anterior y validar enlaces relativos.
- [Se marcan tareas por apariencia] -> Exigir prueba o comando reproducible por checkbox.
- [El informe tecnico vuelve a mezclar proyectos] -> Guardar la configuracion de exclusiones y validar los directorios de origen.
- [No existe historial para comparar] -> Registrar el inventario inicial y conservar la autorizacion del commit como paso separado.

## Migration Plan

1. Crear el inventario de rutas sin abrir archivos sensibles.
2. Ajustar exclusiones y nombres largos.
3. Reparar referencias documentales.
4. Reconciliar el OpenSpec de adjuntos con codigo y pruebas.
5. Regenerar el informe tecnico con alcance limitado.
6. Ejecutar controles de secretos, rutas y enlaces.
7. Presentar el conjunto candidato para autorizacion del commit inicial.

Rollback: revertir los cambios documentales, restaurar los nombres anteriores y regenerar el grafo. No existe migracion de datos.

## Open Questions

- El remoto y la rama de destino del futuro commit inicial deberan confirmarse antes de publicarlo.
- Los documentos internos que no sean necesarios para construir o probar el servicio deberan clasificarse antes de decidir su versionado.
