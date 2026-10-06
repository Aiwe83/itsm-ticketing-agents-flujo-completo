## Context

El proyecto ya recibe tickets de Jira por HTTP, los guarda en MongoDB y los traduce con mappings antes de notificar al orquestador. La fase 2 necesita dejar ese flujo mejor definido: un solo ticket por llamada, persistencia primero en bruto, traduccion por mappings, y notificacion a agentes sin bloquear la respuesta.

Tambien existe una necesidad clara de trazabilidad para demo y soporte: poder demostrar con Postman y MongoDB for VS Code que cada paso queda registrado en su coleccion correspondiente.

## Goals / Non-Goals

**Goals:**

- Aceptar exactamente un ticket por `POST /api/v1/issues`.
- Guardar el ticket bruto antes de traducirlo.
- Traducir usando mappings almacenados en MongoDB.
- Guardar el ticket traducido con naming alineado a Jira, incluyendo `status`.
- Notificar al orquestador sin acoplar su latencia a la respuesta HTTP.
- Mantener trazabilidad de la ejecucion para auditoria y demo.

**Non-Goals:**

- No introducir soporte para lotes.
- No redisenar la arquitectura de MongoDB.
- No migrar automaticamente documentos historicos existentes.
- No cambiar el endpoint publico ni el formato general de respuesta.
- No ampliar el alcance a nuevos casos de negocio fuera de la integracion Jira actual.

## Decisions

1. **Mantener el flujo raw -> translated -> execution**
   - Guardar primero el documento bruto y despues el traducido separa claramente la fuente de verdad de la version consumible por agentes.
   - Alternativa considerada: guardar solo el documento traducido. Se descarta porque pierde trazabilidad y dificulta depuracion.

2. **Usar mappings como contrato de traduccion**
   - La transformacion depende de datos en Mongo y no de campos hardcodeados.
   - Alternativa considerada: mapear campos en codigo. Se descarta porque haria el sistema rigido y mas caro de mantener.

3. **Renombrar `statusSp` a `status`**
   - El campo traducido debe parecerse al naming de Jira y evitar una excepcion confusa.
   - Alternativa considerada: conservar ambos nombres o crear alias. Se descarta porque mantiene ambiguedad y complica el contrato.

4. **Lanzar la llamada al orquestador en fire-and-forget**
   - La peticion entrante no debe depender de la latencia ni de los reintentos del orquestador.
   - Alternativa considerada: esperar la respuesta antes de contestar. Se descarta por acoplar innecesariamente el tiempo de respuesta al backend de agentes.

5. **Conservar Execution como punto de trazabilidad**
   - Aunque la notificacion sea asincroona, la ejecucion debe reflejar si se intento notificar y con que resultado.
   - Alternativa considerada: no registrar el resultado posterior. Se descarta porque reduce visibilidad operativa.

## Risks / Trade-offs

- Fire-and-forget puede crear una brecha temporal entre la respuesta HTTP y el resultado real del orquestador -> Mitigation: actualizar `Execution` de forma asincroona y registrar errores.
- El contrato de un solo ticket obliga a separar lotes en el cliente -> Mitigation: devolver un error de validacion claro y documentarlo en el plan de pruebas.
- Los documentos historicos pueden seguir teniendo nombres antiguos o estados distintos -> Mitigation: no migrarlos automaticamente y tratar la demo solo con los datos actualizados.
- Si un mapping no esta alineado con los datos de entorno, la traduccion puede fallar -> Mitigation: semilla y ejemplos coherentes con los IDs actuales.

## Migration Plan

1. Desplegar la version de aplicacion con el contrato de un solo ticket y la nomenclatura alineada.
2. Revisar los datos de ejemplo y mappings usados para demo.
3. Validar con un ticket Jira real en Postman.
4. Confirmar en MongoDB que existen entradas en `itsm_tickets`, `tickets` y `executions`.
5. Si aparece un problema, revertir la version de aplicacion sin tocar los documentos historicos.

## Open Questions

- Si la extraccion de adjuntos debe entrar en esta misma capacidad o en una separada.
- Si algun consumidor externo sigue esperando `statusSp` y necesita una transicion adicional.
