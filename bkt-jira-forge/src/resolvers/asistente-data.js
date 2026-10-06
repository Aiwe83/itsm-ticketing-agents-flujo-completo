// Traduce el `results` real del pipeline (guardado en storage como
// `agentResults:{issueKey}` por pipeline.js:processAgentResults) a la forma
// que consume el panel "Asistente" (static/asistente-app/src/App.jsx).

import { extractSection } from './claude.js';

// Copiada tal cual de src/frontend/index.jsx — mismo criterio de resumen de
// tool calls que ya usa el panel "BankDesk AI Agents".
function summarizeResult(tool, result) {
  if (!result || typeof result !== 'object') return String(result).substring(0, 80);
  if (tool === 'query_documents')
    return `${result.total} doc(s) — ${result.results?.[0]?.doc || ''}`;
  if (tool === 'get_system_logs')
    return `${result.log_count} eventos · ${result.events?.[0]?.level || ''}: ${result.events?.[0]?.message?.substring(0, 60) || ''}`;
  if (tool === 'get_repo_changes')
    return `${result.commits?.length || 0} commits en ${result.service}`;
  if (tool === 'get_playbook')
    return `Playbook ${result.incident_type || ''} · ${result.steps?.length || 0} pasos`;
  if (tool === 'search_resolved_incidents')
    return `${result.total_encontrados} caso(s) similares — ${result.resultados?.[0]?.titulo?.substring(0, 50) || ''}`;
  return JSON.stringify(result).substring(0, 80);
}

const TOOL_ICON = {
  query_documents: '📄',
  get_system_logs: '🖥️',
  get_repo_changes: '🔀',
  get_playbook: '📋',
  search_resolved_incidents: '🕒',
};

function uniqueSteps(results) {
  const allSteps = [
    ...(results.supervisor?.steps || []),
    ...(results.validator?.steps || []),
    ...(results.documentor?.steps || []),
    ...(results.resolver?.steps || []),
  ];
  const seen = new Set();
  return allSteps.filter(s => {
    const k = `${s.tool}:${JSON.stringify(s.params)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function mapResultsToPipeline(results) {
  if (!results) return null;

  const steps = uniqueSteps(results);

  const agents = [
    {
      name: 'Clasificador',
      done: !!results.clasificacion,
      verdict: results.clasificacion ? `${results.clasificacion.tipo} · ${results.clasificacion.prioridad}` : undefined,
      text: results.clasificacion ? `SLA: ${results.clasificacion.sla_label || 'sin definir'}` : undefined,
    },
    {
      name: 'Supervisor',
      done: !!results.supervisor,
      verdict: results.supervisor?.impacto ? `Impacto ${results.supervisor.impacto}` : undefined,
      text: results.supervisor?.comment,
    },
    {
      name: 'Validador',
      done: !!results.validator,
      verdict: results.validator?.dictamen,
      text: results.validator?.comment,
    },
    {
      name: 'Documentador',
      done: !!results.documentor,
      verdict: results.documentor ? 'Registro creado' : undefined,
      text: results.documentor?.comment,
    },
    {
      name: 'Resolutor',
      done: !!results.resolver,
      verdict: results.resolver?.decision,
      text: results.resolver?.comment,
    },
  ];

  const sources = steps.map(s => `${TOOL_ICON[s.tool] || '🔧'} ${s.tool} · ${summarizeResult(s.tool, s.result)}`);

  const docs = steps
    .filter(s => s.tool === 'query_documents')
    .flatMap(s => (s.result?.results || []).map(r => ({ name: r.doc, url: r.url, snippet: r.snippet || '' })));

  const logs = steps
    .filter(s => s.tool === 'get_system_logs')
    .flatMap(s => (s.result?.events || []).map(e => ({ ts: e.timestamp, level: e.level, service: e.service, msg: e.message })));

  const sla = results.clasificacion
    ? { urgent: results.clasificacion.prioridad === 'P1', label: results.clasificacion.sla_label, extra: null }
    : null;

  return {
    finalStatus: results.finalStatus,
    agents,
    sources,
    docs,
    logs,
    subtasks: [], // rellenado por getIncidentData con las subtareas reales de Jira
    relatedIncidents: [], // rellenado por getIncidentData (necesita el siteUrl para el enlace)
    chatSeed: 'Hola, soy el asistente de esta incidencia. Tengo el análisis del pipeline agéntico real. ¿En qué te ayudo?',
    suggested: [],
    sla,
  };
}

// Incidencias pasadas citadas por los agentes (tool `search_resolved_incidents`)
// para la sección "Incidencias relacionadas" de la pestaña Documentación. Si
// el resultado trae un `jiraKey` real, enlaza directo a esa ficha; si no,
// cae a una búsqueda de Jira por el código de la incidencia citada.
export function extractRelatedIncidents(results, siteUrl) {
  const steps = uniqueSteps(results);
  return steps
    .filter(s => s.tool === 'search_resolved_incidents')
    .flatMap(s => (s.result?.resultados || []).map(r => {
      const code = (r.titulo || '').split(/\s+—\s+/)[0].trim();
      const url = r.jiraKey && siteUrl
        ? `${siteUrl}/browse/${r.jiraKey}`
        : siteUrl
          ? `${siteUrl}/issues/?jql=${encodeURIComponent(`text ~ "${code.replace(/"/g, '')}"`)}`
          : null;
      return {
        titulo: r.titulo,
        fecha: r.fecha || null,
        resumen: r.resumen || null,
        resolucion: r.resolucion || null,
        url,
      };
    }));
}

// Extrae el plan propuesto por el Resolutor para la pestaña "Plan" — mismo
// criterio de secciones (MOTIVO/ACCIONES_EJECUTADAS/PROXIMOS_PASOS/
// TIEMPO_ESTIMADO) que ya usa jira.js:postResolutionComment para comentar en
// el ticket. `state` indica qué debe pintar la UI:
//  - 'needs_info'  → el pipeline no pudo cerrar un plan, pide datos
//  - 'devuelto'    → descripción insuficiente, devuelto al peticionario
//  - 'has_plan'    → hay un plan real que revisar
export function buildPlan(results) {
  const resolverData = results.resolver || {};
  const finalStatus = results.finalStatus;

  if (finalStatus === 'REQUIERE_INFORMACION_ADICIONAL') {
    return {
      state: 'needs_info',
      infoRequerida: resolverData.info_requerida || null,
      comment: resolverData.comment || null,
    };
  }

  if (finalStatus === 'DEVUELTO_PETICIONARIO') {
    return {
      state: 'devuelto',
      comment: resolverData.comment || null,
    };
  }

  const full = resolverData.full || '';
  return {
    state: 'has_plan',
    decision: resolverData.decision || null,
    comment: resolverData.comment || null,
    motivo: extractSection(full, 'MOTIVO'),
    acciones: extractSection(full, 'ACCIONES_EJECUTADAS'),
    proximos: extractSection(full, 'PROXIMOS_PASOS'),
    tiempo: extractSection(full, 'TIEMPO_ESTIMADO'),
  };
}

// Aplana una descripción ADF de Jira a texto plano (mismo criterio que
// buildTicketCtx en pipeline.js, sin repetir la petición a Jira).
export function adfToText(adf) {
  if (!adf?.content) return null;
  return adf.content.map(b => b.content?.map(c => c.text).join('') || '').join('\n').trim() || null;
}

// Contexto en texto plano de la incidencia + lo que ha devuelto cada agente,
// para pasárselo al LLM como base de lo que puede responder.
export function buildAssistantContext(real, results, subtasksList) {
  const lines = [];
  lines.push(`Incidencia: ${real.key} — ${real.title}`);
  lines.push(`Estado Jira: ${real.estadoReal || 'N/D'} · Prioridad: ${real.prioridadReal || 'N/D'} · Asignado: ${real.assigneeReal || 'sin asignar'}`);
  if (real.description) lines.push(`Descripción original del ticket:\n${real.description}`);

  lines.push(`\nVeredicto final del pipeline agéntico: ${results.finalStatus}`);

  if (results.clasificacion) {
    const c = results.clasificacion;
    lines.push(`Clasificación: tipo=${c.tipo || 'N/D'}, prioridad=${c.prioridad || 'N/D'}, SLA=${c.sla_label || 'N/D'} (vence ${c.sla_deadline || 'N/D'})`);
  }
  if (results.supervisor) {
    const s = results.supervisor;
    lines.push(`Análisis del Supervisor: ${s.comment || 'sin comentario'}`);
    lines.push(`  (impacto=${s.impacto || 'N/D'}, alertas estimadas=${s.alertasEstimadas || 'N/D'}, clientes estimados=${s.clientesEstimados || 'N/D'}, segmentos=${s.segmentos || 'N/D'})`);
  }
  if (results.validator) {
    lines.push(`Validación (dictamen: ${results.validator.dictamen || 'sin dictamen'}): ${results.validator.comment || 'sin comentario'}`);
  }
  if (results.documentor) {
    lines.push(`Documentación registrada por el Documentador: ${results.documentor.comment || 'sin comentario'}`);
  }
  if (results.resolver) {
    lines.push(`Resolución (decisión: ${results.resolver.decision || 'sin decisión'}): ${results.resolver.comment || 'sin comentario'}`);
    if (results.resolver.info_requerida) {
      lines.push(`Información pendiente solicitada al peticionario: ${results.resolver.info_requerida}`);
    }
  }

  const steps = uniqueSteps(results);
  if (steps.length) {
    lines.push('\nFuentes y herramientas consultadas por los agentes (detalle completo, no solo el resumen):');
    steps.forEach(s => {
      lines.push(`- ${s.tool}:`);
      const r = s.result;
      if (s.tool === 'search_resolved_incidents' && r?.resultados?.length) {
        r.resultados.forEach(inc => {
          lines.push(`    · ${inc.titulo}${inc.fecha ? ` (${inc.fecha})` : ''}`);
          if (inc.resumen) lines.push(`      Resumen: ${inc.resumen}`);
          if (inc.resolucion) lines.push(`      Resolución: ${inc.resolucion}`);
        });
      } else if (s.tool === 'query_documents' && r?.results?.length) {
        r.results.forEach(d => {
          lines.push(`    · ${d.doc}${d.url ? ` (${d.url})` : ''}`);
          if (d.snippet) lines.push(`      ${d.snippet}`);
        });
      } else if (s.tool === 'get_repo_changes' && r) {
        (r.deploys || []).forEach(d => lines.push(`    · deploy ${d.version} (${d.timestamp}) — ${d.status}`));
        (r.commits || []).forEach(c => lines.push(`    · commit ${c.sha} (${c.author}): ${c.message}`));
        if (r.warning) lines.push(`      ⚠️ ${r.warning}`);
      } else if (s.tool === 'get_playbook' && r?.steps?.length) {
        r.steps.forEach((step, i) => lines.push(`    ${i + 1}. ${step}`));
      } else if (s.tool === 'get_system_logs' && r?.events?.length) {
        r.events.forEach(e => lines.push(`    · [${e.level}] ${e.timestamp} ${e.service}: ${e.message}`));
      } else {
        lines.push(`    ${summarizeResult(s.tool, r)}`);
      }
    });
  }

  if (subtasksList?.length) {
    lines.push('\nSubtareas generadas en Jira:');
    subtasksList.forEach(s => lines.push(`- [${s.status || 'N/D'}] ${s.label} (${s.key})`));
  }

  return lines.join('\n');
}
