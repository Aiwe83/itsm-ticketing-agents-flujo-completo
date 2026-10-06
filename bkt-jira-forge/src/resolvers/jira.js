import { asApp, route } from '@forge/api';
import { FIELDS, OPTIONS, calcularImpacto, normalizarImpacto, resolverSegmento } from './jira-fields.js';

// ─── Obtener detalles completos del issue ─────────────────────────────────────
export async function getIssueDetails(issueKey) {
  const res = await asApp().requestJira(
    route`/rest/api/3/issue/${issueKey}?expand=renderedFields`,
    { method: 'GET', headers: { Accept: 'application/json' } }
  );
  if (!res.ok) throw new Error(`getIssueDetails failed: ${res.status}`);
  return res.json();
}

// ─── Publicar comentario de agente en el ticket ───────────────────────────────
const TOOL_LABELS = {
  query_documents:           '📄 query_documents',
  get_system_logs:           '🖥️ get_system_logs',
  get_repo_changes:          '🔀 get_repo_changes',
  get_playbook:              '📋 get_playbook',
  search_resolved_incidents: '🗂️ search_resolved_incidents',
};

function toolSummaryText(step) {
  const r = step.result;
  if (!r) return '';
  if (step.tool === 'get_system_logs')
    return `${r.log_count} eventos · más reciente: ${r.events?.[0]?.message?.substring(0, 80) || ''}`;
  if (step.tool === 'get_repo_changes')
    return r.warning || `${r.commits?.length || 0} commits en ${r.service}`;
  if (step.tool === 'query_documents')
    return `${r.total} documento(s) encontrado(s)`;
  if (step.tool === 'get_playbook')
    return `Playbook ${r.incident_type || ''} · ${r.steps?.length || 0} pasos`;
  if (step.tool === 'search_resolved_incidents')
    return `${r.total_encontrados} caso(s) similares encontrados`;
  return '';
}

export async function postJiraComment(issueKey, agentLabel, summary, steps = []) {
  const paragraphs = [];

  // Cabecera del agente
  paragraphs.push({
    type: 'paragraph',
    content: [
      { type: 'text', text: `${agentLabel}`, marks: [{ type: 'strong' }] },
      { type: 'text', text: '  —  Comentario automático generado por IA con LangGraph', marks: [{ type: 'em' }] },
    ],
  });

  // Resumen del agente
  if (summary) {
    paragraphs.push({
      type: 'paragraph',
      content: [{ type: 'text', text: summary }],
    });
  }

  // Sección de tools consultadas
  if (steps && steps.length > 0) {
    paragraphs.push({
      type: 'paragraph',
      content: [{ type: 'text', text: '🔧 Fuentes consultadas:', marks: [{ type: 'strong' }] }],
    });

    for (const step of steps) {
      const label   = TOOL_LABELS[step.tool] || step.tool;
      const summary = toolSummaryText(step);

      // Para query_documents mostramos los docs con links
      if (step.tool === 'query_documents' && step.result?.results?.length) {
        for (const doc of step.result.results) {
          const content = [{ type: 'text', text: `  ${label} → ` }];
          if (doc.url) {
            content.push({
              type: 'text',
              text: doc.doc,
              marks: [{ type: 'link', attrs: { href: doc.url } }],
            });
          } else {
            content.push({ type: 'text', text: doc.doc });
          }
          paragraphs.push({ type: 'paragraph', content });
        }
      } else {
        paragraphs.push({
          type: 'paragraph',
          content: [{ type: 'text', text: `  ${label}${summary ? ` → ${summary}` : ''}` }],
        });
      }
    }
  }

  const body = { type: 'doc', version: 1, content: paragraphs };

  const res = await asApp().requestJira(
    route`/rest/api/3/issue/${issueKey}/comment`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ body }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    console.error('postJiraComment error:', err);
  }
  return res.ok;
}

// ─── Actualizar campos del issue (labels, assignee, etc.) ─────────────────────
export async function updateIssueField(issueKey, fields) {
  const res = await asApp().requestJira(
    route`/rest/api/3/issue/${issueKey}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ fields }),
    }
  );
  return res.ok;
}

// ─── Mover issue a la columna correspondiente según veredicto ─────────────────
export async function transitionIssue(issueKey, finalStatus) {
  // Candidatos por veredicto — primero los estados del manual, luego fallbacks actuales
  const candidates = {
    RESUELTO: [
      'finalizado', 'finalizada',
      'done', 'hecho', 'resuelto', 'completado', 'closed',
    ],
    ESCALADO_A_HUMANO: [
      'en curso entidad', 'en curso bk',
      'in progress', 'en progreso', 'en curso',
    ],
    REQUIERE_INFORMACION_ADICIONAL: [
      'pendiente de usuario', 'falta información',
      'in progress', 'en progreso', 'en curso', 'pendiente',
    ],
    DEVUELTO_PETICIONARIO: [
      'pendiente de usuario', 'falta información',
      'in progress', 'en progreso', 'en curso', 'pendiente',
    ],
  };

  const targets = candidates[finalStatus] || ['in progress'];

  const res = await asApp().requestJira(
    route`/rest/api/3/issue/${issueKey}/transitions`,
    { method: 'GET', headers: { Accept: 'application/json' } }
  );
  if (!res.ok) return false;

  const { transitions = [] } = await res.json();
  const match = transitions.find(t =>
    targets.some(target => t.to.name.toLowerCase().includes(target))
  );

  if (!match) {
    console.log(`[transitionIssue] No se encontró transición para ${finalStatus}. Disponibles: ${transitions.map(t => t.to.name).join(', ')}`);
    return false;
  }

  const transRes = await asApp().requestJira(
    route`/rest/api/3/issue/${issueKey}/transitions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ transition: { id: match.id } }),
    }
  );

  console.log(`[transitionIssue] ${issueKey} → "${match.to.name}" (${transRes.ok ? 'OK' : 'FAIL'})`);
  return transRes.ok;
}

// ─── Rellenar campos del manual tras análisis de agentes ─────────────────────
export async function setManualFields(issueKey, supervisorData, resolverData, clasificacion = null) {
  const impacto         = supervisorData?.impacto;
  const alertas         = supervisorData?.alertasEstimadas;
  const clientes        = supervisorData?.clientesEstimados;
  const segmentosRaw    = supervisorData?.segmentos || '';
  const resolucionTexto = resolverData?.comment || '';

  // Normalizar impacto al valor exacto en Jira (sin acentos como los creó el usuario)
  const impactoNorm = normalizarImpacto(impacto) || calcularImpacto({
    alertas:        alertas || 'Menos de 20',
    clientes:       clientes || 'Menos de 300',
    inactividad:    false,
    otrosCriterios: false,
  });

  console.log(`[setManualFields] impacto=${impactoNorm} alertas=${alertas} clientes=${clientes} segmentos=${segmentosRaw}`);

  const fields = {};

  // cascadingselect usa { id: "optionId" }
  if (FIELDS.impacto && impactoNorm && OPTIONS.impacto[impactoNorm])
    fields[FIELDS.impacto] = { id: OPTIONS.impacto[impactoNorm] };

  if (FIELDS.alertasRegistradas && alertas) {
    const aid = OPTIONS.alertas[alertas.trim()];
    if (aid) fields[FIELDS.alertasRegistradas] = { id: aid };
  }

  if (FIELDS.clientesAfectados && clientes) {
    const cid = OPTIONS.clientes[clientes.trim()];
    if (cid) fields[FIELDS.clientesAfectados] = { id: cid };
  }

  // Segmentos: cascadingselect → solo 1 valor (el más relevante)
  if (FIELDS.segmentosAfectados && segmentosRaw) {
    const sid = resolverSegmento(segmentosRaw);
    if (sid) fields[FIELDS.segmentosAfectados] = { id: sid };
  }

  // textarea en team-managed requiere ADF
  if (FIELDS.resolucionAI && resolucionTexto) {
    fields[FIELDS.resolucionAI] = {
      version: 1, type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: resolucionTexto.substring(0, 10000) }] }],
    };
  }

  // Prioridad nativa Jira desde clasificador
  const prioridadMap = { P1: 'Highest', P2: 'High', P3: 'Medium', P4: 'Low' };
  if (clasificacion?.prioridad && prioridadMap[clasificacion.prioridad]) {
    fields.priority = { name: prioridadMap[clasificacion.prioridad] };
  }

  // Fecha límite SLA como duedate (YYYY-MM-DD)
  if (clasificacion?.sla_deadline) {
    fields.duedate = clasificacion.sla_deadline.substring(0, 10);
  }

  // Campos custom IA — texto plano visible en la tarjeta
  if (FIELDS.tipoIA && clasificacion?.tipo)
    fields[FIELDS.tipoIA] = clasificacion.tipo;
  if (FIELDS.prioridadIA && clasificacion?.prioridad)
    fields[FIELDS.prioridadIA] = clasificacion.prioridad;
  if (FIELDS.slaIA && clasificacion?.sla_label)
    fields[FIELDS.slaIA] = clasificacion.sla_label;

  console.log(`[setManualFields] campos a escribir: ${Object.keys(fields).join(', ')} | impacto final: ${impactoNorm}`);

  if (!Object.keys(fields).length) return false;

  const res  = await asApp().requestJira(route`/rest/api/3/issue/${issueKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[setManualFields] FAIL: ${err.substring(0, 300)}`);
  } else {
    console.log(`[setManualFields] ${issueKey} → OK (impacto: ${impactoNorm})`);
  }
  return res.ok;
}

// ─── Comentario único consolidado de todos los agentes ───────────────────────
export async function postConsolidatedComment(issueKey, results) {
  const VERDICT_LABEL = {
    RESUELTO:                       '✅ Resuelto automáticamente',
    ESCALADO_A_HUMANO:              '⚠️ Escalado a gestor humano',
    REQUIERE_INFORMACION_ADICIONAL: '🔄 Requiere información adicional',
    DEVUELTO_PETICIONARIO:          '↩ Devuelto al peticionario — descripción insuficiente (Paso 0)',
  };

  const content = [];

  // ── Cabecera ──────────────────────────────────────────────────────────────
  content.push({ type: 'paragraph', content: [
    { type: 'text', text: '🏦 BankDesk AI — Análisis multiagente completado', marks: [{ type: 'strong' }] },
  ]});
  content.push({ type: 'paragraph', content: [
    { type: 'text', text: `Veredicto: ${VERDICT_LABEL[results.finalStatus] || results.finalStatus}`,
      marks: [{ type: 'strong' }] },
    { type: 'text', text: `  ·  ${new Date(results.timestamp).toLocaleString('es-ES')}` },
  ]});
  content.push({ type: 'rule' });

  // ── Resumen compacto (una línea por agente) ───────────────────────────────
  const sup  = results.supervisor;
  const val  = results.validator;
  const doc  = results.documentor;
  const reso = results.resolver;

  const lines = [];
  if (sup?.comment)  lines.push({ icon: '🧠', label: 'Análisis',    text: sup.comment });
  if (val?.comment)  lines.push({ icon: '🔍', label: `Validación${val.dictamen ? ' · ' + val.dictamen : ''}`, text: val.comment });
  if (doc?.comment)  lines.push({ icon: '📋', label: 'Documentación', text: doc.comment });
  if (reso?.comment) lines.push({ icon: '⚡', label: `Resolución${reso.decision ? ' · ' + reso.decision : ''}`, text: reso.comment });

  for (const line of lines) {
    content.push({ type: 'paragraph', content: [
      { type: 'text', text: `${line.icon} ${line.label}  `, marks: [{ type: 'strong' }] },
      { type: 'text', text: line.text.substring(0, 300) },
    ]});
  }

  // ── Tools consultadas (deduplicadas) ─────────────────────────────────────
  const allSteps = [
    ...(results.supervisor?.steps  || []),
    ...(results.validator?.steps   || []),
    ...(results.documentor?.steps  || []),
    ...(results.resolver?.steps    || []),
  ];
  const seen = new Set();
  const uniqueSteps = allSteps.filter(s => {
    const k = `${s.tool}:${JSON.stringify(s.params)}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  });

  if (uniqueSteps.length > 0) {
    content.push({ type: 'rule' });
    content.push({ type: 'paragraph', content: [
      { type: 'text', text: '🔧 Fuentes consultadas:', marks: [{ type: 'strong' }] },
    ]});
    for (const step of uniqueSteps) {
      const label = TOOL_LABELS[step.tool] || step.tool;
      const summary = toolSummaryText(step);
      if (step.tool === 'query_documents' && step.result?.results?.length) {
        for (const doc of step.result.results) {
          const linkContent = [{ type: 'text', text: `  ${label} → ` }];
          linkContent.push(doc.url
            ? { type: 'text', text: doc.doc, marks: [{ type: 'link', attrs: { href: doc.url } }] }
            : { type: 'text', text: doc.doc });
          content.push({ type: 'paragraph', content: linkContent });
        }
      } else {
        content.push({ type: 'paragraph', content: [
          { type: 'text', text: `  ${label}${summary ? ` → ${summary}` : ''}` },
        ]});
      }
    }
  }

  const body = { type: 'doc', version: 1, content };
  const res = await asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ body }),
  });
  console.log(`[consolidatedComment] ${issueKey} → ${res.ok ? 'OK' : 'FAIL'}`);
  return res.ok;
}

// ─── Crear subtarea y marcarla si es auto-resoluble ───────────────────────────
export async function createSubtask(parentKey, title, isAuto, description = '') {
  const projectKey = parentKey.split('-')[0];

  // En proyectos team-managed el tipo puede llamarse 'Subtask', 'Subtarea' o 'Task'
  // Intentamos con cada uno hasta que funcione
  const issueTypeNames = ['Subtask', 'Subtarea', 'Task'];

  for (const typeName of issueTypeNames) {
    const res = await asApp().requestJira(route`/rest/api/3/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        fields: {
          project:   { key: projectKey },
          parent:    { key: parentKey },
          summary:   `[${isAuto ? 'AUTO' : 'HUMANO'}] ${title}`.substring(0, 200),
          issuetype: { name: typeName },
          labels:    [isAuto ? 'ai-auto' : 'ai-human'],
          ...(description ? { description: {
            type: 'doc', version: 1,
            content: description.split('\n')
              .map(line => line.trim())
              .filter(line => line.length > 0)
              .map(line => ({
                type: 'paragraph',
                content: [{ type: 'text', text: line }],
              })),
          }} : {}),
        },
      }),
    });

    const data = await res.json();

    if (res.ok && data.key) {
      const subtaskKey = data.key;
      console.log(`[createSubtask] ${subtaskKey} (${typeName}) — "${title.substring(0, 60)}" → ${isAuto ? 'AUTO' : 'HUMANO'}`);
      return subtaskKey;
    }

    console.log(`[createSubtask] tipo '${typeName}' falló: ${JSON.stringify(data.errors || data)}`);
  }

  console.error(`[createSubtask] todos los tipos de issue fallaron para "${title.substring(0, 60)}"`);
  return null;
}

// ─── Enriquecer descripción del issue con datos de las tools ──────────────────
export async function enrichIssueDescription(issueKey, originalDesc, allSteps, enrichedText = null) {
  const hasToolData = allSteps?.some(s =>
    ['get_system_logs', 'get_repo_changes'].includes(s.tool)
  );
  if (!hasToolData && !enrichedText) return false;

  // Deduplicar steps por tool+params
  const seen = new Set();
  const unique = allSteps.filter(s => {
    const k = `${s.tool}:${JSON.stringify(s.params)}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  const content = [];

  // Descripción original
  if (originalDesc && !originalDesc.toLowerCase().includes('sin descripción')) {
    content.push({ type: 'paragraph', content: [{ type: 'text', text: originalDesc }] });
  }

  content.push({ type: 'rule' });
  content.push({
    type: 'paragraph',
    content: [{ type: 'text', text: '🤖 Contexto enriquecido automáticamente por BankDesk AI',
                marks: [{ type: 'strong' }] }],
  });

  // Si el LLM generó texto sintetizado, usarlo como párrafo principal
  if (enrichedText) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: enrichedText }],
    });
  }

  for (const step of unique) {
    const r = step.result;
    if (!r) continue;

    if (step.tool === 'get_system_logs' && r.events?.length) {
      content.push({ type: 'paragraph', content: [
        { type: 'text', text: `🖥️ Logs del sistema (${r.log_count} eventos)`, marks: [{ type: 'strong' }] },
      ]});
      for (const ev of r.events.slice(0, 4)) {
        content.push({ type: 'paragraph', content: [
          { type: 'text', text: `[${ev.level}] ${ev.timestamp} · ${ev.service}: ${ev.message}` },
        ]});
      }
    }

    if (step.tool === 'get_repo_changes') {
      const deploys = r.deploys || [];
      const commits = r.commits || [];
      if (deploys.length || commits.length) {
        content.push({ type: 'paragraph', content: [
          { type: 'text', text: `🔀 Cambios recientes en ${r.service}`, marks: [{ type: 'strong' }] },
        ]});
        for (const d of deploys) {
          content.push({ type: 'paragraph', content: [
            { type: 'text', text: `Deploy ${d.version} el ${d.timestamp} — ${d.status}` },
          ]});
        }
        for (const c of commits.slice(0, 3)) {
          content.push({ type: 'paragraph', content: [
            { type: 'text', text: `Commit ${c.sha} (${c.author}): ${c.message}` },
          ]});
        }
        if (r.warning) {
          content.push({ type: 'paragraph', content: [
            { type: 'text', text: r.warning, marks: [{ type: 'strong' }] },
          ]});
        }
      }
    }
  }

  const res = await asApp().requestJira(
    route`/rest/api/3/issue/${issueKey}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        fields: { description: { type: 'doc', version: 1, content } },
      }),
    }
  );
  console.log(`[enrichDescription] ${issueKey} → ${res.ok ? 'OK' : 'FAIL'}`);
  return res.ok;
}

// ─── Comentario de solicitud de información adicional ────────────────────────
export async function postRequireInfoComment(issueKey, resolverData) {
  const infoRaw = resolverData?.info_requerida || '';

  const content = [];

  content.push({ type: 'paragraph', content: [
    { type: 'text', text: '🔄 INFORMACIÓN ADICIONAL REQUERIDA — BankDesk AI', marks: [{ type: 'strong' }] },
  ]});

  content.push({ type: 'paragraph', content: [
    { type: 'text',
      text: 'El análisis multiagente ha completado su revisión pero no puede cerrar esta incidencia sin los datos que se indican a continuación.',
      marks: [{ type: 'em' }] },
  ]});

  content.push({ type: 'rule' });

  if (infoRaw) {
    content.push({ type: 'paragraph', content: [
      { type: 'text', text: '📋 Datos solicitados al peticionario / técnico:', marks: [{ type: 'strong' }] },
    ]});

    const lines = infoRaw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    for (const line of lines) {
      const clean = line.replace(/^[-•*]\s*/, '');
      content.push({ type: 'paragraph', content: [
        { type: 'text', text: `• ${clean}` },
      ]});
    }
  } else {
    content.push({ type: 'paragraph', content: [
      { type: 'text', text: resolverData?.comment || 'Consulta el análisis del agente resolutor para más detalles.' },
    ]});
  }

  content.push({ type: 'rule' });
  content.push({ type: 'paragraph', content: [
    { type: 'text',
      text: 'Una vez aportada la información, actualiza la descripción del ticket y vuelve a ejecutar los agentes desde el panel BankDesk AI.',
      marks: [{ type: 'em' }] },
  ]});

  const body = { type: 'doc', version: 1, content };
  const res = await asApp().requestJira(
    route`/rest/api/3/issue/${issueKey}/comment`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ body }),
    }
  );
  console.log(`[postRequireInfoComment] ${issueKey} → ${res.ok ? 'OK' : 'FAIL'}`);
  return res.ok;
}

// ─── Comentario de resolución automática ─────────────────────────────────────
export async function postResolutionComment(issueKey, resolverResult) {
  const full = resolverResult.full || '';

  function extractSection(text, name) {
    const m = text.match(new RegExp(`${name}[:\\s*]*([\\s\\S]*?)(?=\\n\\d+\\.|\\n[A-ZÁÉÍÓÚÑ_]{3,}[:\\s]|$)`, 'i'));
    return m ? m[1].trim().replace(/\*\*/g, '').substring(0, 600) : null;
  }

  const acciones    = extractSection(full, 'ACCIONES_EJECUTADAS');
  const motivo      = extractSection(full, 'MOTIVO');
  const proximos    = extractSection(full, 'PROXIMOS_PASOS');
  const tiempo      = extractSection(full, 'TIEMPO_ESTIMADO');

  const content = [
    { type: 'paragraph', content: [
      { type: 'text', text: '✅ RESOLUCIÓN AUTOMÁTICA — BankDesk AI', marks: [{ type: 'strong' }] },
    ]},
    { type: 'paragraph', content: [
      { type: 'text', text: 'Esta incidencia ha sido resuelta automáticamente por el sistema multiagente.',
        marks: [{ type: 'em' }] },
    ]},
  ];

  if (motivo) {
    content.push({ type: 'paragraph', content: [
      { type: 'text', text: '📌 Motivo de la resolución', marks: [{ type: 'strong' }] },
    ]});
    content.push({ type: 'paragraph', content: [{ type: 'text', text: motivo }] });
  }

  if (acciones) {
    content.push({ type: 'paragraph', content: [
      { type: 'text', text: '⚙️ Acciones ejecutadas', marks: [{ type: 'strong' }] },
    ]});
    for (const line of acciones.split('\n').filter(l => l.trim())) {
      content.push({ type: 'paragraph', content: [{ type: 'text', text: line.trim() }] });
    }
  }

  if (proximos) {
    content.push({ type: 'paragraph', content: [
      { type: 'text', text: '➡️ Próximos pasos', marks: [{ type: 'strong' }] },
    ]});
    content.push({ type: 'paragraph', content: [{ type: 'text', text: proximos }] });
  }

  if (tiempo) {
    content.push({ type: 'paragraph', content: [
      { type: 'text', text: `⏱️ Tiempo estimado: ${tiempo}`, marks: [{ type: 'strong' }] },
    ]});
  }

  const body = { type: 'doc', version: 1, content };
  const res = await asApp().requestJira(
    route`/rest/api/3/issue/${issueKey}/comment`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ body }),
    }
  );
  console.log(`[postResolutionComment] ${issueKey} → ${res.ok ? 'OK' : 'FAIL'}`);
  return res.ok;
}