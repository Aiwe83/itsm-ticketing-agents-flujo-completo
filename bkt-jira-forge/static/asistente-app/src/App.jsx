import React, { useEffect, useState, useRef } from 'react';
import { invoke } from '@forge/bridge';

// ─────────────────────────────────────────────────────────────────────────
// MOCK — todo el estado del análisis vive en el cliente (planes, agentes,
// docs, logs), salvo la prioridad del ticket, que se lee real desde Jira
// vía invoke('getIssuePriority') para decidir qué juego de planes usar.
// Caso demo: usuario IB05758 no puede "Operar"/"Más operativas" desde la
// web (error TCP-HOST BKICPINT 1450). Iteración 1 = comprobaciones para
// localizar el endpoint/transacción/logs. Iteración 2 = consultas SQL sobre
// BKNET para llegar a IND_TRAN_OPERATIVA en blanco (causa raíz).
// ─────────────────────────────────────────────────────────────────────────

const AG_ICON = { Clasificador: '🧭', Supervisor: '🧠', Validador: '🔍', Documentador: '📋', Resolutor: '⚡' };

const REAL = {
  key: 'INCIDENT-142',
  title: 'Error al acceder a "Operar" / "Más operativas" — usuario IB05758',
  estadoReal: 'En curso',
  prioridadReal: 'Alta',
};

// Prioridad por defecto mientras se resuelve invoke('getIssuePriority') o si
// la llamada falla — determina qué juego de planes se usa (ver
// PLAN_ITER_1/PLAN_ITER_2 vs PLAN_1_CASE_2/PLAN_2_CASE_2 más abajo).
const DEFAULT_PRIORITY = 'High';


const SLA = { label: 'SLA P2 — resolución antes de 02/09/2026 18:00h', extra: 'Escalado tras 4 repeticiones del error', urgent: true };

// ─── Resumen inicial (tras Iteración 1) ────────────────────────────────────
const AGENTS_INICIAL = [
  {
    name: 'Validador', done: true, verdict: 'APROBADO',
    text: 'Ticket cumplimentado correctamente: los campos obligatorios están rellenos y se cumplen los criterios de calidad establecidos para su procesamiento.',
  },
  {
    name: 'Clasificador', done: true, verdict: 'TÉCNICA · P2',
    text: 'Ticket clasificado como incidencia técnica de operativa web. Usuario IB05758 reporta error repetido al intentar acceder a "Operar" o "Más operativas" desde banca online.',
  },
  {
    name: 'Supervisor', done: true, verdict: 'Patrón identificado',
    text: 'Localizado en logs el error "ERROR 10 — MODULO:BKICPINT TIPO:1450: SOLO PERMITIDAS TRANSACCIONES DE CONSULTA" repetido 4 veces entre las 19:06h y 19:07h del 24/08/2026, origen TCP-HOST, servicio ms-sat-cardaplication. Trace-id inicial identificado: 9c48ca96b7. Plan de comprobaciones añadido a la pestaña Plan.',
  },
  {
    name: 'Documentador', done: true,
    text: 'Registra el trace-id 9c48ca96b7 y el patrón de error 1450 en el histórico de incidencias SAT para acelerar diagnósticos futuros sobre el mismo tipo de restricción.',
  },
];

// ─── Resumen tras Iteración 2 (cuando el usuario escribe en el chat) ──────
const AGENTS_FINAL = [
  AGENTS_INICIAL[0],
  AGENTS_INICIAL[1],
  {
    ...AGENTS_INICIAL[2],
    text: 'Localizado en logs el error "ERROR 10 — MODULO:BKICPINT TIPO:1450: SOLO PERMITIDAS TRANSACCIONES DE CONSULTA" repetido 4 veces entre las 19:06h y 19:07h del 24/08/2026, origen TCP-HOST, servicio ms-sat-cardaplication. Trace-id inicial identificado: 9c48ca96b7. Con IND_TRAN_OPERATIVA en blanco confirmado en la ficha del usuario, el ICP bloquea correctamente cualquier operativa distinta de consulta. Nuevo plan añadido a la pestaña Plan.',
    verdict: 'ESCALADO A NSD',
  },
  {
    name: 'Documentador', done: true,
    text: 'Actualiza la ficha de la incidencia con la causa raíz confirmada: campo IND_TRAN_OPERATIVA sin informar en BKNET.NEUSU_NET para el usuario IB05758 (código interno traducido desde CLV4_USUARIO). Queda documentado como precedente para futuros casos con el mismo error 1450.',
  },
];

// ─── Documentación / logs (pestaña Documentación) ─────────────────────────
// DOCS: documentación asociada (caso High desde el inicio; caso 2 solo tras
// generarse el segundo plan).
const DOCS = [
  {
    name: 'Runbook · Restricciones ICP por perfil de usuario',
    snippet: 'Ante errores TIPO:1450 ("SOLO PERMITIDAS TRANSACCIONES DE CONSULTA"): 1) emular al cliente para reproducir el fallo, 2) obtener el endpoint y el id de transacción implicados, 3) cruzar el trace-id con los logs del servicio SAT, 4) revisar el indicador IND_TRAN_OPERATIVA en la ficha del usuario en BKNET.NEUSU_NET.',
  },
];

const LOGS = [
  { level: 'ERROR', ts: '2026-08-24 19:06:21', service: 'ms-sat-cardaplication', msg: 'ERROR 10 — MODULO:BKICPINT TIPO:1450:SOLO PERMITIDAS TRANSACCIONES DE CONSULTA · user_actor:IB05758' },
  { level: 'ERROR', ts: '2026-08-24 19:06:39', service: 'ms-sat-cardaplication', msg: 'ERROR 10 — MODULO:BKICPINT TIPO:1450:SOLO PERMITIDAS TRANSACCIONES DE CONSULTA · user_actor:IB05758' },
  { level: 'ERROR', ts: '2026-08-24 19:07:02', service: 'ms-sat-cardaplication', msg: 'ERROR 10 — MODULO:BKICPINT TIPO:1450:SOLO PERMITIDAS TRANSACCIONES DE CONSULTA · user_actor:IB05758' },
  { level: 'ERROR', ts: '2026-08-24 19:07:47', service: 'ms-sat-cardaplication', msg: 'ERROR 10 — MODULO:BKICPINT TIPO:1450:SOLO PERMITIDAS TRANSACCIONES DE CONSULTA · user_actor:IB05758 · trace-id:9c48ca96b7' },
];

const RELATED_INCIDENTS = [
  {
    titulo: 'INC-20260112-SAT-1450 — Error 1450 recurrente en usuario sin perfilado NSD',
    fecha: '12/01/2026',
    resumen: 'Mismo patrón de error TCP-HOST 1450 para un usuario cuya ficha en BKNET.NEUSU_NET tenía IND_TRAN_OPERATIVA sin informar tras un alta incompleta por parte de NSD.',
    resolucion: 'Se escaló a NSD para completar el perfilado del usuario.',
  },
];

// ─── Plan — Iteración 1 (comprobaciones) ──────────────────────────────────
const PLAN_ITER_1 = {
  titulo: 'Plan propuesto',
  motivo: 'El usuario IB05758 recibe un error repetido (TIPO:1450) al intentar usar "Operar" o "Más operativas" desde la web. Los logs muestran 4 repeticiones entre las 19:06h y 19:07h del 24/08/2026, servicio ms-sat-cardaplication, con id de primera traza 9c48ca96b7.',
  acciones: '1. Emular al cliente (usuario IB05758) para reproducir el error.\n2. Localizar el endpoint concreto que está causando el error.\n3. Buscar en los logs de ms-sat-cardaplication los que pertenezcan al trace-id 9c48ca96b7 y al usuario IB05758, para obtener el código de la transacción invocada.',
};

// ─── Plan — Iteración 2 (consultas SQL + causa raíz) ──────────────────────
const PLAN_ITER_2 = {
  titulo: 'Plan propuesto',
  motivo: 'Obtenida la transacción y localizado el endpoint, se revisa la configuración del servicio SAT y el perfilado del usuario de conexión.',
  acciones: 'Consulta 1 — Configuración del servicio en BKNET.NESERVICIO:\nSELECT COD4_ASOCIADO, TIPO_COD, IND1_GRUPO, IND_TARJ_CLAVE, IND_HISTORICO, IND_CONTROL_LIMITE FROM BKNET.NESERVICIO WHERE EMPRESA = \'VALOR_EMPRESA\' AND TIPO_SERVICIO = \'VALOR_TIPO_SERVICIO\' AND COD4_SERVICIO = \'VALOR_COD4_SERVICIO\' AND COD4_ASOCIADO >= \'VALOR_COD4_ASOCIADO\'\n\nConsulta 2 — Traducir CLV4_USUARIO (IB05758) al código interno:\nSELECT A.COD6_USUARIO, A.PERSONA, B.COD6_USUARIO, B.CLV4_USUARIO FROM BKNET.NEUSU_NET A, BKNET.NEUSU_SERV B WHERE B.COD6_USUARIO = A.COD6_USUARIO AND B.CLV4_USUARIO = \'IB05758\'\n\nConsulta 3 — Ficha del usuario y campo IND_TRAN_OPERATIVA:\nSELECT * FROM BKNET.NEUSU_NET WHERE COD6_USUARIO = \'VALOR_CODIGO_USUARIO\'\n\nComprobación final — Tras realizar la consulta 3, revisar el valor de la columna IND_TRAN_OPERATIVA. Si no está informado a C (transacciones de consulta), asignar la incidencia a NSD para que revise el usuario y su perfilado.',
};

// ─── Plan — Caso 2 (prioridad distinta de High) — Iteración 1 ────────────
const PLAN_1_CASE_2 = {
  titulo: 'Plan propuesto',
  motivo: 'El usuario recibe un error al intentar usar "Operar" o "Más operativas" desde la web, se debe identificar el servicio que esta causando el error y el tipo de error.',
  acciones: '1. Buscar errores en los servicios asociados al usuario y obtener el nombre del servicio y sus ids de traza.\n2. Una vez identificado el servicio, emular al cliente para reproducir el error.\n3. Localizar el endpoint concreto que está causando el error.\n4. Buscar en los logs del servicio que causa el error, filtrando por los ids de traza, para obtener el código de la transacción invocada.',
};

// ─── Plan — Caso 2 (prioridad distinta de High) — Iteración 2 ────────────
const PLAN_2_CASE_2 = {
  titulo: 'Plan propuesto',
  motivo: 'Dado eque el servicio afectado es SAT se debe revisar el perfilado del usuario de conexión.',
  acciones: 'Consulta 1 — Configuración del servicio en BKNET.NESERVICIO:\nSELECT COD4_ASOCIADO, TIPO_COD, IND1_GRUPO, IND_TARJ_CLAVE, IND_HISTORICO, IND_CONTROL_LIMITE FROM BKNET.NESERVICIO WHERE EMPRESA = \'VALOR_EMPRESA\' AND TIPO_SERVICIO = \'VALOR_TIPO_SERVICIO\' AND COD4_SERVICIO = \'VALOR_COD4_SERVICIO\' AND COD4_ASOCIADO >= \'VALOR_COD4_ASOCIADO\'\n\nConsulta 2 — Traducir CLV4_USUARIO al código interno:\nSELECT A.COD6_USUARIO, A.PERSONA, B.COD6_USUARIO, B.CLV4_USUARIO FROM BKNET.NEUSU_NET A, BKNET.NEUSU_SERV B WHERE B.COD6_USUARIO = A.COD6_USUARIO AND B.CLV4_USUARIO = \'VALOR_CLV4_USUARIO\'\n\nConsulta 3 — Ficha del usuario y campo IND_TRAN_OPERATIVA:\nSELECT * FROM BKNET.NEUSU_NET WHERE COD6_USUARIO = \'VALOR_CODIGO_USUARIO\'\n\nComprobación final — Tras realizar la consulta 3, revisar el valor de la columna IND_TRAN_OPERATIVA. Si no está informado a C (transacciones de consulta), asignar la incidencia a NSD para que revise el usuario y su perfilado.',
};

// ─── Caso 2 (prioridad distinta de High) — cabecera y resumen de agentes ─
// Sin referencias al usuario IB05758 ni al equipo asignado. Sin logs, y la
// documentación (DOCS) no aparece hasta que se genera PLAN_2_CASE_2.
const REAL_CASE_2 = {
  ...REAL,
  title: 'Error al acceder a "Operar" / "Más operativas"',
  prioridadReal: 'Medium',
};

const DOCUMENTADOR_CASE_2 = {
  name: 'Documentador', done: true,
  text: 'Registrado el plan generado para el error reportado al pulsar «Operar» y «Más operativas» desde la web.',
};

const AGENTS_INICIAL_CASE_2 = [
  AGENTS_INICIAL[0],
  {
    ...AGENTS_INICIAL[1],
    text: 'Ticket clasificado como incidencia técnica de operativa web. El usuario reporta error repetido al intentar acceder a "Operar" o "Más operativas" desde banca online.',
  },
  {
    ...AGENTS_INICIAL[2],
    text: 'Error reportado al pulsar «Operar» y «Más operativas» desde la web; pendiente identificar el servicio causante y el tipo de error. Plan de comprobaciones añadido a la pestaña Plan.',
  },
  DOCUMENTADOR_CASE_2,
];

const AGENTS_FINAL_CASE_2 = [
  AGENTS_INICIAL_CASE_2[0],
  AGENTS_INICIAL_CASE_2[1],
  {
    ...AGENTS_FINAL[2],
    text: 'Servicio afectado SAT, por lo que procede revisar el perfilado del usuario en las tablas BKNET (NESERVICIO, NEUSU_SERV y NEUSU_NET). Plan de comprobaciones añadido a la pestaña Plan.',
  },
  DOCUMENTADOR_CASE_2,
];

const TABS = [
  { key: 'resumen', label: 'Resumen', icon: '✦' },
  { key: 'docs', label: 'Documentación', icon: '📚' },
  { key: 'plan', label: 'Plan', icon: '🗒️' },
  { key: 'asistente', label: 'Área de trabajo', icon: '💬' },
];

// Renderizador de markdown minimalista para las respuestas del asistente
// (negrita, `código`, encabezados #/##/###, listas - / 1. y párrafos). Sin
// dependencias externas ni dangerouslySetInnerHTML.
function renderInline(text, keyPrefix) {
  const parts = [];
  const regex = /\*\*(.+?)\*\*|`(.+?)`/g;
  let lastIndex = 0, m, i = 0;
  while ((m = regex.exec(text))) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    if (m[1] !== undefined) parts.push(<strong key={`${keyPrefix}-b${i++}`}>{m[1]}</strong>);
    else parts.push(<code key={`${keyPrefix}-c${i++}`}>{m[2]}</code>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function renderMarkdownLite(text) {
  const blocks = String(text || '').split(/\n{2,}/);
  return blocks.map((block, bi) => {
    const lines = block.split('\n').filter(l => l.trim());
    if (!lines.length) return null;

    const headingMatch = lines.length === 1 && lines[0].match(/^(#{1,4})\s+(.*)/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 3);
      return <div className={`md-h md-h${level}`} key={bi}>{renderInline(headingMatch[2], `h${bi}`)}</div>;
    }

    const isList = lines.every(l => /^\s*([-*]|\d+\.)\s+/.test(l));
    if (isList) {
      const ordered = /^\s*\d+\./.test(lines[0]);
      const ListTag = ordered ? 'ol' : 'ul';
      return (
        <ListTag className="md-list" key={bi}>
          {lines.map((l, li) => (
            <li key={li}>{renderInline(l.replace(/^\s*([-*]|\d+\.)\s+/, ''), `${bi}-${li}`)}</li>
          ))}
        </ListTag>
      );
    }

    return (
      <p className="md-p" key={bi}>
        {lines.map((l, li) => (
          <React.Fragment key={li}>
            {li > 0 && <br />}
            {renderInline(l, `${bi}-${li}`)}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

function PlanBlock({ plan }) {
  return (
    <>
      <div className="plan-decision-pill">{plan.titulo}</div>
      {plan.motivo && (
        <div className="plan-section">
          <div className="plan-section-title">📌 Motivo</div>
          <div className="plan-section-text">{plan.motivo}</div>
        </div>
      )}
      {plan.acciones && (
        <div className="plan-section">
          <div className="plan-section-title">⚙️ Acciones / comprobaciones</div>
          <div className="plan-section-text">{plan.acciones}</div>
        </div>
      )}
    </>
  );
}

export default function App() {
  const [openDoc, setOpenDoc] = useState(null);
  const [openRelated, setOpenRelated] = useState(null);
  const [tab, setTab] = useState('resumen');

  // Estado del asistente (chat libre en pestaña "Asistente")
  const [chat, setChat] = useState([
    { who: 'bot', text: 'Hola, esta es tu área de trabajo de BankDesk AI. Pregúntame lo que necesites sobre el análisis de esta incidencia o pídeme que profundice en cualquier punto.' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);

  // Prioridad real del ticket, leída de Jira vía invoke. Selecciona qué
  // juego de planes se usa: 'High' → planes originales; cualquier otro
  // valor → case 2.
  const [priority, setPriority] = useState(DEFAULT_PRIORITY);
  const isHighPriority = priority === 'High';
  const PLAN_1 = isHighPriority ? PLAN_ITER_1 : PLAN_1_CASE_2;
  const PLAN_2 = isHighPriority ? PLAN_ITER_2 : PLAN_2_CASE_2;
  const HEADER = isHighPriority ? REAL : REAL_CASE_2;

  // Estado del plan mockeado — Iteración 2 se dispara al escribir un texto
  // que contenga "MH66" en la cajita de chat de la pestaña Plan.
  const [planStages, setPlanStages] = useState([PLAN_1]);
  const [planInput, setPlanInput] = useState('');
  const [planChat, setPlanChat] = useState([]);
  const [planThinking, setPlanThinking] = useState(false);
  const planEndRef = useRef(null);

  // Todo lo que depende de si ya se generó el segundo plan
  const planAdvanced = planStages.length > 1;
  const agents = isHighPriority
    ? (planAdvanced ? AGENTS_FINAL : AGENTS_INICIAL)
    : (planAdvanced ? AGENTS_FINAL_CASE_2 : AGENTS_INICIAL_CASE_2);
  // Caso High: DOCS desde el inicio. Caso 2: DOCS solo tras el segundo plan.
  const docs = isHighPriority || planAdvanced ? DOCS : [];

  useEffect(() => {
    invoke('getIssuePriority')
      .then(res => {
        if (res?.priority) setPriority(res.priority);
      })
      .catch(e => console.error('getIssuePriority invoke error:', e));
  }, []);

  // Si la prioridad real llega tras el primer render y el usuario todavía
  // no ha avanzado al segundo plan, actualiza el primer plan mostrado.
  useEffect(() => {
    setPlanStages(s => (s.length > 1 ? s : [PLAN_1]));
  }, [priority]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  useEffect(() => {
    planEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [planStages, planThinking, planChat]);

  function sendFree() {
    const q = input.trim();
    if (!q) return;
    setInput('');
    setChat(c => [...c, { who: 'user', text: q }]);
    setSending(true);
    setTimeout(() => {
      setChat(c => [...c, {
        who: 'bot',
        text: 'Según el análisis de los agentes, la causa raíz es que el campo **IND_TRAN_OPERATIVA** está sin informar en la ficha del usuario IB05758 (`BKNET.NEUSU_NET`). El ICP bloquea correctamente cualquier operativa distinta de consulta — no es un fallo del servicio SAT. Se ha escalado a NSD para revisar el perfilado del usuario.',
      }]);
      setSending(false);
    }, 1400);
  }

  function sendPlanMessage() {
    const q = planInput.trim();
    if (!q || planThinking) return;
    const foundMH66 = /MH66/i.test(q);
    setPlanInput('');
    setPlanChat(c => [...c, { who: 'user', text: q }]);
    setPlanThinking(true);
    setTimeout(() => {
      if (foundMH66) {
        setPlanChat(c => [...c, {
          who: 'bot',
          text: 'Nuevo plan generado con usando la infomación aportada por el usuario',
        }]);
        setPlanStages(s => (s.length > 1 ? s : [...s, PLAN_2]));
      } else {
        setPlanChat(c => [...c, {
          who: 'bot',
          text: 'Con la información aportada y las fuentes actuales no ha sido posible generar un nuevo plan de resolución',
        }]);
      }
      setPlanThinking(false);
    }, 7500);
  }

  return (
    <div className="panel">
      <div className="sticky-head">
        <div className="hero-card">
          <div className="hero-top">
            <div className="hero-badge">🤖</div>
            <div className="hero-title-block">
              <div className="hero-title">Asistente de Incidencia</div>
              <div className="hero-subtitle">{HEADER.key} · {HEADER.title}</div>
            </div>
            <span className="verdict-pill info">En análisis</span>
          </div>
          <div className="hero-meta">
            {HEADER.estadoReal && <span className="hero-chip">{HEADER.estadoReal}</span>}
            {HEADER.prioridadReal && <span className="hero-chip">{HEADER.prioridadReal}</span>}
            {HEADER.assigneeReal && <span className="hero-chip">👤 {HEADER.assigneeReal}</span>}
          </div>
        </div>

        <div className="tab-bar">
          {TABS.map(t => (
            <button
              key={t.key}
              className={"tab-btn" + (tab === t.key ? ' active' : '')}
              onClick={() => setTab(t.key)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tab-content">
        {tab === 'resumen' && (
          <div className="tab-panel">
            <div className={"sla-banner " + (SLA.urgent ? 'urgent' : 'normal')}>
              <span>⏱ <b>{SLA.label}</b></span>
              {SLA.extra && <span>⚖️ {SLA.extra}</span>}
            </div>

            <section className="card agent-card">
              <div className="card-title">✦ Resumen del sistema agéntico</div>
              {agents.map((a, i) => (
                <div className={"agent-item" + (a.done ? '' : ' pending')} key={i}>
                  <div className="agent-icon">{AG_ICON[a.name]}</div>
                  <div className="agent-body">
                    <div className="agent-name-row">
                      <span className="agent-name">{a.name}</span>
                      {a.done && a.verdict && <span className="agent-verdict">{a.verdict}</span>}
                    </div>
                    <div className={a.done ? 'agent-text' : 'agent-pending'}>
                      {a.done ? a.text : (a.pendingLabel || 'En cola — aún no procesado')}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          </div>
        )}

        {tab === 'docs' && (
          <div className="tab-panel">
            <section className="card">
              <div className="card-title">📚 Documentación asociada</div>
              {docs.length === 0 && (
                <div className="empty-state">No hay documentación asociada todavía</div>
              )}
              {docs.map((d, i) => (
                <div className="doc-item" key={i} onClick={() => setOpenDoc(openDoc === i ? null : i)}>
                  <div className="doc-name">📄 {d.name}</div>
                  {openDoc === i && <div className="doc-snippet">{d.snippet}</div>}
                </div>
              ))}
            </section>

            <section className="card">
              <div className="card-title-row">
                <div className="card-title">📊 Logs</div>
              </div>
              {!isHighPriority && (
                <div className="empty-state">No se han localizado logs para el caso</div>
              )}
              {isHighPriority && LOGS.map((l, i) => (
                <div className="log-line" key={i}>
                  <span className={"log-level " + l.level}>{l.level}</span>
                  <span className="log-ts">{l.ts}</span>
                  <span className="log-service">{l.service}</span>
                  <span className="log-msg">{l.msg}</span>
                </div>
              ))}
            </section>

            <section className="card">
              <div className="card-title">🔗 Incidencias relacionadas</div>
              {RELATED_INCIDENTS.map((r, i) => (
                <div className="related-item" key={i}>
                  <div className="related-header">
                    <div className="related-title">{r.titulo}</div>
                    {r.fecha && <div className="related-date">{r.fecha}</div>}
                  </div>
                  {r.resumen && <div className="related-summary">{r.resumen}</div>}
                  <div className="related-actions">
                    {r.resolucion && (
                      <button className="related-link" onClick={() => setOpenRelated(openRelated === i ? null : i)}>
                        {openRelated === i ? 'Ocultar resolución' : 'Ver resolución'}
                      </button>
                    )}
                  </div>
                  {openRelated === i && r.resolucion && <div className="doc-snippet">{r.resolucion}</div>}
                </div>
              ))}
            </section>
          </div>
        )}

        {tab === 'plan' && (
          <div className="tab-panel">
            <section className="card plan-card">
              <div className="card-title">🗒️ Plan de resolución</div>

              {planStages.map((plan, i) => (
                <div key={i} style={i > 0 ? { marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #F1F2F4' } : undefined}>
                  <PlanBlock plan={plan} />
                </div>
              ))}

              {planThinking && (
                <div className="agent-item pending" style={{ marginTop: '10px' }}>
                  <div className="agent-icon">🧠</div>
                  <div className="agent-body">
                    <div className="agent-name-row"><span className="agent-name">Supervisor</span></div>
                    <div className="agent-pending">Analizando la información aportada y preparando el siguiente paso…</div>
                  </div>
                </div>
              )}

              <div className="plan-review" style={{ marginTop: '14px' }}>
                {planChat.length > 0 && (
                  <div className="chat-log" style={{ marginBottom: '10px' }}>
                    {planChat.map((m, i) => (
                      <div className={"chat-msg " + m.who} key={i}>
                        <div className="chat-bubble">{m.who === 'bot' ? renderMarkdownLite(m.text) : m.text}</div>
                      </div>
                    ))}
                    <div ref={planEndRef} />
                  </div>
                )}

                <div className="chat-input-row">
                  <input
                    value={planInput}
                    onChange={e => setPlanInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendPlanMessage()}
                    placeholder="Añade más información para generar un nuevo plan."
                    disabled={planThinking}
                  />
                  <button onClick={sendPlanMessage} disabled={planThinking}>➤</button>
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === 'asistente' && (
          <div className="tab-panel">
            <section className="card assistant-card">
              <div className="card-title">✦ Área de trabajo</div>
              <div className="chat-log">
                {chat.map((m, i) => (
                  <div className={"chat-msg " + m.who} key={i}>
                    <div className="chat-bubble">{m.who === 'bot' ? renderMarkdownLite(m.text) : m.text}</div>
                  </div>
                ))}
                {sending && <div className="chat-msg bot"><div className="chat-bubble">…</div></div>}
                <div ref={chatEndRef} />
              </div>

              <div className="chat-input-row">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendFree()}
                  placeholder="Escribe tu pregunta sobre esta incidencia…"
                />
                <button onClick={sendFree}>➤</button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
