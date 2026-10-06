import { callClaude, extractSection } from './claude.js';

export async function runDocumentor(ticket, supervisorAnalysis, validatorAnalysis) {
  const ctx = JSON.stringify(ticket, null, 2);

  const system = `Eres el Agente Documentador de un sistema bancario multiagente integrado en Jira Forge.
Tu función es generar la documentación formal del caso: sintetizar evidencias, redactar el informe de actuación, preparar la comunicación oficial al cliente y registrar lo necesario para compliance.
Responde SIEMPRE en español. Usa tono formal y profesional, pero empático en la comunicación al cliente.`;

  const user = `TICKET JIRA: ${ticket.id}
TÍTULO: ${ticket.title}
DESCRIPCIÓN: ${ticket.description}
DATOS DEL TICKET:
${ctx}

ANÁLISIS DEL SUPERVISOR:
${supervisorAnalysis}

RESULTADO VALIDACIÓN:
${validatorAnalysis}

Devuelve EXACTAMENTE estas secciones con sus títulos en mayúsculas:

1. RESUMEN_EJECUTIVO
3-4 líneas describiendo el caso, su impacto y el estado actual.

2. EVIDENCIAS
Lista de documentos y registros que respaldan la resolución (extractos, contratos, logs de sistema, referencias de operación, etc.). Usa los datos reales del ticket.

3. COMUNICACIÓN_CLIENTE
Redacta el mensaje formal completo que se enviará al cliente. Incluye: saludo personalizado, explicación clara del problema, acciones tomadas, próximos pasos y plazo estimado. Tono profesional y empático.

4. REGISTRO_COMPLIANCE
Qué debe quedar registrado formalmente por normativa: tipo de incidencia, referencia regulatoria aplicable, plazo de resolución exigido, acciones de mitigación.

5. DATOS_GENERADOS
Nuevos datos que genera el proceso documental: número de referencia interna, fecha y hora de registro, importe a devolver calculado, documentos pendientes de aportar, etc. Si no aplica, escribe exactamente: Ninguno

6. COMENTARIO_RESUMEN
Párrafo completo de 5-8 frases en primera persona explicando: qué documentación has generado, qué evidencias respaldan el caso, qué comunicación recibirá el cliente y qué queda registrado por compliance. Este texto se publicará íntegro como comentario en el ticket Jira.`;

  const full = await callClaude(system, user, 1600);

  return {
    full,
    comment: extractSection(full, 'COMENTARIO_RESUMEN') || full,
    dataBlock: extractSection(full, 'DATOS_GENERADOS'),
    clientComm: extractSection(full, 'COMUNICACIÓN_CLIENTE'),
    compliance: extractSection(full, 'REGISTRO_COMPLIANCE'),
    evidences: extractSection(full, 'EVIDENCIAS'),
  };
}