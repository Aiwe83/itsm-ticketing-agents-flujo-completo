import { callClaude, extractSection } from './claude.js';

export async function runValidator(ticket, supervisorAnalysis) {
  const ctx = JSON.stringify(ticket, null, 2);

  const system = `Eres el Agente Validador de un sistema bancario multiagente integrado en Jira Forge.
Tu función es verificar la identidad del cliente, comprobar la coherencia de la operación, detectar fraudes o errores del sistema, y aplicar los filtros regulatorios pertinentes (AML, PSD2, MiFID II, GDPR, normativa Banco de España).
Responde SIEMPRE en español. Sé directo y usa los datos reales del ticket para hacer una validación genuina.`;

  const user = `TICKET JIRA: ${ticket.id}
TÍTULO: ${ticket.title}
DESCRIPCIÓN: ${ticket.description}
DATOS DEL TICKET:
${ctx}

ANÁLISIS DEL SUPERVISOR:
${supervisorAnalysis}

Devuelve EXACTAMENTE estas secciones con sus títulos en mayúsculas:

1. VERIFICACIÓN_IDENTIDAD
Estado del cliente, antigüedad, perfil de riesgo inferido, flags KYC relevantes.

2. VALIDACIÓN_OPERACIÓN
Coherencia de los datos de la operación. Señales de fraude, error del sistema, o inconsistencias. Evidencias encontradas.

3. COMPROBACIONES_REGULATORIAS
Implicaciones concretas: ¿activa umbral AML? ¿aplica PSD2 SCA? ¿hay obligación MIFID? ¿datos personales afectados (GDPR)? ¿normativa Banco de España aplicable?

4. DICTAMEN
Exactamente una de: APROBADO / RECHAZADO / REQUIERE_INFO
Motivo claro en 2-3 frases.

5. DATOS_COMPLETADOS
Campos que puedes calcular o inferir que no estaban en el ticket: ratio de endeudamiento, score de riesgo estimado, fecha probable de la operación, flags regulatorios activados, etc. Si no aplica, escribe exactamente: Ninguno

6. COMENTARIO_RESUMEN
Párrafo completo de 5-8 frases en primera persona explicando: qué has comprobado, qué has encontrado o descartado, qué implicaciones regulatorias tiene, y cuál es tu dictamen final con su justificación. Este texto se publicará íntegro como comentario en el ticket Jira.`;

  const full = await callClaude(system, user, 1400);

  const dictamenRaw = extractSection(full, 'DICTAMEN') || '';
  let dictamen = 'REQUIERE_INFO';
  if (dictamenRaw.toLowerCase().includes('aprobado')) dictamen = 'APROBADO';
  else if (dictamenRaw.toLowerCase().includes('rechazado')) dictamen = 'RECHAZADO';

  return {
    full,
    dictamen,
    comment: extractSection(full, 'COMENTARIO_RESUMEN') || full,
    dataBlock: extractSection(full, 'DATOS_COMPLETADOS'),
    regulatory: extractSection(full, 'COMPROBACIONES_REGULATORIAS'),
  };
}