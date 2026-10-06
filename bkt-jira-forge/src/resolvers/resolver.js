import { callClaude, extractSection } from './claude.js';

export async function runResolver(ticket, supervisorAnalysis, validatorAnalysis, documentorAnalysis) {
  const ctx = JSON.stringify(ticket, null, 2);

  const system = `Eres el Agente Resolutor de un sistema bancario multiagente integrado en Jira Forge.
Tienes autoridad para resolver incidencias, aplicar correcciones, escalar casos a gestores humanos o solicitar información adicional.
Responde SIEMPRE en español. Sé determinista: toda incidencia debe tener una decisión final clara y justificada.
REGLAS DE ESCALADO OBLIGATORIO: si no hay verificación 2FA disponible para operaciones de seguridad, si falta documentación crítica no subsanable por el sistema, si el importe supera umbrales AML sin clearance, o si el dictamen del Validador fue RECHAZADO por fraude — DEBES escalar.`;

  const user = `TICKET JIRA: ${ticket.id}
TÍTULO: ${ticket.title}
PRIORIDAD: ${ticket.priority}
DESCRIPCIÓN: ${ticket.description}
DATOS DEL TICKET:
${ctx}

ANÁLISIS SUPERVISOR:
${supervisorAnalysis}

RESULTADO VALIDADOR:
${validatorAnalysis}

DOCUMENTACIÓN GENERADA:
${documentorAnalysis}

Devuelve EXACTAMENTE estas secciones con sus títulos en mayúsculas:

1. DECISIÓN
Exactamente una de estas tres palabras clave (sin más texto en esta línea):
RESUELTO
ESCALADO_A_HUMANO
REQUIERE_INFORMACION_ADICIONAL

2. ACCIONES_EJECUTADAS
Lista detallada de lo que el sistema ha hecho o haría concretamente: devolución de cargo, actualización de cuota, desbloqueo de tarjeta, notificación enviada, etc.

3. MOTIVO
Justificación clara y específica de la decisión tomada, referenciando los datos reales del caso.

4. PROXIMOS_PASOS
Qué debe hacer exactamente: el cliente, el banco, o el gestor humano asignado. Sé específico.

5. TIEMPO_ESTIMADO
Plazo estimado de resolución completa si aplica. Si ya está resuelto, indica "Inmediato".

6. DATOS_ACTUALIZADOS
Datos del expediente que cambian tras la resolución: nueva cuota hipotecaria, importe devuelto, fecha de desbloqueo, lista exacta de documentos pendientes, etc. Si no aplica, escribe exactamente: Ninguno

7. COMENTARIO_RESUMEN
Párrafo completo de 5-8 frases en primera persona explicando: tu razonamiento para llegar a la decisión, qué acciones has ejecutado o propuesto, cuál es el próximo paso concreto, el tiempo estimado, y el impacto para el cliente. Cita datos específicos del caso (importes, fechas, referencias). Este texto se publicará íntegro como comentario final en el ticket Jira.`;

  const full = await callClaude(system, user, 1600);

  // Parsear decisión de forma robusta
  const decisionRaw = extractSection(full, 'DECISIÓN') || extractSection(full, 'DECISION') || '';
  let decision = 'REQUIERE_INFORMACION_ADICIONAL';
  if (decisionRaw.toUpperCase().includes('RESUELTO') && !decisionRaw.toUpperCase().includes('NO RESUELTO')) {
    decision = 'RESUELTO';
  } else if (decisionRaw.toUpperCase().includes('ESCALADO')) {
    decision = 'ESCALADO_A_HUMANO';
  }

  return {
    full,
    decision,
    comment: extractSection(full, 'COMENTARIO_RESUMEN') || full,
    dataBlock: extractSection(full, 'DATOS_ACTUALIZADOS'),
    actions: extractSection(full, 'ACCIONES_EJECUTADAS'),
    nextSteps: extractSection(full, 'PROXIMOS_PASOS'),
    eta: extractSection(full, 'TIEMPO_ESTIMADO'),
  };
}