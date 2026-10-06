import Resolver from '@forge/resolver';
import { kvs as storage } from '@forge/kvs';
import { fetch } from '@forge/api';
import { asApp, route } from '@forge/api';
import { enrichIssueDescription } from './jira.js';
import { getLangGraphURL, buildTicketCtx, processAgentResults, ENRICHED_MARKER } from './pipeline.js';
import { mapResultsToPipeline, adfToText, buildAssistantContext, buildPlan, extractRelatedIncidents } from './asistente-data.js';
import { callClaude } from './claude.js';

const resolver = new Resolver();

async function getRealIssueFields(issueKey) {
  const jiraRes = await asApp().requestJira(
    route`/rest/api/3/issue/${issueKey}?fields=summary,status,priority,assignee,reporter,created,updated,labels,components,subtasks,description`
  );
  const issue = await jiraRes.json();
  const real = {
    key: issueKey,
    title: issue.fields.summary,
    estadoReal: issue.fields.status ? issue.fields.status.name : null,
    prioridadReal: issue.fields.priority ? issue.fields.priority.name : null,
    assigneeReal: issue.fields.assignee ? issue.fields.assignee.displayName : null,
    reporterReal: issue.fields.reporter ? issue.fields.reporter.displayName : null,
    creadoReal: issue.fields.created,
    actualizadoReal: issue.fields.updated,
    labelsReal: issue.fields.labels || [],
    description: adfToText(issue.fields.description),
  };
  const subtasks = (issue.fields.subtasks || []).map(st => ({
    key: st.key,
    label: st.fields?.summary,
    status: st.fields?.status?.name,
  }));
  return { real, subtasks };
}

// ─── Preguntas sugeridas generadas por LLM, cacheadas por ejecución del pipeline ─
async function getSuggestedQuestions(issueKey, contextText, timestamp) {
  const cacheKey = `assistantSuggested:${issueKey}:${timestamp || 'na'}`;
  const cached = await storage.get(cacheKey);
  if (cached) return cached;

  const FALLBACK = [
    { q: '¿Por qué se ha tomado esta decisión?', a: '' },
    { q: '¿Qué evidencia respalda el diagnóstico?', a: '' },
    { q: '¿Qué pasos quedan pendientes?', a: '' },
  ];

  try {
    const instruction = 'Basándote SOLO en el contexto de la incidencia de arriba, genera EXACTAMENTE 4 preguntas cortas y útiles en español que un gestor humano probablemente querría hacer sobre este caso concreto. Responde ÚNICAMENTE con un array JSON de 4 strings, por ejemplo: ["pregunta 1","pregunta 2","pregunta 3","pregunta 4"]. Sin markdown, sin explicación, sin texto antes ni después del array.';
    const raw = await callClaude('', `${contextText}\n\n${instruction}`);
    const match = raw.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(match ? match[0] : raw);
    const questions = parsed.filter(q => typeof q === 'string' && q.trim()).slice(0, 4).map(q => ({ q: q.trim(), a: '' }));
    const result = questions.length ? questions : FALLBACK;
    await storage.set(cacheKey, result);
    return result;
  } catch (e) {
    console.error('getSuggestedQuestions error:', e);
    return FALLBACK;
  }
}

// ─── Prioridad real del issue — usada por el mock de planes (App.jsx) para
// decidir entre el juego de planes "High" y el juego "case 2" ───────────────
resolver.define('getIssuePriority', async ({ context }) => {
  const issueKey = context.extension.issue.key;
  try {
    const jiraRes = await asApp().requestJira(route`/rest/api/3/issue/${issueKey}?fields=priority`);
    const issue = await jiraRes.json();
    return { priority: issue.fields?.priority?.name || null };
  } catch (e) {
    console.error('getIssuePriority error:', e);
    return { priority: null, error: e.message };
  }
});

// ─── Panel "Asistente" — datos reales del pipeline para la UI enriquecida ────
resolver.define('getIncidentData', async ({ context }) => {
  const issueKey = context.extension.issue.key;
  const { real, subtasks } = await getRealIssueFields(issueKey);

  const results = await storage.get(`agentResults:${issueKey}`);
  if (!results) {
    return { real, hasPipelineData: false };
  }

  const pipeline = mapResultsToPipeline(results);
  pipeline.subtasks = subtasks;
  pipeline.relatedIncidents = extractRelatedIncidents(results, context.siteUrl);

  const contextText = buildAssistantContext(real, results, subtasks);
  pipeline.suggested = await getSuggestedQuestions(issueKey, contextText, results.timestamp);

  pipeline.plan = buildPlan(results);
  pipeline.plan.review = await storage.get(`planReview:${issueKey}:${results.timestamp || 'na'}`) || null;

  return { real, hasPipelineData: true, pipeline };
});

// ─── Revisión humana del plan propuesto por el Resolutor ─────────────────────
resolver.define('submitPlanReview', async ({ context, payload }) => {
  const issueKey = context.extension.issue.key;
  const action = payload?.action; // 'approve' | 'edit' | 'reject'
  if (!['approve', 'edit', 'reject'].includes(action)) {
    return { success: false, error: 'Acción de revisión no válida.' };
  }

  const results = await storage.get(`agentResults:${issueKey}`);
  if (!results) {
    return { success: false, error: 'No hay ningún plan que revisar todavía.' };
  }

  let reviewerName = context.accountId;
  try {
    const userRes = await asApp().requestJira(route`/rest/api/3/user?accountId=${context.accountId}`);
    if (userRes.ok) {
      const user = await userRes.json();
      reviewerName = user.displayName || reviewerName;
    }
  } catch (e) {
    console.error('submitPlanReview: no se pudo resolver el nombre del revisor:', e);
  }

  const review = {
    status: action === 'approve' ? 'approved' : action === 'edit' ? 'edited' : 'rejected',
    editedText: action === 'edit' ? (payload?.editedText || '').trim() : null,
    rejectReason: action === 'reject' ? (payload?.reason || '').trim() : null,
    reviewedBy: reviewerName,
    reviewedAt: new Date().toISOString(),
  };

  await storage.set(`planReview:${issueKey}:${results.timestamp || 'na'}`, review);
  return { success: true, review };
});

// ─── Chat del Asistente — respuestas reales vía LLM, con contexto completo ───
resolver.define('askAssistant', async ({ context, payload }) => {
  const issueKey = context.extension.issue.key;
  const question = (payload?.question || '').trim();
  const history = Array.isArray(payload?.history) ? payload.history : [];
  if (!question) return { answer: 'Escribe una pregunta sobre la incidencia.' };

  try {
    const { real, subtasks } = await getRealIssueFields(issueKey);
    const results = await storage.get(`agentResults:${issueKey}`);
    if (!results) {
      return { answer: 'Esta incidencia todavía no ha sido procesada por el pipeline agéntico, así que no tengo análisis sobre el que responder todavía.' };
    }

    const contextText = buildAssistantContext(real, results, subtasks);
    const historyText = history.slice(-6)
      .map(h => `${h.who === 'user' ? 'Usuario' : 'Asistente'}: ${h.text}`)
      .join('\n');

    const system = `Eres el Asistente de BankDesk AI, un copiloto para gestores de incidencias bancarias. Respondes SOLO en base al contexto de la incidencia y al análisis de los agentes que se te da a continuación. Si no tienes información suficiente para responder algo, dilo honestamente en vez de inventar. Responde en español, de forma clara y concisa (máximo 4-5 frases).\n\nContexto de la incidencia:\n${contextText}`;
    const userPrompt = historyText ? `${historyText}\nUsuario: ${question}` : question;

    const answer = await callClaude(system, userPrompt);
    return { answer: answer.trim() };
  } catch (e) {
    console.error('askAssistant error:', e);
    return { answer: `No he podido consultar al asistente en este momento (${e.message}). Inténtalo de nuevo en unos segundos.` };
  }
});

// ─── Enriquecer descripción sin ejecutar agentes ──────────────────────────────
resolver.define('enrichDescription', async ({ payload }) => {
  const { issueKey } = payload;
  try {
    const ticket  = await buildTicketCtx(issueKey);
    if (ticket.description.includes(ENRICHED_MARKER)) {
      return { success: true, alreadyEnriched: true };
    }

    const baseUrl = getLangGraphURL();
    const res = await fetch(`${baseUrl}/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticket),
    });

    if (!res.ok) throw new Error(`Enrich error ${res.status}: ${await res.text()}`);

    const { steps, enrichedText } = await res.json();
    if (!steps?.length) return { success: false, error: 'No se encontraron datos de tools relevantes' };

    await enrichIssueDescription(issueKey, ticket.description, steps, enrichedText);
    return { success: true, alreadyEnriched: false, toolsUsed: steps.map(s => s.tool) };
  } catch (e) {
    console.error('enrichDescription error:', e);
    return { success: false, error: e.message };
  }
});

// ─── Obtener resultados guardados ─────────────────────────────────────────────
resolver.define('getAgentResults', async ({ payload }) => {
  const { issueKey } = payload;
  try {
    const results = await storage.get(`agentResults:${issueKey}`);
    return { success: true, results: results || null };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── Iniciar pipeline LangGraph ───────────────────────────────────────────────
resolver.define('startAgentRun', async ({ payload }) => {
  const { issueKey } = payload;
  try {
    const ticket = await buildTicketCtx(issueKey);
    const baseUrl = getLangGraphURL();

    const res = await fetch(`${baseUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticket),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`LangGraph server error ${res.status}: ${err}`);
    }

    const { jobId } = await res.json();
    await storage.set(`job:${issueKey}`, { jobId, startedAt: new Date().toISOString() });

    return { success: true, jobId };
  } catch (e) {
    console.error('startAgentRun error:', e);
    return { success: false, error: e.message };
  }
});

resolver.define('checkAgentRun', async ({ payload }) => {
  const { issueKey } = payload;
  try {
    const jobData = await storage.get(`job:${issueKey}`);
    if (!jobData?.jobId) return { success: false, error: 'No hay job activo para este issue' };

    const baseUrl = getLangGraphURL();
    const res = await fetch(`${baseUrl}/status/${jobData.jobId}`);
    if (!res.ok) throw new Error(`Status check failed: ${res.status}`);

    const job = await res.json();

    if (job.status === 'done') {
      await processAgentResults(issueKey, job.results);
      return { success: true, status: 'done', results: job.results };
    }
    if (job.status === 'error') {
      return { success: false, status: 'error', error: job.error };
    }
    return { success: true, status: 'processing' };
  } catch (e) {
    console.error('checkAgentRun error:', e);
    return { success: false, error: e.message };
  }
});

// ─── Crear incidencias mock ────────────────────────────────────────────────────
const MOCK_ISSUES = [
  { summary: 'Cargo duplicado en tarjeta Visa ending 4821', priority: 'High', labels: ['tarjeta', 'duplicado'], description: 'El cliente reporta un cargo duplicado de 234,50€ en su tarjeta Visa (ending 4821) realizado el 19/05/2026 en Mercadona. El primer cargo aparece a las 11:32h y el segundo a las 11:33h con el mismo importe. El cliente no realizó dos operaciones. Solicita devolución inmediata.' },
  { summary: 'Cuenta bloqueada por actividad sospechosa — cliente VIP', priority: 'Highest', labels: ['bloqueo', 'fraude', 'vip'], description: 'Cuenta corriente ES91 2100 0418 4502 0005 1332 bloqueada automáticamente a las 03:17h. Se detectaron 5 intentos de acceso desde IPs de Romania en 8 minutos. Cliente VIP (patrimonio >500k€). Sin acceso a banca online ni a fondos.' },
  { summary: 'Transferencia SEPA de 12.000€ no recibida por beneficiario', priority: 'High', labels: ['transferencia', 'sepa'], description: 'El cliente realizó una transferencia SEPA el 16/05/2026 por 12.000€ al IBAN DE89 3704 0044 0532 0130 00. A fecha de hoy el beneficiario confirma no haberla recibido. Ref: TRF20260516-8821-EUR. El banco emisor confirma que la orden fue procesada.' },
  { summary: 'Cuota hipotecaria cobrada con tipo de interés incorrecto', priority: 'High', labels: ['hipoteca', 'error-calculo'], description: 'El cliente hipotecado (ref. HIP-2019-44821) detecta que la cuota de mayo 2026 aplicó Euribor + 1,25% en lugar del Euribor + 0,85% pactado. Importe cobrado: 1.243,60€. Importe correcto: 1.187,20€. Diferencia: 56,40€. Solicita devolución y corrección.' },
  { summary: 'Tarjeta de débito bloqueada tras compra en aeropuerto JFK', priority: 'Medium', labels: ['tarjeta', 'bloqueo', 'internacional'], description: 'El cliente viajó a Nueva York y realizó una compra en el aeropuerto JFK por 89 USD. La tarjeta fue bloqueada por el antifraude al detectar operación internacional sin aviso de viaje. Lleva 14 horas sin poder pagar ni retirar efectivo.' },
  { summary: 'Domiciliación de Endesa cobrada dos veces el mismo día', priority: 'Medium', labels: ['domiciliacion', 'recibo', 'duplicado'], description: 'El cliente recibió dos adeudos de Endesa Energía SA el 18/05/2026, ambos por 187,35€. El mandato SEPA activo es M-2022-ES-04821. El saldo insuficiente generó una comisión de descubierto de 35€. Solicita devolución del cargo duplicado y la comisión.' },
  { summary: 'Préstamo personal denegado pese a scoring APROBADO (742/850)', priority: 'Medium', labels: ['prestamo', 'scoring'], description: 'El cliente solicitó préstamo personal de 8.000€ a 48 meses. El scoring devolvió APROBADO (742/850) pero la plataforma rechazó con código E-4421 "Riesgo elevado". El cliente no tiene deudas en CIRBE ni en ficheros de morosidad.' },
  { summary: 'Cliente no recibe SMS de 2FA — acceso bloqueado inminente', priority: 'High', labels: ['autenticacion', '2fa', 'banca-online'], description: 'Desde el 20/05/2026 a las 09:00h el cliente no recibe los SMS de verificación 2FA. Ha intentado acceder 8 veces sin éxito. La cuenta está a 2 intentos del bloqueo definitivo. Necesita realizar una transferencia urgente antes de las 14:00h.' },
  { summary: 'Comisión de mantenimiento cobrada en cuenta nómina gratuita', priority: 'Low', labels: ['comisiones', 'reclamacion'], description: 'El cliente detectó un cargo de 15€/mes de "Comisión de mantenimiento". Según contrato de 2021, la cuenta es gratuita con nómina domiciliada (2.100€/mes). Lleva 3 meses con este cargo. Importe total reclamado: 45€.' },
  { summary: 'Cajero rechaza disposición de 500€ alegando límite superado', priority: 'Medium', labels: ['cajero', 'efectivo', 'limite'], description: 'El cliente intentó retirar 500€ en cajero Euro 6000. Rechazado con "Límite diario superado" pero no ha realizado ninguna retirada en 7 días. Su límite contratado es 1.000€. Solicita revisión del contador y liberación del límite.' },
];

function makeAdf(text) {
  return { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

resolver.define('createMockIssues', async ({ context }) => {
  const projectKey = context?.extension?.project?.key || 'KAN';
  const created = [], errors = [];
  for (const issue of MOCK_ISSUES) {
    try {
      const res = await asApp().requestJira(route`/rest/api/3/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          fields: {
            project:     { key: projectKey },
            summary:     issue.summary,
            description: makeAdf(issue.description),
            issuetype:   { name: 'Task' },
            priority:    { name: issue.priority },
            labels:      issue.labels,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) created.push(data.key);
      else errors.push(`${issue.summary}: ${JSON.stringify(data)}`);
    } catch (e) { errors.push(`${issue.summary}: ${e.message}`); }
  }
  return { success: errors.length === 0, created, errors };
});

// ─── Tickets diseñados para activar todas las tools ──────────────────────────
const MOCK_ISSUES_V2 = [
  {
    summary: 'Alerta AML: cliente 9912378 — 4 transferencias fraccionadas en 72h',
    priority: 'Highest',
    labels: ['aml', 'fraude', 'escalada-regulatoria'],
    description: `Cliente ID 9912378 ha realizado 4 transferencias en los últimos 3 días por importes de 9.800€, 9.500€, 9.200€ y 9.750€ (todas por debajo del umbral de 10.000€ de declaración obligatoria). Patrón compatible con smurfing según regla AML-FR-204.
Referencia de operación: OPR-20260521-AML-9912378.
Servicio afectado: payment-gateway.
Se requiere análisis urgente y posible reporte a SEPBLAC.`,
  },
  {
    summary: 'Bloqueo masivo de tarjetas tras deploy card-management v3.14.2',
    priority: 'Highest',
    labels: ['tarjeta', 'bloqueo', 'incidencia-tecnica'],
    description: `A las 14:32h se desplegó la versión v3.14.2 del servicio card-management. Desde entonces, 23 clientes han reportado bloqueos no justificados de sus tarjetas de débito. Los bloqueos se activan sin operación previa sospechosa.
Primer cliente afectado ID: 5541872 (tarjeta ending 3847).
Referencia de incidente: INC-20260521-CARD-3847.
Servicio: card-management. Necesaria correlación con los cambios del último deploy.`,
  },
  {
    summary: 'Cliente VIP 0023453 exige resolución inmediata — fondos retenidos 48h',
    priority: 'Highest',
    labels: ['vip', 'fondos-retenidos', 'escalada'],
    description: `Cliente 0023453 (segmento VIP/Banca Privada) tiene sus fondos retenidos desde hace 48h por una alerta antifraude que él niega. Ha contactado con la dirección del banco directamente.
Referencia bloqueo: BLK-20260519-0023453.
El cliente tiene productos de alto valor contratados y un historial limpio. La retención está causando pérdidas reputacionales. Solicita desbloqueo inmediato y explicación detallada.`,
  },
  {
    summary: 'Transferencia SEPA ref TRF20260521-9934-EUR — beneficiario no recibe fondos',
    priority: 'High',
    labels: ['sepa', 'transferencia', 'swift'],
    description: `El cliente ID 7891234 realizó una transferencia SEPA el 19/05/2026 por 18.500€ al IBAN NL91 ABNA 0417 1643 00 (ABN AMRO Amsterdam). El beneficiario confirma no haber recibido los fondos.
Referencia operación: TRF20260521-9934-EUR.
El sistema SEPA-processing-service muestra la orden como enviada pero sin acuse de recibo. Se sospecha de un error en el routing del servicio tras el último deploy.`,
  },
  {
    summary: 'Fallo sistémico 2FA — auth-service caído parcialmente tras actualización',
    priority: 'High',
    labels: ['2fa', 'autenticacion', 'incidencia-tecnica'],
    description: `Desde las 09:15h del 21/05/2026 el servicio auth-service presenta fallos intermitentes en el envío de OTPs por SMS. Afecta al 15% de los usuarios activos.
Cliente ID 3341229 es uno de los afectados con transferencia urgente pendiente.
Referencia de incidencia técnica: INC-20260521-AUTH-OTP.
Se detectó un spike de latencia en el proveedor Vonage tras el último deploy del servicio. Necesario rollback o fix urgente.`,
  },
  {
    summary: 'Reclamación GDPR cliente 6612095 — solicita portabilidad y borrado de datos',
    priority: 'Medium',
    labels: ['gdpr', 'proteccion-datos', 'legal'],
    description: `El cliente ID 6612095 ha ejercido formalmente su derecho de portabilidad (Art. 20 RGPD) y derecho al olvido (Art. 17 RGPD) mediante burofax recibido el 20/05/2026.
Referencia expediente legal: LEG-20260520-GDPR-6612095.
El plazo legal de respuesta es de 30 días (vence el 19/06/2026). Se requiere inventario de datos tratados, informe de portabilidad y plan de borrado respetando la retención mínima obligatoria de 10 años para datos transaccionales (LMAB).`,
  },
  {
    summary: 'Hipoteca cliente 8823411 — Euribor aplicado incorrecto tras revisión semestral',
    priority: 'High',
    labels: ['hipoteca', 'euribor', 'error-calculo'],
    description: `El cliente ID 8823411 tiene hipoteca ref. HIP-2021-88234 con tipo Euribor + 0,75%. En la revisión semestral de mayo 2026 el sistema core-banking aplicó Euribor + 1,10% en lugar del diferencial pactado.
Referencia operación: HIP-REV-20260501-88234.
Cuota cobrada: 1.456,30€. Cuota correcta: 1.312,80€. Exceso: 143,50€.
El error afecta también a la simulación del cuadro de amortización. Se solicita corrección retroactiva y recálculo de los próximos 6 meses. Servicio afectado: core-banking.`,
  },
  {
    summary: 'Scoring incorrecto en cliente 1134872 — scoring system generó puntuación negativa',
    priority: 'High',
    labels: ['scoring', 'credito', 'error-sistema'],
    description: `El sistema de scoring devolvió -142 puntos para el cliente ID 1134872 en su solicitud de préstamo personal de 15.000€ presentada el 20/05/2026.
Referencia solicitud: LOAN-20260520-1134872.
El cliente tiene nómina domiciliada de 3.200€/mes, sin deudas en CIRBE y scoring histórico de 724. El valor negativo es claramente un error del sistema.
Servicio afectado: payment-gateway (módulo de scoring). Se requiere revisión del último deploy y recálculo manual.`,
  },
  {
    summary: 'Cobro duplicado domiciliación nómina empresa cliente 2287634',
    priority: 'Medium',
    labels: ['nomina', 'duplicado', 'domiciliacion'],
    description: `El cliente ID 2287634 (cuenta nómina) ha recibido dos abonos de nómina de 2.750€ el 20/05/2026 (uno a las 08:15h y otro a las 08:17h). La empresa pagadora solo procesó un pago. El segundo abono parece ser un duplicado del servicio core-banking.
Referencia operación: NOM-20260520-2287634-DUP.
El saldo extra ha sido parcialmente gastado por el cliente. Se requiere análisis de logs y determinación de responsabilidad para proceder a la recuperación de fondos según protocolo de cobros indebidos.`,
  },
  {
    summary: 'PSD2 SCA: cliente 4419023 impugna cargo — comercio no aplica autenticación reforzada',
    priority: 'Medium',
    labels: ['psd2', 'sca', 'contracargo'],
    description: `El cliente ID 4419023 impugna un cargo de 340€ del comercio "TechStore Online S.L." del 18/05/2026. Alega que el comercio no solicitó autenticación reforzada (SCA) según PSD2 para una operación > 30€.
Referencia operación: TXN-20260518-SCA-4419023.
Si se confirma que el comercio omitió SCA, la responsabilidad del fraude recae sobre el PSP del comercio. Se necesita verificación de logs de la transacción y consulta de la normativa PSD2 Art. 97 sobre exenciones SCA.
Servicio: payment-gateway.`,
  },
];

resolver.define('createMockIssuesV2', async ({ context }) => {
  const projectKey = context?.extension?.project?.key || 'KAN';
  const created = [], errors = [];
  for (const issue of MOCK_ISSUES_V2) {
    try {
      const res = await asApp().requestJira(route`/rest/api/3/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          fields: {
            project:     { key: projectKey },
            summary:     issue.summary,
            description: makeAdf(issue.description),
            issuetype:   { name: 'Task' },
            priority:    { name: issue.priority },
            labels:      issue.labels,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) created.push(data.key);
      else errors.push(`${issue.summary}: ${JSON.stringify(data)}`);
    } catch (e) { errors.push(`${issue.summary}: ${e.message}`); }
  }
  return { success: errors.length === 0, created, errors };
});

// ─── 15 incidencias enriquecibles con tools ───────────────────────────────────
const MOCK_ISSUES_V3 = [
  {
    summary: 'Cargo no reconocido 340€ suscripción Adobe — cliente 3312847',
    priority: 'Medium', labels: ['contracargo', 'suscripcion', 'psd2'],
    description: `Cliente ID 3312847 disputa un cargo de 340€ de "Adobe Systems Ireland" del 17/05/2026.
Afirma haber cancelado la suscripción en marzo. El comercio no ha tramitado la devolución.
Referencia operación: TXN-20260517-ADOBE-3312847. Servicio: payment-gateway.
Solicita contracargo PSD2 y bloqueo de futuros cargos del mismo comercio.`,
  },
  {
    summary: 'Bizum de 850€ retenido — no llega al destinatario cliente 7723091',
    priority: 'High', labels: ['bizum', 'retencion', 'transferencia'],
    description: `Cliente ID 7723091 envió un Bizum de 850€ el 20/05/2026 a las 11:42h al número +34 612 334 891.
Referencia: BIZ-20260520-7723091-850. El destinatario no lo ha recibido y el importe sigue retenido.
El servicio payment-gateway muestra la operación en estado PENDING_CLEARANCE desde hace 4 horas.
El cliente necesita los fondos con urgencia para pago de alquiler.`,
  },
  {
    summary: 'Préstamo HIP-2018-33421 cancelado pero sigue generando recibos — cliente 5534129',
    priority: 'High', labels: ['hipoteca', 'cancelacion', 'error-sistema'],
    description: `Cliente ID 5534129 canceló anticipadamente su hipoteca (ref. HIP-2018-33421) el 30/04/2026.
Se realizó el pago total de 87.340€ y se firmó la carta de pago ante notario.
Sin embargo, el sistema core-banking generó un recibo de cuota en mayo por 1.102€ y lo ha cobrado.
Referencia cobro indebido: REC-20260501-HIP-33421. Cliente muy molesto y amenaza con denuncia.`,
  },
  {
    summary: 'Retención IRPF incorrecta en dividendos fondo inversión — cliente 8819034',
    priority: 'Medium', labels: ['irpf', 'dividendos', 'fondo-inversion'],
    description: `Cliente ID 8819034 recibió dividendos de su fondo de inversión por 2.340€ el 15/05/2026.
La retención aplicada fue del 21% (491,40€) cuando corresponde el 19% según su base imponible acumulada.
Referencia liquidación: LIQ-20260515-DIV-8819034. Exceso retenido: 46,80€.
Solicita corrección y devolución del exceso. Normativa aplicable: LIRPF Art. 94 y reglamento CNMV.`,
  },
  {
    summary: 'Movimientos fraudulentos tras robo de móvil — cliente 4421773',
    priority: 'Highest', labels: ['fraude', 'robo', 'urgente'],
    description: `Cliente ID 4421773 reporta robo de móvil el 20/05/2026 a las 14:30h.
Desde entonces se han realizado 3 operaciones no autorizadas:
- Bizum 500€ a número desconocido (14:47h)
- Compra online 289€ en plataforma gaming (15:02h)
- Intento de cambio de contraseña banca online (15:15h)
Referencia incidente: INC-20260520-ROBO-4421773. Servicio auth-service comprometido.
Cliente solicita bloqueo inmediato y devolución de los cargos fraudulentos.`,
  },
  {
    summary: 'Cuenta pensionista 6634521 con comisiones de mantenimiento indebidas',
    priority: 'Low', labels: ['pensionista', 'comisiones', 'reclamacion'],
    description: `Cliente ID 6634521, pensionista con pensión de 1.230€/mes domiciliada desde 2018.
Según promoción vigente en 2018, cuenta gratuita de por vida para pensionistas con pensión domiciliada.
Se están cobrando 8€/mes de comisión desde enero 2026. Total acumulado: 40€ (5 meses).
Referencia expediente: REC-20260520-PEN-6634521. Cliente reclama devolución y cese inmediato.`,
  },
  {
    summary: 'IBAN incorrecto en nómina empresa — 1.800€ no recibidos cliente 9934521',
    priority: 'High', labels: ['nomina', 'iban', 'transferencia'],
    description: `Cliente ID 9934521 no ha recibido su nómina de mayo 2026 por importe de 1.800€.
La empresa pagadora confirma que la nómina fue enviada al IBAN ES91 2100 0418 4502 0005 9921 el 30/04/2026.
Sin embargo el IBAN correcto del cliente es ES91 2100 0418 4502 0005 9912 (dígitos 12 y 21 invertidos).
Referencia transferencia: TRF-20260430-NOM-9934521. Servicio sepa-gateway.
El cliente tiene compromisos de pago urgentes. Necesita localizar los fondos y realizar corrección.`,
  },
  {
    summary: 'Doble cobro seguro del hogar Mapfre — cliente 2213847',
    priority: 'Medium', labels: ['seguro', 'duplicado', 'domiciliacion'],
    description: `Cliente ID 2213847 ha recibido dos cobros de la prima anual de su seguro del hogar Mapfre:
- 487,50€ el 01/05/2026 (póliza P-2019-MAR-44821)
- 487,50€ el 03/05/2026 (mismo concepto y póliza)
Referencia duplicado: DOM-20260503-MAP-2213847. Servicio core-banking módulo domiciliaciones.
Mapfre confirma que solo procesaron un cobro. El segundo parece error del sistema bancario.
Saldo en cuenta reducido en 487,50€ de forma indebida.`,
  },
  {
    summary: 'Tarjeta gold no actualizada tras upgrade — cliente 7712398',
    priority: 'Low', labels: ['tarjeta', 'upgrade', 'gold'],
    description: `Cliente ID 7712398 solicitó el 05/05/2026 el upgrade de su tarjeta Visa Clásica a Visa Gold.
El pago de la cuota anual diferencial (75€) se procesó correctamente ref. TXN-20260505-UPG-7712398.
Sin embargo, a fecha 20/05/2026 el cliente sigue sin recibir la nueva tarjeta y sus límites no se han actualizado.
Servicio card-management. El cliente tiene un viaje internacional el 25/05 y necesita los límites ampliados.`,
  },
  {
    summary: 'Liquidación fondo MiFID II incorrecta — cliente 3387621',
    priority: 'High', labels: ['fondo-inversion', 'mifid', 'liquidacion'],
    description: `Cliente ID 3387621 solicitó el reembolso total de su fondo de inversión (ref. FND-20260510-3387621) el 10/05/2026.
Valor liquidativo: 45.230€. Importe recibido: 43.180€. Diferencia: 2.050€ sin justificación.
El cliente no recibió el informe previo de costes y gastos exigido por MiFID II antes del reembolso.
Posible incumplimiento regulatorio. Normativa: MiFID II Art. 24 y CNMV Circular 1/2022.`,
  },
  {
    summary: 'Límite tarjeta crédito reducido sin notificación — cliente 5521089',
    priority: 'Medium', labels: ['tarjeta', 'credito', 'limite'],
    description: `Cliente ID 5521089 detecta que su límite de crédito Visa fue reducido de 6.000€ a 2.500€ el 15/05/2026.
No recibió ninguna comunicación previa. El sistema card-management muestra el cambio automático por "revisión de riesgo".
Referencia revisión: RSK-20260515-CARD-5521089. El cliente tiene domiciliados pagos que superan el nuevo límite.
El scoring del cliente no ha variado. Solicita revisión y restitución del límite original.`,
  },
  {
    summary: 'Cancelación plazo fijo antes de vencimiento — intereses no pagados cliente 1198234',
    priority: 'Medium', labels: ['plazo-fijo', 'cancelacion', 'intereses'],
    description: `Cliente ID 1198234 canceló anticipadamente un depósito a plazo fijo (ref. DEP-20260301-1198234) el 19/05/2026.
Vencimiento original: 01/09/2026. Capital: 25.000€. TAE pactada: 3,25%.
Intereses proporcionales generados (79 días): 176,37€.
El sistema core-banking abonó solo el capital sin los intereses proporcionales.
Cliente reclama los 176,37€ y solicita confirmación del cálculo según contrato.`,
  },
  {
    summary: 'Error autenticación biométrica app móvil — cliente 6678321 bloqueado',
    priority: 'High', labels: ['biometria', 'autenticacion', 'app-movil'],
    description: `Cliente ID 6678321 no puede acceder a la app móvil desde el 19/05/2026.
El sistema auth-service rechaza la autenticación biométrica (Face ID) con error E-4429 "biometric_mismatch".
Ha intentado resetear la biometría 4 veces sin éxito. El canal web funciona correctamente.
Referencia incidencia: INC-20260519-BIO-6678321. Coincide temporalmente con el último deploy de auth-service.
El cliente realiza toda su operativa por app y no puede gestionar su empresa.`,
  },
  {
    summary: 'Cambio de titularidad cuenta — productos asociados no migrados cliente 4456712',
    priority: 'Medium', labels: ['cambio-titularidad', 'migracion', 'cuenta'],
    description: `Cliente ID 4456712 formalizó cambio de titularidad de cuenta el 10/05/2026 (cuenta ES76 2100 0418 4502 0091 2341).
El proceso implicaba migrar: tarjeta de débito, domiciliaciones (5 activas) y préstamo personal ref. LOAN-2024-44521.
A fecha 20/05/2026 solo se migró la cuenta base. El préstamo sigue en la titularidad antigua y las domiciliaciones no se han transferido.
Dos recibos ya rebotaron por cuenta errónea: comisión 35€ generada. Servicio core-banking.`,
  },
  {
    summary: 'Operativa bloqueada por AML — cliente 8834219 transferencias internacionales',
    priority: 'Highest', labels: ['aml', 'bloqueo-operativa', 'transferencias-internacionales'],
    description: `Cliente ID 8834219 tiene bloqueada toda operativa de transferencias internacionales desde el 18/05/2026.
El sistema ha detectado 3 transferencias en 72h hacia Marruecos por importes de 4.200€, 3.800€ y 4.500€.
Referencia expediente AML: AML-20260518-INT-8834219. Servicio payment-gateway.
El cliente es importador de textil con operativa habitual con Marruecos — aporta facturas comerciales.
Se requiere análisis AML urgente: posible falso positivo pero obligación de revisión antes de desbloquear.`,
  },
];

resolver.define('createMockIssuesV3', async ({ context }) => {
  const projectKey = context?.extension?.project?.key || 'KAN';
  const created = [], errors = [];
  for (const issue of MOCK_ISSUES_V3) {
    try {
      const res = await asApp().requestJira(route`/rest/api/3/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          fields: {
            project:     { key: projectKey },
            summary:     issue.summary,
            description: makeAdf(issue.description),
            issuetype:   { name: 'Task' },
            priority:    { name: issue.priority },
            labels:      issue.labels,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) created.push(data.key);
      else errors.push(`${issue.summary}: ${JSON.stringify(data)}`);
    } catch (e) { errors.push(`${issue.summary}: ${e.message}`); }
  }
  return { success: errors.length === 0, created, errors };
});

// ─── Suite V5: mix de incidencias reales (estilo HOST/POS) y narrativas ──────
const MOCK_ISSUES_V5 = [
  // ── Estilo HOST / volcado técnico (descripción pobre, datos crudos) ──────────
  {
    summary: 'CONTINUACION NOMH2605 — proceso nóminas no ejecutado ciclo 26/05',
    priority: 'Highest', labels: ['critico', 'nominas', 'batch', 'host'],
    description: `CONTINUACION NOMH2605

Proceso batch de nóminas ciclo 26/05/2026 no ejecutado correctamente.
Revisar estado de cola y tablas de control antes de reiniciar.

Solicitud de liquidación nóminas:

EMPRESA  CENTRO  CICLO       FEC_EJEC    ESTADO  REGISTROS  ERRORES
-------  ------  ----------  ----------  ------  ---------  -------
0128     0001    NOM2605     26.05.2026  ERROR   14823      312
0128     0002    NOM2605     26.05.2026  PEND    0          0
0128     0003    NOM2605     26.05.2026  PEND    0          0

Detalle errores muestra:

COD_ERR  CUENTA        NIF           IMPORTE    DESCRIPCION
-------  ------------  ------------  ---------  ------------------------------------
E-4412   0140234016    12345678A     2.340,00   cuenta destino bloqueada KYC
E-4412   0140289034    87654321B     1.890,50   cuenta destino bloqueada KYC
E-5501   0140301245    11223344C     3.120,00   servicio SEPA no disponible
E-4412   0140198723    55667788D     4.500,00   cuenta destino bloqueada KYC

Servicio afectado: HOST-NOMINAS. Impacto económico: >500.000€. Clientes afectados: >300.`,
  },
  {
    summary: 'ERROR END-OF-DAY — asientos contables ciclo 25/05 sin cerrar',
    priority: 'High', labels: ['alto', 'eod', 'contabilidad', 'host', 'batch'],
    description: `CONTINUACION EODB250526

Proceso End-of-Day del 25/05/2026 no completó el cierre contable.
Ciclo nocturno detenido en paso 7 de 12. Reintentar desde paso 7 previo saneamiento.

Estado proceso EOD:

PASO  DESCRIPCION              INICIO      FIN         ESTADO   REGISTROS
----  -----------------------  ----------  ----------  -------  ---------
1     Cuadre de caja           25.05.2026  25.05.2026  OK       48.231
2     Liquidacion intereses    25.05.2026  25.05.2026  OK       12.847
3     Provision insolvencias   25.05.2026  25.05.2026  OK       3.421
4     Asientos automaticos     25.05.2026  25.05.2026  OK       89.234
5     Transferencias SEPA DD   25.05.2026  25.05.2026  OK       6.712
6     Cambio divisa            25.05.2026  25.05.2026  OK       1.103
7     Cierre posiciones FX     25.05.2026  --          ERROR    0
8     Asiento consolidado      --          --          PEND     0
9     Generacion extractos     --          --          PEND     0
10    Envio SNCE               --          --          PEND     0
11    Cuadre final             --          --          PEND     0
12    Cierre ciclo             --          --          PEND     0

Codigo error paso 7: FX-TIMEOUT-3601 — servicio tipos de cambio externo no responde.
Impacto: apertura del dia 26/05 bloqueada hasta resolver. Clientes afectados: >5000.`,
  },
  {
    summary: 'POSD512 — cuenta 0140301892 liquidacion depositada sin actualizar reserva',
    priority: 'High', labels: ['alto', 'depositos', 'liquidacion', 'host', 'operativa'],
    description: `POSD512

La cuenta entro a liquidar por peticion manual del gestor de guardia.
Al sacarla del proceso la liquidacion no contabilizo y las fechas no se actualizaron.
Revisar que no se haya marcado como contabilizada si no ha contabilizado.

Solicitud de liquidacion:

EMPRESA  CENTRO  CUENTA      FEC_SOL     SEC  TIPO  FEC_EJEC
-------  ------  ----------  ----------  ---  ----  ----------
0128     6425    0140301892  24.05.2026    2  LIQ   25.05.2026

Estado peticion:

FEC_SOL     SEC  SITU  TIPO  DATO8
----------  ---  ----  ----  -------------------------
01.01.0001    0  E     A     ACRLIQ24.04.202624.05.2026

Fechas de liquidacion:

CUENTA      FEC_PROX_LIQD_ACRE  FEC_PROX_LIQD_DEUD  FEC_ULT_LIQD_COMI
----------  ------------------  ------------------  ------------------
0140301892  24.05.2026          01.06.2026          07.04.2026

Reserva de intereses:

POSI_ACUMINTE_ACRE  POSI_ACUMINTE_DEUD  POSI_ACUMINTE_SGRO
------------------  ------------------  ------------------
          8.341,22                0,00                0,00

Impacto economico: 8.341,22€. Clientes afectados: 1. Servicio: Depositos (CRITICO).`,
  },
  {
    summary: 'SEPA-DD-B260526 — lote remesas devueltas sin procesar aviso al cedente',
    priority: 'High', labels: ['alto', 'sepa', 'domiciliaciones', 'batch', 'cedente'],
    description: `CONTINUACION SEPA-DD-B260526

Lote de devoluciones SEPA DD del ciclo 26/05 no ha generado los mensajes de aviso al cedente.
Las devoluciones estan contabilizadas pero el cedente no ha recibido notificacion R-transaction.

Detalle lote:

FICHERO          CEDENTE        IMPORTE_TOTAL  DEVOLS  ESTADO_AVISO
---------------  -------------  -------------  ------  ------------
DD260526_001     ES12ABC1234    48.230,00       127    NO_ENVIADO
DD260526_002     ES34DEF5678    12.870,50        43    NO_ENVIADO
DD260526_003     ES56GHI9012     3.410,00        18    NO_ENVIADO

Motivos devolucion mas frecuentes:

CODIGO  DESCRIPCION                     CANTIDAD
------  ------------------------------  --------
AM04    Fondos insuficientes                  91
AC04    Cuenta cerrada                        52
MS02    Solicitud devolucion deudor           45

Tiempo sin aviso: 18h. Plazo maximo PSD2 para notificacion R-transaction: 24h.
Impacto regulatorio: incumplimiento PSD2 Art. 89 si no se resuelve en 6h.`,
  },
  {
    summary: 'HIPD-0312 — calculo tipo variable hipoteca cliente 7823401 erroneo Euribor mayo',
    priority: 'Medium', labels: ['medio', 'hipoteca', 'euribor', 'host', 'interes'],
    description: `HIPD-0312 REVISION TIPO HIPOTECARIO

Cliente 7823401 detecta discrepancia en el tipo de interes aplicado en la revision anual de mayo 2026.
El sistema ha aplicado Euribor + diferencial incorrecto.

Datos hipoteca:

PRESTAMO      TITULAR      FEC_REVISION  EURIBOR_REF  DIFERENCIAL  TIPO_APLIC  TIPO_CORRECTO
------------  -----------  ------------  -----------  -----------  ----------  -------------
HIP-20180312  7823401      01.05.2026    2,487%       0,750%       4,250%      3,237%

Cuota calculada vs correcta:

PERIODO  CAPITAL_PEND   CUOTA_APLIC  CUOTA_CORR  DIFERENCIA
-------  -------------  -----------  ----------  ----------
May-26   187.430,12     1.247,80     1.103,20      144,60
Jun-26   187.021,44     1.247,80     1.103,20      144,60

Euribor publicado BdE 01/05/2026: 2,487%. Sistema aplico: 3,500% (valor de abril no actualizado).
Sobrecargo acumulado: 289,20€. Normativa: Ley 5/2019 Art. 21. Cliente exige devolucion.`,
  },

  // ── Estilo narrativo (bien descritos, como los anteriores) ────────────────────
  {
    summary: '[CRÍTICO] Fraude masivo tarjetas — 47 cargos no reconocidos e-commerce últimas 6h',
    priority: 'Highest', labels: ['critico', 'fraude', 'tarjeta', 'ecommerce', 'multisegmento'],
    description: `Desde las 03:00h del 26/05/2026 se detecta un patrón de fraude coordinado en tarjetas de débito y crédito mediante cargos fraudulentos en comercios e-commerce extranjeros (principalmente .ro y .ng).
Alertas registradas: más de 300 transacciones marcadas por el motor antifraude en las últimas 6 horas.
Clientes afectados estimados: más de 300 titulares con al menos un cargo no reconocido.
Importe total bloqueado: estimado en 78.400€.
Referencia incidencia: INC-20260526-FRAUD-ECOM-047. Servicio: fraud-detection, card-service.
Cliente ID 4521847 con 3 cargos por 1.240€ desde IP rumana. Cliente ID 8834219 con cargo de 890€ en comercio nigeriano.
Los cargos siguen activos — el motor antifraude no está bloqueando automáticamente.
Requiere bloqueo masivo preventivo y reporte urgente a VISA/Mastercard. Posible filtración de datos de tarjeta.`,
  },
  {
    summary: '[ALTO] Alerta AML — cliente 3312091 smurfing confirmado, transferencias fraccionadas SEPBLAC',
    priority: 'High', labels: ['alto', 'aml', 'sepblac', 'blanqueo', 'compliance'],
    description: `El equipo de Cumplimiento detecta el 25/05/2026 un patrón de smurfing en la cuenta del cliente ID 3312091 (Banca Privada, incorporado 03/2025).
En los últimos 30 días se han realizado 14 transferencias de entre 8.000€ y 9.500€ a 6 cuentas beneficiarias distintas en Alemania, Bulgaria y Chipre — todas por debajo del umbral declarativo de 10.000€.
Referencia expediente AML: AML-20260525-3312091. Servicio: aml-engine, sepa-gateway.
Importe total transferido: 118.700€ en 30 días.
El cliente no tiene actividad económica justificada para este volumen. Última declaración de origen de fondos: 2023.
Los scoring KYC han escalado de 2/10 a 8/10 en los últimos 45 días.
Obligación de reporte a SEPBLAC en un máximo de 10 días hábiles según Ley 10/2010 Art. 18. Cuenta debe quedar bloqueada para operativa hasta resolución del expediente.`,
  },
  {
    summary: '[ALTO] App móvil: autenticación SCA PSD2 falla — clientes no pueden aprobar pagos',
    priority: 'High', labels: ['alto', 'psd2', 'sca', 'auth', 'mobile-app'],
    description: `Desde el 26/05/2026 a las 07:15h los clientes no pueden completar la autenticación reforzada (SCA) PSD2 desde la app móvil para aprobar transferencias y pagos en comercios online.
Alertas registradas: más de 80 incidencias reportadas por clientes en el canal de soporte.
Clientes afectados estimados: más de 300 usuarios activos en la franja horaria de mañana.
El OTP por SMS se envía correctamente, pero la validación en la app devuelve error "Sesión de autorización expirada" aunque el OTP se introduce en plazo.
Referencia incidencia: INC-20260526-SCA-PSD2-815. Servicio: auth-service, mobile-app.
Cliente ID 6678321 no puede aprobar transferencia urgente de 45.000€ a proveedor.
Cliente ID 2234897 bloqueado en checkout de comercio online — tres intentos fallidos.
El servicio auth-service v4.2.1 fue desplegado esta mañana a las 06:45h — posible regresión en validación de tokens SCA.`,
  },
  {
    summary: '[MEDIO] GDPR — cliente 9901234 ejerce derecho supresión, plazo 72h incumplido',
    priority: 'Medium', labels: ['medio', 'gdpr', 'rgpd', 'privacidad', 'compliance'],
    description: `El cliente ID 9901234 ejerció el derecho de supresión de datos personales el 22/05/2026 mediante escrito enviado al DPO (recibido y sellado digitalmente a las 09:00h).
El plazo máximo de respuesta bajo RGPD Art. 17 es de 72 horas — vence el 25/05/2026 a las 09:00h.
A fecha 26/05/2026 el cliente no ha recibido confirmación de ejecución ni acuse de recibo.
Referencia expediente: GDPR-SUP-20260522-9901234.
El cliente es ex-empleado — la solicitud incluye datos de nóminas, informes de riesgo y correspondencia interna.
El DPO ha confirmado que la solicitud es procedente y no afecta a obligaciones de retención fiscal.
Riesgo de denuncia ante la AEPD activo. Sanción potencial: hasta 20M€ o 4% facturación global (RGPD Art. 83.5).
Requiere confirmación urgente de ejecución técnica en todos los sistemas: core-banking, CRM, data-lake, backup.`,
  },
  {
    summary: '[MEDIO] Bizum duplicado — cliente 5543218 cobrado dos veces misma operación',
    priority: 'Medium', labels: ['medio', 'bizum', 'duplicado', 'reclamacion', 'psd2'],
    description: `El cliente ID 5543218 (Particulares) reporta el 26/05/2026 que una transferencia Bizum de 350€ enviada a contacto 612345678 el 24/05/2026 a las 19:32h aparece duplicada en su extracto — dos cargos de 350€ con diferencia de 3 segundos.
Referencia operación 1: BIZ-20260524-553421-001 (19:32:14).
Referencia operación 2: BIZ-20260524-553421-002 (19:32:17).
El destinatario confirma haber recibido solo un ingreso de 350€.
El cliente exige devolución inmediata de los 350€ duplicados.
La app mostró timeout en el primer intento, lo que llevó al cliente a reintentar — el sistema procesó ambos.
Referencia incidencia: INC-20260526-BIZ-DUP-5543218. Servicio: bizum-gateway, core-banking.
Normativa aplicable: PSD2 Art. 76 (devolución no autorizada). Plazo máximo respuesta: siguiente día hábil.
Posible bug sistémico si hay más casos — revisar log de Bizum últimas 48h para detectar patrón.`,
  },
  {
    summary: '[BAJO] Extracto PDF mayo corrupto — clientes Banca Privada zona Levante',
    priority: 'Low', labels: ['bajo', 'extracto', 'pdf', 'banca-privada', 'banca-online'],
    description: `Cuatro clientes de Banca Privada en la zona Levante reportan entre el 24 y 26/05/2026 que los extractos PDF de mayo descargados desde banca online presentan columnas desalineadas e importes ilegibles en las páginas 3 y 4.
Alertas registradas: menos de 20 (4 reportes manuales vía gestor personal).
Clientes afectados estimados: menos de 300. Posiblemente limitado a cuentas con más de 50 movimientos mensuales.
Referencia: INC-20260526-PDF-BP-LEV-004. Servicio: banca-online módulo generación documentos.
Cliente ID 9912378 (patrimonio >2M€) necesita el extracto para presentación ante notario el 28/05.
El último deploy de la capa de rendering fue el 20/05/2026 v3.1.4 — el bug no afecta a extractos anteriores.
Cómo reproducir: descargar extracto mayo desde "Mis documentos" con cuenta de Banca Privada con >50 movimientos.`,
  },
  {
    summary: '[BAJO] Cliente 7712345 solicita portabilidad datos — fichero CSV incompleto generado',
    priority: 'Low', labels: ['bajo', 'gdpr', 'portabilidad', 'datos', 'compliance'],
    description: `El cliente ID 7712345 solicitó el 20/05/2026 el ejercicio del derecho de portabilidad de datos bajo RGPD Art. 20, recibiendo el día 23/05/2026 un fichero CSV automatizado.
Al revisar el fichero, el cliente detecta que faltan los movimientos de la cuenta de ahorro (IBAN ES91 0128 6425 0140 2340 16) de los años 2021 y 2022 — solo aparecen desde 2023.
Referencia expediente: GDPR-PORT-20260520-7712345. El fichero generado tiene 1.847 registros; el cliente estima que deberían ser al menos 3.200.
Servicio afectado: data-lake módulo exportación RGPD.
El equipo de DPO confirma que el período afectado fue migrado desde el sistema legacy en 2023 y puede estar en una tabla distinta no incluida en la query de exportación.
No hay urgencia regulatoria inmediata pero el plazo máximo RGPD es de 30 días desde la solicitud (vence el 19/06/2026).`,
  },
];

async function createIssueWithFallback(projectKey, issue) {
  const issueTypes = ['Task', 'Tarea', 'Story', 'Historia', 'Bug', 'Incidencia'];
  for (const typeName of issueTypes) {
    const fields = {
      project:     { key: projectKey },
      summary:     issue.summary,
      description: makeAdf(issue.description),
      issuetype:   { name: typeName },
      labels:      issue.labels,
    };
    // Añadir priority solo si está definida — algunos proyectos no la tienen habilitada
    if (issue.priority && issue.priority !== 'Medium') {
      fields.priority = { name: issue.priority };
    }
    const res = await asApp().requestJira(route`/rest/api/3/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ fields }),
    });
    const data = await res.json();
    if (res.ok && data.key) return { key: data.key, error: null };
    // Si el error es de issuetype, probar el siguiente; si es otro error, parar
    const errStr = JSON.stringify(data.errors || {});
    if (!errStr.toLowerCase().includes('issuetype') && !errStr.toLowerCase().includes('issue type')) {
      // Puede ser error de priority — reintentar sin priority
      const fields2 = { ...fields };
      delete fields2.priority;
      const res2 = await asApp().requestJira(route`/rest/api/3/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ fields: fields2 }),
      });
      const data2 = await res2.json();
      if (res2.ok && data2.key) return { key: data2.key, error: null };
      if (!JSON.stringify(data2.errors || {}).toLowerCase().includes('issuetype')) {
        return { key: null, error: JSON.stringify(data2) };
      }
    }
  }
  return { key: null, error: 'Ningún tipo de issue válido encontrado' };
}

resolver.define('createMockIssuesV5', async ({ context }) => {
  const projectKey = context?.extension?.project?.key || 'KAN';
  const created = [], errors = [];
  for (const issue of MOCK_ISSUES_V5) {
    try {
      const { key, error } = await createIssueWithFallback(projectKey, issue);
      if (key) created.push(key);
      else errors.push(`${issue.summary.substring(0, 40)}: ${error}`);
    } catch (e) { errors.push(`${issue.summary.substring(0, 40)}: ${e.message}`); }
  }
  return { success: errors.length === 0, created, errors };
});

// ─── Suite de prueba: cubre todos los campos del manual ───────────────────────
const MOCK_ISSUES_V4 = [
  {
    summary: '[CRÍTICO] Caída core-banking — procesamiento transacciones detenido',
    priority: 'Highest', labels: ['critico', 'core-banking', 'multisegmento', 'urgente'],
    description: `INCIDENCIA CRÍTICA. El servicio core-banking ha dejado de procesar transacciones a las 09:15h del 22/05/2026.
Alertas registradas: más de 300 avisos en el sistema de monitorización en los últimos 45 minutos.
Clientes afectados estimados: más de 5.000 (segmentos Corporativa, Banca Privada, Particulares).
Inactividad del servicio: más de 2 horas en función crítica de procesamiento.
Pérdida económica estimada: superior a 500.000€ en transacciones bloqueadas.
Referencia incidencia: INC-20260522-CORE-CRITICAL. Servicio: core-banking.
Cómo reproducir: cualquier operación de cargo/abono retorna error E-5001 "Transaction processor unavailable".
La incidencia afecta también a la sucursal de Portugal (PTINC). Requiere escalado inmediato.`,
  },
  {
    summary: '[CRÍTICO] Red de cajeros ATM caída en zona Madrid — 38 unidades offline',
    priority: 'Highest', labels: ['critico', 'cajero', 'atm', 'urgente', 'madrid'],
    description: `A las 11:30h del 22/05/2026 se han desconectado 38 cajeros ATM en la zona Madrid-Norte y Madrid-Centro.
Alertas registradas en el sistema: más de 200 notificaciones automáticas.
Clientes afectados estimados: más de 1.200 intentos de disposición rechazados en la última hora.
Inactividad del servicio: más de 2 horas y media desde el inicio de la caída.
Causa probable: expiración del certificado HSM en el concentrador ATM-MAD-02.
Referencia: INC-20260522-ATM-MAD-38. Servicio: cajero.
Cómo reproducir: cualquier operación en cajeros zona Madrid retorna "Servicio no disponible temporalmente".
Segmentos afectados: Particulares, PYMES, Empresas. Pérdida reputacional significativa.`,
  },
  {
    summary: '[ALTO] Fallo autorización Visa/Mastercard — TPV comercios bloqueados',
    priority: 'High', labels: ['alto', 'visa', 'mastercard', 'tpv', 'payment-gateway'],
    description: `Desde las 14:22h el servicio payment-gateway no responde a las peticiones de autorización de las redes Visa y Mastercard.
Alertas registradas: más de 80 notificaciones de comercios en los últimos 30 minutos.
Clientes afectados estimados: más de 400 titulares de tarjeta con operaciones rechazadas.
Referencia: INC-20260522-VISA-AUTH-4422. Servicio: payment-gateway.
Cliente ID 5521089 reporta imposibilidad de pagar en supermercado. Cliente ID 3312847 bloqueado en gasolinera.
Cómo reproducir: cualquier pago con tarjeta en TPV físico retorna código de rechazo 05 (Do not honor).
Segmentos afectados: Particulares, PYMES. Posible pérdida económica superior a 100.000€ si se prolonga.`,
  },
  {
    summary: '[ALTO] Banca online inaccesible — fallo tras deploy auth-service v4.2.1',
    priority: 'High', labels: ['alto', 'banca-online', 'auth-service', 'deploy'],
    description: `A las 08:00h se desplegó auth-service v4.2.1. A las 08:47h comenzaron a llegar alertas de imposibilidad de acceso a banca online.
Alertas registradas: más de 150 tickets automáticos en el sistema de monitorización.
Clientes afectados estimados: más de 800 usuarios con sesión activa perdida o imposibilidad de login.
Inactividad del servicio de autenticación: más de 2 horas en función crítica.
Referencia: INC-20260522-AUTH-BNK-821. Servicio: auth-service.
Cliente ID 6678321 no puede acceder desde las 08:50h — transferencia urgente pendiente.
Cómo reproducir: acceder a banca online retorna error 503 "Authentication service unavailable".
El rollback del deploy está siendo evaluado por el equipo.`,
  },
  {
    summary: '[ALTO] Transferencias SEPA internacionales bloqueadas — posible AML',
    priority: 'High', labels: ['alto', 'sepa', 'aml', 'internacional', 'compliance'],
    description: `El sistema de cumplimiento AML ha bloqueado automáticamente todas las transferencias SEPA a destinos internacionales desde las 10:00h.
Alertas registradas en sistema AML: más de 45 operaciones marcadas en la última hora.
Clientes afectados estimados: más de 320 clientes con operativas internacionales habituales.
La incidencia afecta a operativas con Marruecos, Alemania y Portugal — posible falso positivo masivo.
Referencia: INC-20260522-AML-SEPA-INT. Servicio: sepa-gateway. Pérdida económica estimada: 150.000€.
Cliente ID 8834219 (importador textil) bloqueado. Cliente ID 7891234 con transferencia urgente a Frankfurt.
Cómo reproducir: cualquier SEPA a IBAN extranjero retorna "Operación retenida por cumplimiento".
Requiere revisión urgente por compliance y posible reporte a SEPBLAC si se confirma patrón AML.`,
  },
  {
    summary: '[MEDIO] App móvil: notificaciones push no llegan — clientes sin alertas fraude',
    priority: 'Medium', labels: ['medio', 'mobile-app', 'notificaciones', 'push'],
    description: `Desde el 21/05/2026 a las 22:00h el servicio de notificaciones push de la app móvil presenta fallos intermitentes.
Alertas registradas: menos de 20 notificaciones automáticas (incidencia detectada por monitorización proactiva).
Clientes afectados estimados: menos de 300 usuarios activos en el turno nocturno, pero el problema persiste.
El proveedor Vonage reporta incidencia en su infraestructura de Firebase.
Referencia: INC-20260522-PUSH-MOB-221. Servicio: mobile-app, notification-service.
Cliente ID 4421773 no recibió alerta de operación sospechosa — tarjeta usada sin su conocimiento.
Cómo reproducir: ejecutar push notification desde panel de administración — entrega falla silenciosamente.
Segmentos afectados: Particulares. Sin inactividad total del servicio pero con impacto en seguridad.`,
  },
  {
    summary: '[MEDIO] Error cálculo intereses depósito estructurado — cliente 8819034',
    priority: 'Medium', labels: ['medio', 'deposito', 'intereses', 'core-banking'],
    description: `El cliente ID 8819034 (segmento Banca Privada) detecta un error en el cálculo de intereses de su depósito estructurado referenciado al IBEX-35.
El cupón garantizado del 3% anual ha sido calculado como 1,8% en la liquidación trimestral de mayo 2026.
Referencia producto: DEP-IBEX-20230601-8819034. Referencia liquidación: LIQ-20260522-8819034.
Importe en disputa: diferencia de 1.240€ en la liquidación del trimestre.
Servicio afectado: core-banking módulo de productos estructurados.
Alertas registradas: menos de 20 (caso individual). Clientes afectados estimados: menos de 300.
Cómo reproducir: consultar detalle de liquidación en ficha del producto — muestra tipo base incorrecto.
El cliente amenaza con denuncia a la CNMV si no se resuelve en 48h. Normativa: MiFID II Art. 27.`,
  },
  {
    summary: '[MEDIO] Scoring crediticio devuelve 0 para solicitudes PYMES — fallo sistémico',
    priority: 'Medium', labels: ['medio', 'scoring', 'pymes', 'credito', 'payment-gateway'],
    description: `Desde el 22/05/2026 a las 09:00h el sistema de scoring devuelve puntuación 0 para todas las solicitudes de crédito de clientes PYMES.
Alertas registradas: menos de 20 (detectado por el equipo de riesgos).
Clientes afectados estimados: menos de 300 PYMES con solicitudes pendientes de tramitación.
Referencia incidencia: INC-20260522-SCORING-PYME. Servicio: payment-gateway módulo scoring.
Cliente ID 1134872 (PYME con facturación 2M€/año) rechazado con scoring 0 — préstamo de circulante urgente.
Cómo reproducir: enviar solicitud de crédito para CIF tipo B — el motor devuelve siempre score=0.
El último deploy del módulo de scoring fue ayer a las 16:00h. Requiere rollback urgente.`,
  },
  {
    summary: '[BAJO] Cliente 6634521 reclama cobro domiciliación incorrecta — seguro vida',
    priority: 'Low', labels: ['bajo', 'seguro', 'domiciliacion', 'reclamacion'],
    description: `El cliente ID 6634521 (Particulares) reporta un cargo de 87,50€ el 20/05/2026 de "Seguros Vida Colectivo" que no reconoce.
Alertas registradas: menos de 20 (caso individual).
Clientes afectados estimados: menos de 300 (caso aislado, posible error de domiciliación).
Referencia cargo: DOM-20260520-VIDA-6634521. Mandato SEPA: M-VIDA-2019-6634521.
El cliente afirma haber cancelado la póliza en marzo 2026 mediante escrito certificado.
Cómo reproducir: consultar mandatos SEPA activos del cliente — aparece un mandato que debería estar cancelado.
Segmentos afectados: Particulares. Sin inactividad ni pérdida sistémica. Caso de resolución estándar.`,
  },
  {
    summary: '[BAJO] Error visualización extracto PDF — clientes Banca Privada',
    priority: 'Low', labels: ['bajo', 'extracto', 'pdf', 'banca-privada', 'banca-online'],
    description: `Varios clientes de Banca Privada reportan que los extractos PDF descargados desde banca online aparecen con formato corrupto — columnas desalineadas y algunos importes ilegibles.
Alertas registradas: menos de 20 notificaciones (4 clientes han contactado con su gestor personal).
Clientes afectados estimados: menos de 300 (segmento Banca Privada con extractos de mayo 2026).
Referencia: INC-20260522-PDF-BP-004. Servicio: banca-online módulo generación de documentos.
Cliente ID 9912378 (Banca Privada, patrimonio >1M€) muy molesto — extracto necesario para declaración fiscal.
Cómo reproducir: descargar extracto mensual mayo 2026 desde "Mis documentos" en banca online — PDF generado incorrectamente.
El equipo sospecha de un bug introducido en el último deploy de la capa de rendering de documentos.`,
  },
];

resolver.define('createMockIssuesV4', async ({ context }) => {
  const projectKey = context?.extension?.project?.key || 'KAN';
  const created = [], errors = [];
  for (const issue of MOCK_ISSUES_V4) {
    try {
      const { key, error } = await createIssueWithFallback(projectKey, issue);
      if (key) created.push(key);
      else errors.push(`${issue.summary.substring(0, 40)}: ${error}`);
    } catch (e) { errors.push(`${issue.summary.substring(0, 40)}: ${e.message}`); }
  }
  return { success: errors.length === 0, created, errors };
});

// ─── Suite V6: incidencias de operativa interna — estilo HOST/API operacional ──
const MOCK_ISSUES_V6 = [
  {
    summary: 'SIFG-HOST — Aval contingente EXP-0881234 contabilizado por importe erróneo',
    priority: 'High', labels: ['alto', 'avales', 'host', 'contabilidad', 'correccion-importe'],
    description: `El aval contingente del expediente EXP-0881234 (empresa TRANSPORTES MOLINA GLOBAL SL) fue contabilizado el 12/03/2026 por importe de 45.000€ cuando debería haber sido 49.500€.
Referencia aval: AVL-20260312-0881234. Oficina gestora: 4201.
El error afecta al cálculo de comisiones de contingencia trimestral y al reporting de riesgos contingentes.

Análisis previo del gestor:
- Contabilizado actualmente: 45.000€. Contingencias acumuladas actuales: 1.134,00€
- Si se hubiera contabilizado por 49.500€ desde inicio: contingencias acumuladas = 1.247,38€ (diferencia: +113,38€)
- Comisiones de riesgo trimestral Q1 2026 cobradas incorrectamente: -45,35€ pendientes de regularizar

Solicitan corrección del importe nominal en el sistema SIFG-HOST y recálculo de contingencias desde la fecha de contabilización original.
Las comisiones de riesgo trimestral no se corrigen solas hasta el próximo ciclo — valorar corrección extraordinaria.
Servicio: SIFG (Sistema Integral de Financiación y Garantías). Entorno: HOST.`,
  },
  {
    summary: 'PROHIP-HOST — Descuadre cuenta restringida gestoría GES-4201-07 supera umbral auditoría',
    priority: 'High', labels: ['alto', 'hipotecario', 'host', 'descuadre', 'cuenta-restringida'],
    description: `En el cuadre mensual de mayo 2026, la cuenta restringida de la gestoría GES-4201-07 (GESTIONES NOTARIALES CENTRO SL) presenta un descuadre de 3.847,22€.
Cuenta restringida interna: 0140-4201/0038291.7. Fecha detección: 30/05/2026.

El descuadre supera el umbral autorizado por Auditoría Interna (±500€), bloqueando el cierre contable mensual de esta gestoría.

Causa probable: en el volcado del expediente hipotecario Z0427-EXP-2024-HC-03821 desde el sistema legacy en 2024, se incluyó una provisión de liquidación parcial de 3.847,22€ que ya había sido regularizada en el sistema original antes de la migración, generando un saldo fantasma en la cuenta restringida.

Acciones necesarias:
1. Verificar en el sistema legacy que la provisión de 3.847,22€ estaba efectivamente regularizada antes de la migración.
2. Si se confirma, emitir asiento de corrección con validación de Back Office.
3. Actualizar el registro de desviaciones autorizadas si procede.
Servicio: PROHIP (Proceso Hipotecario). Entorno: HOST.`,
  },
  {
    summary: 'SICART-API — Empresa B-27831049 condiciones cartera bloque gastos domiciliados muestra tarifa incorrecta',
    priority: 'Medium', labels: ['medio', 'cartera', 'api-v2', 'condiciones', 'empresas'],
    description: `Para la empresa NIF B-27831049 (DISTRIBUCIÓN NORTE INDUSTRIAL SL), en el portal de empresas sección cobros/cartera/condiciones, el bloque "Gastos por documentos domiciliados" muestra valores incorrectos para la cuenta ES76 9128 4201 0140 2291 83.

Datos mostrados incorrectamente vs contrato firmado (CART-20240214-27831049):
- Comisión de gestión domiciliada mostrada: 0,45% — correcto según contrato: 0,28%
- Mínimo por documento mostrado: 12,00€ — correcto según contrato: 8,50€

El resto de condiciones (descuento comercial, anticipo facturas) se muestran correctamente.

Impacto económico: la liquidación de mayo 2026 aplicó las condiciones erróneas — sobrecargo estimado al cliente: 234,60€.
Causa probable: caché de condiciones de cartera en la API v2 devuelve la tarifa genérica v2 en lugar de la tarifa contractual negociada.
Entorno: Desarrollo API v2 producción.`,
  },
  {
    summary: 'GENEXT-HOST — Extractos integrales enviados por email llegan dañados e ilegibles — PDF incompatible',
    priority: 'Medium', labels: ['medio', 'extracto', 'pdf', 'email', 'genext', 'docsend'],
    description: `Desde el 20/05/2026 se están recibiendo reportes de clientes que indican que los extractos integrales mensuales enviados por email llegan dañados y no pueden visualizarse.
Referencia incidencia: INC-20260520-GENEXT-PDF-022.
Casos confirmados: 17 clientes reportados en los últimos 7 días.

Patrón detectado: afecta exclusivamente a extractos de cuentas con más de 80 movimientos mensuales. Los extractos con menos movimientos llegan correctamente.

Diagnóstico técnico:
- El servicio GENEXT genera los PDFs con especificación v1.7.
- El estándar interno aprobado es PDF/A-1b (basado en PDF 1.4).
- El cliente de correo Outlook 365 tiene problemas conocidos abriendo PDF 1.7 sin plugin de Adobe.
- El mismo fichero se abre correctamente en Adobe Acrobat Reader.

La plataforma de distribución DOCSEND-v2.3.1 no está validando la versión del PDF antes del envío.
Servicio: GENEXT (Generación de Extractos) + DOCSEND-v2. Entorno: HOST producción.`,
  },
  {
    summary: 'SIMREN-WEB — Error RARORAC_CALC_ERROR en propuestas sin grupo legal — 8 operaciones bloqueadas',
    priority: 'Medium', labels: ['medio', 'simulador-rentabilidad', 'rarorac', 'riesgos', 'deploy'],
    description: `El simulador de rentabilidad SIMREN devuelve error al calcular el RARORAC para propuestas donde el campo "grupo legal" está vacío.
Error: "RARORAC_CALC_ERROR: parámetro grupo_legal es null — no se puede calcular capital regulatorio".
Referencia ticket origen: ARGO-20260524-RIE-11654.

Casos afectados: propuestas de préstamo a clientes de alta reciente, pendientes de asignación de grupo legal en el sistema.
El error impide procesar 8 propuestas pendientes de aprobación por el equipo de Gestión de Riesgos SUR, con volumen total estimado de 3,2M€.

Causa raíz identificada: el deploy SIMREN v4.1.2 del 22/05/2026 introdujo una validación obligatoria del campo grupo_legal que no existía en versiones anteriores — las propuestas generadas antes de ese deploy no tienen el campo y quedan bloqueadas.

Workaround disponible pero no aprobado formalmente: introducir código GRPGEN000 (grupo genérico) para desbloquear el cálculo, documentando que es un valor provisional.
Solicitan: (1) aprobación formal del workaround por Riesgos, o (2) rollback de la validación con fix no breaking.
Entorno: Desarrollo WEB Cliente / producción.`,
  },
  {
    summary: 'GETRF-HOST — 43 devoluciones SEPA en estado PENDIENTE_ABONO en centro 0140 por IBAN reestructurado',
    priority: 'High', labels: ['alto', 'transferencias', 'devoluciones', 'sepa', 'host', 'migracion'],
    description: `Incremento inusual de devoluciones SEPA bloqueadas en estado PENDIENTE_ABONO en el centro operativo 0140 (Centro de Operaciones Centrales).
Referencia incidencia: INC-20260526-GETRF-DEV-0140.
Devoluciones afectadas: 43 operaciones / importe total: 67.840,00€ / acumuladas en los últimos 5 días.

Causa confirmada: las transferencias originales se cursaron desde cuentas cuyo IBAN fue reestructurado durante el plan de reorganización territorial Q1 2026. El sistema GETRF no consigue casar la devolución con la transferencia de origen porque el IBAN antiguo ya no existe en la tabla de cuentas activas.

La tabla IBAN_CORRESPONDENCIAS (mapeo IBAN antiguo → IBAN nuevo) debería estar siendo consultada en el proceso de matching pero no lo está desde el último pase de GETRF.

Impacto regulatorio: PSD2 Art. 89 exige que las R-transactions se notifiquen al cedente en <24h. Varias de las 43 devoluciones superan ya ese plazo.
Servicio: GETRF (Gestión de Transferencias). Entorno: HOST.`,
  },
  {
    summary: 'ANTIPBC-HOST — 34 clientes no pueden actualizar diligencias KYC — deadlock BD post-mantenimiento',
    priority: 'High', labels: ['alto', 'pbc', 'kyc', 'diligencias', 'host', 'deadlock'],
    description: `Desde el 27/05/2026 a las 08:30h, clientes con renovación KYC pendiente no pueden completar la actualización de sus diligencias debidas en el portal web. Reciben error: "No se ha podido completar la actualización. Por favor contacte con su oficina o banca telefónica."
Referencia incidencia: INC-20260527-ANTIPBC-KYC-089.
Clientes afectados: 34 con renovación KYC pendiente/vencida.

Diagnóstico: conflicto de réplica en el sistema ANTIPBC. La tabla DILIG_ESTADO tiene un deadlock entre nodo primario y réplica de lectura, originado tras el mantenimiento programado de BD del 25/05/2026.

Riesgo regulatorio crítico: 8 de los 34 clientes llevan más de 30 días sin renovar su ficha KYC. Según Ley 10/2010 Art. 14, si no se resuelve antes del 30/05/2026, el sistema bloqueará automáticamente su operativa, lo que generará incidencias adicionales con impacto en clientes.
Servicio: ANTIPBC (Sistema Anti-Blanqueo de Capitales). Entorno: HOST.`,
  },
  {
    summary: 'PORTEMP-API — Empresa A-38921047 no puede firmar operaciones multiorden — error SIGN-ERR-4421',
    priority: 'Medium', labels: ['medio', 'portal-empresas', 'multiorden', 'firma-digital', 'api-v2', 'deploy'],
    description: `La empresa NIF A-38921047 (INVERSIONES Y VALORES CENTRALES SA) no puede completar la firma de órdenes de bolsa mediante multiorden en el portal de empresas web.
Error al intentar firmar: "Error de sesión de firma: token de autorización no válido para operativa multiorden. Código: SIGN-ERR-4421"
Referencia incidencia: INC-20260527-PORTEMP-MO-038.

La empresa operaba correctamente hasta el 23/05/2026. Desde el 24/05 falla de forma consistente.
Workaround disponible: canal bróker directo — pero el cliente necesita multiorden por volumen de operaciones (>50 órdenes diarias) y el bloqueo tiene impacto económico directo en su negocio.

Correlación temporal confirmada: el 23/05/2026 se desplegó FIRMADIG v2.8.4 en producción, que modificó la estructura del token JWT para operaciones de firma. El scope 'FIRMADIG:MULTIORDEN:WRITE' ya no es reconocido por la versión anterior del cliente portemp-api.
Servicio: PORTEMP (Portal Empresas API v2) + FIRMADIG (Servicio Firma Digital). Entorno: API v2 producción.`,
  },
  {
    summary: 'PORTEMP-API — Ficheros N43 mayo con movimientos duplicados y faltantes — 2 empresas afectadas ERP descuadrado',
    priority: 'High', labels: ['alto', 'portal-empresas', 'n43', 'cuaderno-bancario', 'api-v2', 'contabilidad'],
    description: `Empresas usuarias del portal de empresas API v2 reportan anomalías en los ficheros N43 (cuaderno bancario AEB) de mayo 2026.

Casos confirmados:
- Empresa NIF B-51293847 (SERVICIOS LOGÍSTICOS RÁPIDOS SL): movimientos del 15/05 al 19/05 ausentes — 23 transacciones faltantes / 18.430€ no reflejados en el fichero.
- Empresa NIF A-63847291 (COMERCIAL DISTRIBUCIÓN PENINSULAR SA): 7 movimientos duplicados entre 20/05 y 25/05 — saldo final del N43 excedido en 9.870€ de forma ficticia.

Referencia incidencia: INC-20260527-PORTEMP-N43-051.
Los ficheros N43 del canal legacy (banca online v1) son correctos — el problema es exclusivo de API v2.

Causa raíz probable: el módulo de exportación N43 en API v2 filtra movimientos por fecha_proceso en lugar de fecha_valor, causando solapamiento en cierres de lote nocturno y duplicados/omisiones en los rangos de fecha afectados.

Impacto: ambas empresas usan estos ficheros para conciliación contable automática en su ERP — el error está generando descuadres contables en sus sistemas.
Servicio: PORTEMP API v2, módulo N43. Entorno: Producción API v2.`,
  },
  {
    summary: 'PORTEMP-API — Rechazo consentimientos RGPD contrato SUC-0952 no persiste — 12 empresas afectadas',
    priority: 'High', labels: ['alto', 'portal-empresas', 'consentimientos', 'rgpd', 'api-v2', 'legal'],
    description: `Para contratos firmados bajo el modelo SUC-0952 (contrato marco de servicios digitales para empresas, vigente desde enero 2026), cuando el administrador de la empresa rechaza algún consentimiento en el flujo de firma, la selección no persiste correctamente.
Referencia incidencia: INC-20260527-PORTEMP-CONS-067.

Comportamiento observado: el usuario rechaza el consentimiento de "cesión de datos a terceros para análisis de riesgo crediticio". El sistema muestra confirmación de guardado. En la siguiente sesión el consentimiento aparece como ACEPTADO.

Casos confirmados: 12 empresas con contrato SUC-0952 firmado entre el 01/05/2026 y el 20/05/2026.

Causa raíz confirmada por desarrollo en entorno PRE: el payload del microservicio de consentimientos llega correctamente desde el front, pero micro-consentimientos-api v1.3.0 tiene un bug en la capa de persistencia — al serializar el objeto de respuesta, los campos booleanos con valor false se convierten en null y no se persisten en base de datos.

Riesgo regulatorio RGPD: el banco está potencialmente tratando datos de clientes que han ejercido su derecho de oposición (Art. 21 RGPD) sin que ese rechazo esté registrado — riesgo de sanción AEPD si afecta a más de 10 personas (ya superado).
Servicio: PORTEMP API v2, micro-consentimientos-api v1.3.0. Entorno: Producción API v2.`,
  },
];

// ─── Suite V7: operativa interna — descripciones vagas estilo operario ────────
const MOCK_ISSUES_V7 = [
  {
    summary: 'SIFG-HOST — Garantía pignoraticia clasificada como aval simple, ratio de cobertura incorrecto',
    priority: 'High', labels: ['alto', 'sifg', 'avales', 'host', 'garantia', 'contabilidad'],
    description: `Gestor de riesgos avisa que una garantía pignoraticia del sistema SIFG aparece clasificada como aval simple.
Le está afectando al ratio de cobertura del trimestre. Referencia expediente: SIFG-EXP-448821.
Necesitamos que lo revise el equipo de SIFG para corregir la tipología y recalcular contingencias.`,
  },
  {
    summary: 'GETRF-HOST — Proceso nocturno transferencias SEPA no completó, operaciones pendientes de aplicar',
    priority: 'High', labels: ['alto', 'getrf', 'sepa', 'transferencias', 'host', 'batch'],
    description: `El proceso nocturno GETRF de anoche se quedó parado a mitad. Hay devoluciones SEPA pendientes de abono en el centro operativo que no se han aplicado.
Parece que pasó después de las dos de la mañana. Los de Back Office están esperando para poder procesar manualmente si hace falta.
Referencia lote: GETRF-LOTE-260527.`,
  },
  {
    summary: 'GENEXT-HOST — PDFs certificados retención IRPF cierre fiscal llegan corruptos a clientes',
    priority: 'Medium', labels: ['medio', 'genext', 'pdf', 'extracto', 'docsend', 'irpf'],
    description: `Estamos recibiendo quejas de que los certificados de retención IRPF que genera el GENEXT para el cierre fiscal llegan con el PDF roto.
Solo pasa con los que tienen más de veinte páginas, los más cortos están bien. Se distribuyen vía DOCSEND.
No sabemos si es un problema del generador o de la plataforma de envío.`,
  },
  {
    summary: 'ANTIPBC-HOST — Cliente ID 5521089 bloqueado por falso positivo en lista de sanciones',
    priority: 'High', labels: ['alto', 'antipbc', 'blanqueo', 'kyc', 'host', 'falso-positivo'],
    description: `El cliente ID 5521089 está bloqueado por el ANTIPBC porque su nombre coincide con alguien en una lista de sanciones, pero lleva años con nosotros y tiene todos los documentos en regla.
El cliente está intentando hacer una transferencia urgente y no puede operar.
Hay que revisar si es un falso positivo y desbloquear si procede.`,
  },
  {
    summary: 'PORTEMP-API — Ficheros XML SEPA exportados del portal tienen campo BIC vacío',
    priority: 'Medium', labels: ['medio', 'portemp', 'sepa', 'api-v2', 'empresas', 'xml'],
    description: `Empresa llama porque los ficheros XML SEPA que exporta del portal para cargarlos en su ERP tienen el campo BIC vacío.
Le da error al importarlos porque el BIC es obligatorio. Lo descarga desde la sección de transferencias del portal empresas API v2.
En el canal antiguo le salía bien, el problema parece ser del portal nuevo.`,
  },
  {
    summary: 'PROHIP-HOST — Novación hipotecaria de ayer en estado incorrecto, intereses no cuadran',
    priority: 'High', labels: ['alto', 'prohip', 'hipotecario', 'host', 'novacion', 'descuadre'],
    description: `El gestor hipotecario llama diciendo que una novación que procesaron ayer en el PROHIP quedó en estado raro.
El expediente aparece como procesado pero los intereses de la nueva amortización no cuadran con lo que debería ser. La cuenta restringida de la gestoría también muestra un descuadre.
Referencia: PROHIP-NOV-260526. Necesita revisión urgente antes del cierre mensual.`,
  },
  {
    summary: 'SIMREN-WEB — Módulo RARORAC da timeout para contratos de leasing, equipo riesgos bloqueado',
    priority: 'Medium', labels: ['medio', 'simren', 'rarorac', 'simulador', 'riesgos', 'leasing'],
    description: `El equipo de riesgos no puede simular nada con contratos de leasing en el SIMREN.
Al intentar cargar el módulo RARORAC para ese tipo de producto se queda colgado y acaba dando timeout.
Con otros productos funciona bien, solo falla en leasing. Tienen propuestas pendientes de aprobación que no pueden avanzar.`,
  },
  {
    summary: 'FIRMADIG — Certificados de firma caducan a mitad de proceso, gestores no pueden firmar contratos',
    priority: 'High', labels: ['alto', 'firmadig', 'firma-digital', 'portemp', 'multiorden', 'certificados'],
    description: `Varios gestores comerciales avisan que al intentar firmar contratos en el portal les aparece error diciendo que el certificado de firma no es válido o ha caducado.
Parece que afecta a varios a la vez, no es un caso aislado. Algunos están a mitad de un proceso de firma con un cliente delante.
Área comercial está muy molesta. Referencia incidencia: FIRMADIG-INC-260527.`,
  },
  {
    summary: 'SICART-API — Liquidación cartera aplica condiciones antiguas pese a renovación de febrero',
    priority: 'Medium', labels: ['medio', 'sicart', 'cartera', 'condiciones', 'api-v2', 'liquidacion'],
    description: `Empresa llama porque la última liquidación de su cartera de recibos domiciliados no refleja las condiciones que firmaron en la renovación de contrato de febrero.
Les siguen aplicando las tarifas viejas. Según ellos tienen el contrato firmado con las nuevas condiciones pero en el sistema SICART no aparecen actualizadas.
Llevan dos liquidaciones consecutivas mal aplicadas.`,
  },
  {
    summary: 'ANTIPBC-HOST — Proceso renovación KYC masiva no envía comunicaciones, clientes sin recibir enlace actualización',
    priority: 'High', labels: ['alto', 'antipbc', 'kyc', 'diligencias', 'host', 'comunicaciones'],
    description: `El proceso de renovación KYC masiva de este mes no está enviando los avisos a los clientes.
Los clientes con renovación pendiente no están recibiendo el enlace para actualizar sus datos en el portal. Llevamos varios días y no ha salido ninguna comunicación.
Si no se resuelve pronto algunos clientes van a llegar al límite de plazo y se les bloqueará la operativa automáticamente.`,
  },
];

// ─── Suite V8: mix operativa interna + usuarios — descripciones vagas ────────
const MOCK_ISSUES_V8 = [
  {
    summary: 'PORTEMP-N43 — Fichero N43 empresa no cuadra con movimientos reales del lunes',
    priority: 'Medium', labels: ['medio', 'portemp', 'n43', 'cuaderno', 'empresas', 'aeb'],
    description: `Empresa de transportes llama porque el fichero N43 que descarga del portal no cuadra con los movimientos reales.
Faltan apuntes del lunes. Usan software contable norma AEB 43 y el error les bloquea el cierre semanal.
Ref. cuenta: NOM-CTA-883341.`,
  },
  {
    summary: 'MICRO-CONSENTIMIENTOS — Error al registrar consentimiento digital en sucursal, gestores bloqueados',
    priority: 'Medium', labels: ['medio', 'consentimiento', 'rgpd', 'sucursal', 'suc-0952'],
    description: `Operarios de la sucursal Suc-0952 avisan que al intentar registrar el consentimiento digital de nuevos clientes les da error en pantalla y no guarda.
No saben si afecta a todos los tipos de consentimiento o solo a uno concreto. Lo hacen desde la tablet del gestor.
Llevan así desde primera hora de la mañana.`,
  },
  {
    summary: 'BATCH NÓMINAS — Proceso nocturno parado, empleados empresa sin cobrar esta mañana',
    priority: 'High', labels: ['alto', 'batch', 'nomina', 'host', 'proceso-nocturno'],
    description: `Llaman de Back Office avisando que el proceso nocturno de nóminas no terminó.
Hay empleados de una empresa domiciliada que no han cobrado y están llamando a sucursales.
No saben en qué paso se quedó parado. Referencia proceso: NOM-BATCH-260528.`,
  },
  {
    summary: 'AUTH-SERVICE — Clientes no reciben código 2FA, banca online inoperativa desde esta mañana',
    priority: 'High', labels: ['alto', 'auth', '2fa', 'banca-digital', 'tecnica'],
    description: `Están llegando muchas llamadas de clientes que no reciben el código de verificación para entrar en banca online.
No sabemos si falla el canal SMS o la app. Parece que empezó sobre las 8:00 de hoy.
Afecta a clientes de perfil variado, no parece un caso aislado.`,
  },
  {
    summary: 'FRAUDE TARJETA — Cliente ID 3421198 con tres cargos no reconocidos, solicita bloqueo urgente',
    priority: 'High', labels: ['alto', 'fraude', 'tarjeta', 'cargo-no-reconocido', 'bloqueo'],
    description: `Cliente ID 3421198 llama muy alterado con tres cargos en e-commerce que no ha hecho, todos de ayer tarde.
Dice que la tarjeta física la tiene en casa y nunca la perdió. Pide bloqueo inmediato.
No ha facilitado más datos por teléfono.`,
  },
  {
    summary: 'RECLAMACIÓN — Cliente ID 6634901 doble cobro recibo comunidad, segunda vez en dos meses',
    priority: 'Medium', labels: ['medio', 'reclamacion', 'doble-cobro', 'domiciliacion', 'psd2'],
    description: `Cliente ID 6634901 reclama que le han pasado dos veces el mismo recibo de comunidad de vecinos.
El mes pasado ya ocurrió y se resolvió pero ha vuelto a pasar. Está muy molesto.
Pide devolución del importe duplicado y que se investigue por qué sigue ocurriendo.`,
  },
  {
    summary: 'AML — Cumplimiento detecta patrón de ingresos en efectivo en cuenta cliente ID 9912043',
    priority: 'High', labels: ['alto', 'aml', 'blanqueo', 'regulatoria', 'sepblac', 'smurfing'],
    description: `Cumplimiento avisa de ingresos en efectivo por debajo del umbral de notificación varias veces por semana en la cuenta del cliente ID 9912043.
Llevan así tres semanas. Hay que revisar si hay obligación de reporte a SEPBLAC y qué plazos aplican.`,
  },
  {
    summary: 'MiFID — Cliente ID 2287650 reclama fondo vendido sin test de idoneidad, pide devolución 18.000€',
    priority: 'Medium', labels: ['medio', 'mifid', 'fondo', 'inversion', 'reclamacion', 'idoneidad'],
    description: `Cliente ID 2287650 llama diciendo que le vendieron un fondo de inversión que no encaja con su perfil de riesgo.
Afirma que nunca le hicieron el test MiFID antes de contratar. Quiere la devolución de unos 18.000€.
Tiene previsto escalar al SAC si no se resuelve hoy.`,
  },
];

resolver.define('createMockIssuesV8', async ({ context }) => {
  const projectKey = context?.extension?.project?.key || 'KAN';
  const created = [], errors = [];
  for (const issue of MOCK_ISSUES_V8) {
    try {
      const { key, error } = await createIssueWithFallback(projectKey, issue);
      if (key) created.push(key);
      else errors.push(`${issue.summary.substring(0, 40)}: ${error}`);
    } catch (e) { errors.push(`${issue.summary.substring(0, 40)}: ${e.message}`); }
  }
  return { success: errors.length === 0, created, errors };
});

resolver.define('createMockIssuesV7', async ({ context }) => {
  const projectKey = context?.extension?.project?.key || 'KAN';
  const created = [], errors = [];
  for (const issue of MOCK_ISSUES_V7) {
    try {
      const { key, error } = await createIssueWithFallback(projectKey, issue);
      if (key) created.push(key);
      else errors.push(`${issue.summary.substring(0, 40)}: ${error}`);
    } catch (e) { errors.push(`${issue.summary.substring(0, 40)}: ${e.message}`); }
  }
  return { success: errors.length === 0, created, errors };
});

resolver.define('createMockIssuesV6', async ({ context }) => {
  const projectKey = context?.extension?.project?.key || 'KAN';
  const created = [], errors = [];
  for (const issue of MOCK_ISSUES_V6) {
    try {
      const { key, error } = await createIssueWithFallback(projectKey, issue);
      if (key) created.push(key);
      else errors.push(`${issue.summary.substring(0, 40)}: ${error}`);
    } catch (e) { errors.push(`${issue.summary.substring(0, 40)}: ${e.message}`); }
  }
  return { success: errors.length === 0, created, errors };
});

// ─── Suite V9: casuísticas HOST específicas + casos devolución ────────────────
// Grupo A: 12 incidencias happy-path (SIFG, PROHIP, GETRF, ANTIPBC, FIRMADIG,
//          N43, GENEXT, SIMREN, SICART, RGPD, fraude skimming, doble cobro)
// Grupo B:  3 incidencias diseñadas para devolución en PASO 0 (vagas/genéricas)
// Grupo C:  3 incidencias diseñadas para REQUIERE_INFORMACION_ADICIONAL
//           (contexto plausible pero faltan referencias operativas críticas)
const MOCK_ISSUES_V9 = [

  // ── GRUPO A — Happy path (casuísticas HOST nuevas) ────────────────────────

  {
    summary: '[SIFG] Aval bancario generado con importe 10x superior al solicitado — 450.000€ en lugar de 45.000€',
    priority: 'High',
    labels: ['sifg', 'avales', 'host', 'tecnica', 'test-v9'],
    description: `El operario de la oficina OFIC-4721 reporta que el módulo SIFG generó el aval bancario AVL-20260531-0047 por importe de 450.000€ en lugar de los 45.000€ solicitados por el cliente empresa DISTRIBUCIONES MOCK SA (CIF ficticio B-99887766). El documento ya fue entregado al cliente. El error se produjo tras el despliegue de la versión v3.8.1 del subsistema HOST-GARANTIAS el 28/05/2026 a las 22:00h. Se requiere anulación del aval erróneo y regeneración por el importe correcto con carácter urgente antes del cierre de operaciones.

Servicio afectado: SIFG (Sistema Integral de Financiación y Garantías). Entorno: HOST producción.`,
  },
  {
    summary: '[PROHIP] Descuadre de 7.340€ en cuenta restringida hipotecaria — gestoría bloqueada para escritura',
    priority: 'High',
    labels: ['prohip', 'hipoteca', 'host', 'tecnica', 'test-v9'],
    description: `La gestoría GESTIONES NOTARIALES MOCK SL (código GES-0293) informa de un descuadre de 7.340,00€ en la cuenta restringida hipotecaria CTA-REST-20260520-0193 asociada al préstamo HIP-MOCK-2026-00884. El sistema PROHIP muestra saldo disponible 0€ pero el extracto bancario refleja 7.340€ sin movimiento de origen identificado. La firma de la escritura está programada para el 03/06/2026 y el notario no puede proceder si los fondos no cuadran. La incidencia afecta también a los préstamos HIP-MOCK-2026-00891 y HIP-MOCK-2026-00902.

Servicio afectado: PROHIP (Proceso Hipotecario). Entorno: HOST producción.`,
  },
  {
    summary: '[GETRF] 47 transferencias SEPA en estado PENDIENTE_ABONO sin avanzar desde hace 72h — 412.500€ retenidos',
    priority: 'High',
    labels: ['getrf', 'sepa', 'host', 'tecnica', 'test-v9'],
    description: `El técnico del equipo HOST-TRANSFERENCIAS detectó que 47 transferencias SEPA emitidas entre el 27/05/2026 y el 28/05/2026 permanecen en estado PENDIENTE_ABONO sin avanzar. El lote afectado tiene referencia BATCH-GETRF-20260528-0071. Los importes oscilan entre 800€ y 35.000€ (total acumulado: 412.500€). El análisis preliminar apunta a que el IBAN destino de 12 operaciones fue reestructurado por la migración del banco beneficiario (BIC MOCKDEBBXXX), pero las 35 restantes tienen IBANs correctos. Los beneficiarios están reclamando. SLA de devolución automática PSD2 se activa en 24h.

Servicio afectado: GETRF (Gestión de Transferencias). Entorno: HOST producción.`,
  },
  {
    summary: '[ANTIPBC] Deadlock en DILIG_ESTADO bloquea renovación KYC de 34 clientes — riesgo regulatorio 48h',
    priority: 'Highest',
    labels: ['antipbc', 'kyc', 'pbc', 'host', 'tecnica', 'regulatorio', 'test-v9'],
    description: `El sistema ANTIPBC (prevención blanqueo de capitales) presenta un deadlock en el proceso DILIG_ESTADO desde las 07:15h del 01/06/2026. Como consecuencia, 34 clientes con renovación KYC vencida o próxima a vencer no pueden completar el proceso de debida diligencia. Los clientes afectados tienen posiciones abiertas en riesgo de bloqueo regulatorio en 48h. El proceso bloqueado lleva en espera desde la ejecución del job nocturno BATCH-KYC-20260531. Trazas de error en log: DEADLOCK_DETECTED TXN_ID=8821-KYC, tabla CLIENTES_DILIGENCIA, sesión DB-SESSION-4471. Impacto regulatorio crítico: notificación al SEPBLAC podría ser requerida.

Servicio afectado: ANTIPBC (Sistema Anti-Blanqueo de Capitales). Entorno: HOST producción.`,
  },
  {
    summary: '[FIRMADIG] Error JWT SIGN-ERR-4421 impide firma de órdenes en portal empresas — 89 órdenes por 1,24M€ bloqueadas',
    priority: 'High',
    labels: ['firmadig', 'firma-digital', 'jwt', 'host', 'tecnica', 'test-v9'],
    description: `Desde las 14:30h del 31/05/2026, el servicio FIRMADIG devuelve el código de error SIGN-ERR-4421 al intentar firmar órdenes desde el portal de banca de empresas. El error aparece en el paso de validación del scope del token JWT. Resultado: 89 órdenes de pago pendientes de firma por un importe total acumulado de 1.240.000€ que no pueden procesarse. Los clientes afectados son empresas con perfil FIRMA_REFORZADA. El equipo de seguridad confirmó que no hubo cambios en certificados. El problema coincide con la actualización de la librería de validación JWT a la versión 4.2.1 desplegada a las 13:00h.

Servicio afectado: FIRMADIG (Firma Digital). Entorno: HOST producción.`,
  },
  {
    summary: '[N43] Exportación cuaderno bancario AEB devuelve fecha_proceso en lugar de fecha_valor — 5 empresas descuadradas',
    priority: 'Medium',
    labels: ['n43', 'cuaderno-bancario', 'host', 'tecnica', 'test-v9'],
    description: `Cinco empresas clientes reportan que los ficheros N43 (cuaderno bancario AEB norma 43) descargados desde banca online entre el 26/05/2026 y el 31/05/2026 muestran fecha_proceso (campo 6 del registro 22) en vez de fecha_valor en todos los movimientos de abono. Esto provoca descuadres en sus contabilidades automáticas (SAP, Sage, A3). Las empresas afectadas son: FABRICACIONES MOCK SA, LOGISTICA CENTRAL MOCK SL, TRANSPORTES MOCK SUR SL, INGENIERIA MOCK BCN SA y SERVICIOS AGRO MOCK SL. El error afecta a aproximadamente 340 líneas de movimiento en total. Solicitan los ficheros corregidos con urgencia para cierre contable mensual.

Servicio afectado: GETRF módulo N43 / banca online. Entorno: HOST producción.`,
  },
  {
    summary: '[GENEXT] Extractos PDF mayo enviados por email llegan corruptos — formato PDF 1.7 incompatible con Outlook — 17 empresas',
    priority: 'Medium',
    labels: ['genext', 'pdf', 'extractos', 'host', 'operativa', 'test-v9'],
    description: `El servicio GENEXT generó los extractos mensuales de mayo 2026 en formato PDF 1.7 en lugar de PDF/A-1b especificado en el contrato de distribución. Como resultado, 17 empresas clientes que reciben los extractos por correo y los procesan automáticamente con Microsoft Outlook + complemento PDF Archive no pueden abrirlos. Los ficheros afectados corresponden al ciclo de generación CICLO-GENEXT-202605-EMPRESAS ejecutado el 31/05/2026 a las 03:00h. Las empresas necesitan los documentos corregidos antes del 03/06/2026 para auditoría externa.

Servicio afectado: GENEXT (Generación de Extractos) + DOCSEND-v2. Entorno: HOST producción.`,
  },
  {
    summary: '[SIMREN] RARORAC_CALC_ERROR en simulador de rentabilidad — campo grupo_legal obligatorio desde v4.1.2 — 8 propuestas bloqueadas',
    priority: 'Medium',
    labels: ['simren', 'rarorac', 'host', 'tecnica', 'test-v9'],
    description: `El simulador de rentabilidad SIMREN devuelve el error RARORAC_CALC_ERROR en todas las simulaciones de operaciones de activo desde el 29/05/2026. El análisis del log muestra que el campo grupo_legal se definió como obligatorio en la última actualización del modelo de cálculo RARORAC (versión 2.4.0 desplegada el 28/05/2026) pero no se actualizó la capa de presentación. Los gestores de riesgo no pueden calcular la rentabilidad ajustada al riesgo de nuevas propuestas de crédito. Hay 8 propuestas de crédito a empresas pendientes de análisis por un importe total de 4.200.000€.

Servicio afectado: SIMREN (Simulador de Rentabilidad). Entorno: WEB producción.`,
  },
  {
    summary: '[SICART] Comisión de custodia aplicada al 0,25% en lugar del 0,15% pactado — 24 contratos — exceso 7.176€',
    priority: 'Medium',
    labels: ['sicart', 'comisiones', 'cartera', 'host', 'reclamacion', 'test-v9'],
    description: `El operario de banca privada detecta que el sistema SICART aplicó la tarifa incorrecta de comisión de custodia en el cierre de mayo 2026. Los 24 contratos de gestión de cartera con tarifa negociada del 0,15% anual recibieron el cargo al 0,25% estándar. La causa aparente es un fallo de caché en el módulo de tarifas personalizadas tras la migración del 25/05/2026. Importe cobrado en exceso total: 7.176,00€. Los clientes son carteras de perfil conservador con saldo medio de 450.000€. Se requiere devolución y recálculo para el histórico de 3 meses.

Servicio afectado: SICART (Sistema de Cartera). Entorno: API v2 producción.`,
  },
  {
    summary: '[RGPD] Consentimientos de tratamiento rechazados guardados como NULL — 11 empresas afectadas — riesgo notificación AEPD',
    priority: 'High',
    labels: ['rgpd', 'consentimientos', 'host', 'regulatorio', 'test-v9'],
    description: `Se detectó un bug crítico en la persistencia de consentimientos de tratamiento de datos: cuando el cliente selecciona "No acepto" en el portal de micro-consentimientos RGPD, el sistema almacena el valor NULL en lugar de false en la tabla CONSENTIMIENTOS_CLIENTES. Esto provoca que el módulo de marketing interprete el NULL como "consentimiento no expresado" y vuelva a contactar a clientes que explícitamente rechazaron el tratamiento. Clientes afectados desde el 20/05/2026: 11 empresas y 34 personas físicas. El DPO ha sido notificado y valora si es precisa la notificación a la AEPD en 72h según el artículo 33 del RGPD.

Servicio afectado: micro-consentimientos-api v1.3.0. Entorno: producción.`,
  },
  {
    summary: '[FRAUDE] Skimming en cajero OFIC-3317 — 3 clientes con cargos fraudulentos en Portugal — bloqueo urgente',
    priority: 'Highest',
    labels: ['fraude', 'skimming', 'tarjeta', 'urgente', 'test-v9'],
    description: `Tres clientes reportaron cargos fraudulentos en sus cuentas entre el 29/05/2026 y el 31/05/2026 por importes de 980€, 1.450€ y 2.200€ respectivamente, todos en comercios de fuel en Portugal. Los tres clientes usaron exclusivamente el cajero de la oficina OFIC-3317 en los días previos. Se sospecha instalación de skimmer en dicho cajero. Las tarjetas afectadas son: VISA ending 7741, VISA ending 3829 y Mastercard ending 5512. Se requiere bloqueo inmediato de las tres tarjetas, reversión de los cargos fraudulentos, y revisión forense del cajero OFIC-3317.

Referencia incidencia: INC-20260531-FRAUD-SKIM-0317. Servicio: card-management, fraud-detection.`,
  },
  {
    summary: '[HIPOTECA] Doble cobro cuota mayo 2026 — préstamo HIP-MOCK-2026-00512 — 843,20€ en exceso',
    priority: 'High',
    labels: ['hipoteca', 'doble-cobro', 'reclamacion', 'test-v9'],
    description: `El cliente (hipoteca ref. HIP-MOCK-2026-00512) informa que la cuota de mayo 2026 fue cargada dos veces en su cuenta domiciliada el 05/05/2026 y nuevamente el 07/05/2026. Importe de cada cuota: 843,20€. Total cobrado en exceso: 843,20€. El cliente solicita devolución inmediata del cargo duplicado y certificación de que no se repetirá. La cuenta domiciliada presenta saldo en números rojos generando comisión de descubierto de 35€ adicional. El cliente amenaza con presentar reclamación ante el Banco de España si no se resuelve en 48h.

Servicio afectado: core-banking módulo domiciliaciones. Referencia: REC-20260507-HIP-00512.`,
  },

  // ── GRUPO B — Devolución en PASO 0 (descripción vaga o sin contexto) ──────
  // Estas incidencias no superarán la validación inicial del pipeline
  // porque carecen de sistema, tipo, datos operativos o contexto mínimo.

  {
    summary: 'Problema con el sistema',
    priority: 'Medium',
    labels: ['test-v9', 'test-paso0', 'devolucion-esperada'],
    description: `Hay un problema con el sistema. No funciona bien. Por favor arreglarlo lo antes posible.`,
  },
  {
    summary: 'Error en aplicación bancaria — necesita atención',
    priority: 'High',
    labels: ['test-v9', 'test-paso0', 'devolucion-esperada'],
    description: `La aplicación da error. El usuario no puede entrar. Necesita solución urgente. No sé qué más decir sobre el tema.`,
  },
  {
    summary: 'Incidencia reportada por gestor de oficina',
    priority: 'Low',
    labels: ['test-v9', 'test-paso0', 'devolucion-esperada'],
    description: `Un gestor de oficina ha reportado una incidencia. Dice que algo no funciona pero no ha podido dar más detalles en este momento. Puede que sea una queja o puede que sea un error técnico. Hay que verlo.`,
  },

  // ── GRUPO C — REQUIERE_INFORMACION_ADICIONAL (datos críticos ausentes) ────
  // Tienen contexto plausible y superan Paso 0, pero al llegar al Resolutor
  // éste no puede actuar porque faltan referencias operativas imprescindibles
  // (IBAN, referencia de operación, código de aval, ID de cliente, etc.).

  {
    summary: '[GETRF] Transferencia SEPA importante no llegó al beneficiario — pendiente de investigar',
    priority: 'High',
    labels: ['getrf', 'sepa', 'test-v9', 'test-requiere-info'],
    description: `Un cliente empresa realizó hace unos días una transferencia SEPA de importe elevado a un beneficiario en el extranjero. El beneficiario confirma que no ha recibido nada. El cliente está muy preocupado porque son fondos importantes para un pago a proveedor. El sistema HOST parece haberla procesado pero tenemos dudas. Necesitamos investigar qué pasó con esa transferencia y localizar los fondos. El cliente pide resolución urgente y está considerando presentar una reclamación.`,
  },
  {
    summary: '[SIFG] Aval bancario entregado al cliente con error en los datos — solicita corrección',
    priority: 'High',
    labels: ['sifg', 'avales', 'test-v9', 'test-requiere-info'],
    description: `Un cliente de la oficina norte viene a reclamar que el aval bancario que se le generó tiene un error en los datos. No especifica exactamente qué dato está mal. Puede ser el importe, el nombre del beneficiario o la fecha de vencimiento. El cliente tiene el documento en papel pero no lo ha traído a la oficina porque no podía desplazarse. Necesita que se revise y corrija cuanto antes porque tiene que presentarlo pronto ante un organismo público.`,
  },
  {
    summary: '[ANTIPBC] Posible operativa sospechosa detectada en cuenta de empresa — requiere revisión',
    priority: 'High',
    labels: ['antipbc', 'pbc', 'test-v9', 'test-requiere-info'],
    description: `El sistema ha generado una alerta sobre posible operativa inusual en una cuenta de empresa. Parece que hay movimientos que no encajan con el perfil declarado. El gestor que lo ha visto cree que puede haber algo raro pero no tiene más información disponible en este momento porque estaba atendiendo a otro cliente. Se solicita revisión y actuación según el protocolo de cumplimiento que corresponda.`,
  },
];

resolver.define('createMockIssuesV9', async ({ context }) => {
  const projectKey = context?.extension?.project?.key || 'KAN';
  const created = [], errors = [];
  for (const issue of MOCK_ISSUES_V9) {
    try {
      const { key, error } = await createIssueWithFallback(projectKey, issue);
      if (key) created.push(key);
      else errors.push(`${issue.summary.substring(0, 50)}: ${error}`);
    } catch (e) { errors.push(`${issue.summary.substring(0, 50)}: ${e.message}`); }
  }
  const groupA = created.slice(0, 12);
  const groupB = created.slice(12, 15);
  const groupC = created.slice(15, 18);
  return { success: errors.length === 0, created, groupA, groupB, groupC, errors };
});

// ─── 4 incidencias extra: 2 Paso 0 + 2 Resolutor REQUIERE_INFO ───────────────
const MOCK_ISSUES_DEVOLUCION = [

  // ── PASO 0 — descripciones sin datos operativos (quality gate las rechaza) ─

  {
    summary: 'Incidencia urgente — no funciona nada desde esta mañana',
    priority: 'High',
    labels: ['test-paso0', 'devolucion-esperada', 'test-extra'],
    description: `Buenos días, llamo porque desde esta mañana no funciona nada. Ni el cliente ni nosotros podemos hacer nada. Es muy urgente porque hay clientes esperando. Que alguien lo mire cuanto antes por favor. No sé explicar más porque tampoco entiendo bien qué ha pasado.`,
  },
  {
    summary: 'Hay un fallo — cliente muy enfadado y amenaza con irse',
    priority: 'High',
    labels: ['test-paso0', 'devolucion-esperada', 'test-extra'],
    description: `Un cliente ha venido a la oficina muy enfadado porque dice que algo ha salido mal con una gestión que hizo. No hemos podido entender bien qué gestión era exactamente. El cliente ha amenazado con cambiar de banco si no se resuelve hoy. El gestor que le atendió tampoco sabe qué ocurrió porque no era su cliente. Necesitamos ayuda para saber qué hacer.`,
  },

  // ── RESOLUTOR REQUIERE_INFO — contexto plausible pero faltan datos críticos ─
  // Pasan el quality gate (sistema en título) pero el Resolutor no puede actuar
  // sin referencias operativas concretas que no están en la descripción.

  {
    summary: '[PROHIP] Cliente hipotecado reclama cuotas incorrectas desde revisión de tipo de interés',
    priority: 'High',
    labels: ['prohip', 'hipoteca', 'reclamacion', 'test-requiere-info', 'test-extra'],
    description: `Un cliente hipotecado acude a la oficina para reclamar que desde la última revisión del tipo de interés le están cobrando más de lo que le corresponde según su contrato. Asegura que el diferencial aplicado no coincide con el que figura en su escritura. Lleva varios meses con este cobro y estima que le deben devolver una cantidad importante. La hipoteca la contrató hace varios años y hasta ahora nunca había tenido problemas con las cuotas. El gestor de la oficina confirma visualmente que parece haber una discrepancia pero no tiene acceso en ese momento a los detalles del préstamo en el sistema PROHIP para verificar los tipos aplicados.`,
  },
  {
    summary: '[FIRMADIG] Empresa no puede completar firma de órdenes en portal — error en proceso de autenticación',
    priority: 'High',
    labels: ['firmadig', 'portal-empresas', 'firma-digital', 'test-requiere-info', 'test-extra'],
    description: `Una empresa cliente contacta para reportar que desde hace varios días ninguno de sus usuarios autorizados puede completar la firma de órdenes en el portal de banca de empresas. Cuando intentan firmar se produce un error en el proceso de autenticación o validación del certificado, pero no recuerdan exactamente el mensaje que aparece. El problema les está bloqueando operativa comercial importante que no puede demorarse más. Todos los perfiles de firma de la empresa están afectados por igual. No saben si el problema es de sus propios certificados o del servicio FIRMADIG del banco. Llevan varios días intentando resolverlo por su cuenta sin éxito.`,
  },
];

resolver.define('createDevolucionExtra', async ({ context }) => {
  const projectKey = context?.extension?.project?.key || 'KAN';
  const created = [], errors = [];
  for (const issue of MOCK_ISSUES_DEVOLUCION) {
    try {
      const { key, error } = await createIssueWithFallback(projectKey, issue);
      if (key) created.push(key);
      else errors.push(`${issue.summary.substring(0, 50)}: ${error}`);
    } catch (e) { errors.push(`${issue.summary.substring(0, 50)}: ${e.message}`); }
  }
  const paso0    = created.slice(0, 2);
  const resolutor = created.slice(2, 4);
  return { success: errors.length === 0, created, paso0, resolutor, errors };
});

resolver.define('getCustomFields', async () => {
  const res = await asApp().requestJira(route`/rest/api/3/field`, {
    method: 'GET', headers: { Accept: 'application/json' },
  });
  const fields = await res.json();
  const custom = fields
    .filter(f => f.custom)
    .map(f => ({ id: f.id, name: f.name, customId: f.schema?.customId }));
  console.log('CUSTOM_FIELDS:', JSON.stringify(custom));
  return custom;
});

export const handler = resolver.getDefinitions();
