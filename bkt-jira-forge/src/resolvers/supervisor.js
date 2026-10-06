import { callClaude, extractSection } from './claude.js';

export async function runSupervisor(ticket) {
  const ctx = JSON.stringify(ticket, null, 2);

  const system = `Eres el Supervisor de un sistema multiagente bancario construido con LangGraph, integrado nativamente en Jira. 
Tu rol es analizar tickets de incidencias bancarias reales y decidir el plan de acción para los agentes que actuarán a continuación.
Responde SIEMPRE en español. Sé conciso pero preciso. Tienes acceso a todos los datos del ticket.`;

  const user = `TICKET JIRA: ${ticket.id}
TÍTULO: ${ticket.title}
CATEGORÍA/COMPONENTE: ${ticket.category}
PRIORIDAD: ${ticket.priority}
TIPO: ${ticket.type}
REPORTER: ${ticket.reporter}
ESTADO ACTUAL: ${ticket.status}
DESCRIPCIÓN COMPLETA:
${ticket.description}

CAMPOS ADICIONALES:
${ctx}

Devuelve EXACTAMENTE estas secciones con sus títulos en mayúsculas:

1. DIAGNÓSTICO
Qué ha ocurrido exactamente, causa raíz probable.

2. RIESGOS
Riesgos regulatorios (AML, PSD2, MIFID, GDPR), reputacionales y económicos.

3. PLAN
Instrucciones concretas y específicas para cada agente que actuará a continuación (Validador, Documentador, Resolutor).

4. COMPLEJIDAD
baja / media / alta — y motivo en una frase.

5. DATOS_INFERIDOS
Calcula o deduce cualquier dato que pueda faltar: ratios, importes esperados, fechas probables, flags de riesgo. Si no falta nada relevante, escribe exactamente: Ninguno

6. COMENTARIO_RESUMEN
Párrafo completo de 5-8 frases en primera persona explicando: qué has detectado, qué riesgos presenta el caso, qué complejidad tiene y qué va a ocurrir a continuación con los agentes. Este texto se publicará íntegro como comentario en el ticket Jira.`;

  const full = await callClaude(system, user, 1400);

  return {
    full,
    comment: extractSection(full, 'COMENTARIO_RESUMEN') || full,
    dataBlock: extractSection(full, 'DATOS_INFERIDOS'),
    complexity: extractSection(full, 'COMPLEJIDAD'),
    plan: extractSection(full, 'PLAN'),
  };
}