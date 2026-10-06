import { kvs as storage } from '@forge/kvs';
import { getIssueDetails, updateIssueField, transitionIssue,
         enrichIssueDescription, postResolutionComment,
         postConsolidatedComment, postRequireInfoComment,
         createSubtask, setManualFields } from './jira.js';

export const ENRICHED_MARKER = 'Contexto enriquecido automáticamente por BankDesk AI';

export function getLangGraphURL() {
  const url = process.env.LANGGRAPH_URL;
  if (!url) throw new Error('LANGGRAPH_URL no configurada en Forge (ver SETUP.md)');
  return url.replace(/\/$/, '');
}

export async function buildTicketCtx(issueKey) {
  const issue = await getIssueDetails(issueKey);
  return {
    id:          issueKey,
    title:       issue.fields.summary,
    description: issue.fields.description?.content
      ?.map(b => b.content?.map(c => c.text).join('') || '').join('\n') || 'Sin descripción',
    priority:    issue.fields.priority?.name || 'Media',
    type:        issue.fields.issuetype?.name || 'Task',
    category:    issue.fields.labels?.[0] || issue.fields.components?.[0]?.name || 'General',
    reporter:    issue.fields.reporter?.displayName || 'Desconocido',
    assignee:    issue.fields.assignee?.displayName || 'Sin asignar',
    status:      issue.fields.status?.name || 'Nueva',
  };
}

export async function processAgentResults(issueKey, results) {
  const ticket = await buildTicketCtx(issueKey);
  if (!ticket.description.includes(ENRICHED_MARKER)) {
    const allSteps = [
      ...(results.supervisor?.steps  || []),
      ...(results.validator?.steps   || []),
      ...(results.documentor?.steps  || []),
      ...(results.resolver?.steps    || []),
    ];
    await enrichIssueDescription(issueKey, ticket.description, allSteps);
  }

  await postConsolidatedComment(issueKey, results);

  if (results.finalStatus === 'RESUELTO') {
    await postResolutionComment(issueKey, results.resolver);
  }

  if (results.finalStatus === 'REQUIERE_INFORMACION_ADICIONAL') {
    await postRequireInfoComment(issueKey, results.resolver);
  }

  const subtasks = results.resolver?.subtasks || [];
  console.log(`[processResults] ${subtasks.length} subtareas a crear`);
  for (const task of subtasks) {
    const key = await createSubtask(issueKey, task.title, task.type === 'auto', task.description || '');
    console.log(`[processResults] subtarea creada: ${key}`);
  }

  await setManualFields(issueKey, results.supervisor, results.resolver, results.clasificacion || null);

  const labelMap = {
    RESUELTO:                       'ai-resolved',
    ESCALADO_A_HUMANO:              'ai-escalated',
    REQUIERE_INFORMACION_ADICIONAL: 'ai-needs-info',
    DEVUELTO_PETICIONARIO:          'ai-devuelto',
  };
  await Promise.all([
    transitionIssue(issueKey, results.finalStatus),
    updateIssueField(issueKey, { labels: [labelMap[results.finalStatus] || 'ai-processed'] }),
  ]);

  await storage.set(`agentResults:${issueKey}`, results);
  console.log(`[processResults] ✅ ${issueKey} procesado — ${results.finalStatus}`);
}
