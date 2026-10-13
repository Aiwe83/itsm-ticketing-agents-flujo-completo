// El orquestador de todo el flujo: recibe el evento crudo de Jira, lo hace
// pasar por saneado y validacion, decide si corresponde procesarlo (solo
// proyecto BFC, solo altas), pide el ticket completo por REST (Jira no
// manda descripcion/prioridad/componentes/responsable/adjuntos en el
// evento) y decide si se envia o no. Cada paso de esta funcion escribe su
// propia linea de traza, todas con el mismo correlationId, para poder
// seguir una invocacion de principio a fin.
import { randomUUID } from 'crypto';
import { buildIssuesRequest } from './contract';
import { sendIssueToIntegrationService } from './integration-client';
import { readIssueFromJira } from './jira-client';
import { sanitizeJiraEvent, summarizeIssuesRequestForLog } from './sanitize';
import type {
  ForgeContext,
  IntegrationDispatchResult,
  JiraIssue,
  JiraIssueEvent,
  JiraIssueReadResult,
  IssuesRequest,
  SanitizedEvent
} from './types';

type LogWriter = (line: string) => void;
type IssueReader = (issueKey: string) => Promise<JiraIssueReadResult>;
type IntegrationDispatcher = (
  payload: IssuesRequest,
  correlationId: string
) => Promise<IntegrationDispatchResult>;
type Sleeper = (ms: number) => Promise<void>;

// Todo lo que puede variar entre una ejecucion real y un test se puede
// sustituir aqui: la hora, el generador de identificadores, donde se
// escriben los logs, como se lee el ticket de Jira y como se envia de
// verdad. En produccion no se pasa nada y se usan los valores reales; en
// los tests se inyectan dobles.
interface HandlerOptions {
  now?: () => Date;
  uuid?: () => string;
  log?: LogWriter;
  readIssue?: IssueReader;
  send?: IntegrationDispatcher;
  sleep?: Sleeper;
  attachmentRetryDelaysMs?: number[];
}

const CREATED_ISSUE_EVENT = 'avi:jira:created:issue';
const UPDATED_ISSUE_EVENT = 'avi:jira:updated:issue';
const ALLOWED_PROJECT_KEYS = new Set(['BFC']);
const DEFAULT_ATTACHMENT_RETRY_DELAYS_MS = [2000, 5000, 10000];

export async function handleJiraIssueEvent(
  event: JiraIssueEvent,
  context: ForgeContext = {},
  options: HandlerOptions = {}
): Promise<void> {
  const now = options.now ?? (() => new Date());
  const uuid = options.uuid ?? randomUUID;
  const log = options.log ?? console.log;
  const readIssue = options.readIssue ?? readIssueFromJira;
  const send = options.send ?? sendIssueToIntegrationService;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const attachmentRetryDelaysMs = options.attachmentRetryDelaysMs ?? DEFAULT_ATTACHMENT_RETRY_DELAYS_MS;
  const receivedAt = now().toISOString();
  const correlationId = uuid();
  const sanitized = sanitizeJiraEvent(event);
  const eventDate = deriveEventDate(event, receivedAt);

  const common = {
    correlationId,
    receivedAt,
    eventType: sanitized.eventType,
    jiraEventTypeName: sanitized.jiraEventTypeName,
    eventDate: eventDate.value,
    eventDateSource: eventDate.source,
    issueId: sanitized.issueId,
    issueKey: sanitized.issueKey,
    projectKey: sanitized.projectKey,
    issueTypeName: sanitized.issueTypeName,
    statusName: sanitized.statusName,
    changedFieldNames: sanitized.changedFieldNames,
    actorPresent: sanitized.actorPresent,
    summaryLength: sanitized.summaryLength
  };

  // Paso 1: el evento ya saneado. Nunca el evento crudo.
  logJson(log, {
    eventName: 'jira.event.received',
    ...common,
    sanitized
  });

  // Paso 2: que claves trajo el evento de verdad. Es la forma de comprobar,
  // sin adivinar, si Jira manda o no un campo concreto (por ejemplo,
  // "description" nunca aparece en issueFieldKeys).
  logJson(log, {
    eventName: 'jira.event.shape',
    ...common,
    shape: {
      eventKeys: ownKeys(event),
      issueKeys: ownKeys(event.issue),
      issueFieldKeys: ownKeys(event.issue?.fields),
      contextKeys: ownKeys(context)
    }
  });

  const skipReason = getSkipReason(sanitized);
  if (skipReason) {
    logJson(log, {
      eventName: 'jira.event.skipped',
      ...common,
      reason: skipReason
    });
    return;
  }

  // El evento no trae descripcion, prioridad, componentes, responsable ni
  // adjuntos (verificado contra un ticket real: `issueFieldKeys` de Paso 2
  // nunca los incluye): se lee el ticket completo por REST. Si esa lectura
  // falla se sigue con lo que trae el evento (key y summary bastan para que
  // el servicio lo acepte) y queda anotado en la traza como
  // `issueSource: "event"`.
  const jiraRead = sanitized.issueKey
    ? await readIssueWithAttachmentRetry(sanitized.issueKey, readIssue, sleep, attachmentRetryDelaysMs)
    : null;
  const issue = jiraRead?.ok ? mergeIssue(event.issue, jiraRead.issue) : event.issue;
  const contract = buildIssuesRequest({ ...event, issue }, { initiatedBy: 'bkt-jira-triggers' });

  // Paso 3: el mensaje que se enviaria (o el motivo de por que no se puede
  // construir), de donde salieron sus campos y como fue la lectura de
  // Jira. El payload va resumido: el texto libre y los datos personales
  // solo viajan en el cuerpo HTTP, nunca en la traza.
  logJson(log, {
    eventName: 'jira.contract.payload.built',
    ...common,
    issueSource: jiraRead?.ok ? 'jira-rest' : 'event',
    jiraRead: jiraRead
      ? {
          ok: jiraRead.ok,
          status: jiraRead.status,
          errorCode: jiraRead.ok ? undefined : jiraRead.errorCode
        }
      : null,
    contractValid: contract.ok,
    reason: contract.ok ? undefined : contract.reason,
    payload: contract.ok ? summarizeIssuesRequestForLog(contract.request) : undefined,
    projectedCorrelation: {
      correlationId,
      executionId: null,
      storedTicketId: sanitized.issueKey ? `<MESH_ID>:${sanitized.issueKey}` : null,
      projected: true
    }
  });

  // Si el mensaje no es valido, aqui se corta: no se intenta ningun envio.
  // Este `return` es la unica puerta de salida antes de tocar la red.
  if (!contract.ok) {
    return;
  }

  const integration = await send(contract.request, correlationId);
  // Paso 4: que paso al enviarlo. Puede que ni se haya intentado (por
  // ejemplo, si falta configuracion), que se haya intentado y fallado, o
  // que haya salido bien de verdad.
  logJson(log, {
    eventName: 'jira.integration.response',
    ...common,
    sent: integration.sent,
    success: integration.success,
    status: integration.status,
    requestIdEcho: integration.requestIdEcho,
    executionId: integration.executionId,
    storedTicketId: integration.storedTicketId,
    ticketsSucceeded: integration.ticketsSucceeded,
    ticketsFailed: integration.ticketsFailed,
    orchestratorDispatched: integration.orchestratorDispatched,
    errorKind: integration.success ? undefined : integration.errorKind,
    errorCode: integration.success ? undefined : integration.errorCode,
    missingConfigKeys: integration.success ? undefined : integration.missingConfigKeys,
    configIssue: integration.success ? undefined : integration.configIssue,
    diagnostic: integration.success ? undefined : integration.diagnostic
  });
}

// Ticket leido por REST por encima del del evento. Los campos del evento se
// conservan solo si la lectura no los trae.
function mergeIssue(eventIssue: JiraIssue | undefined, restIssue: JiraIssue): JiraIssue {
  return {
    ...eventIssue,
    ...restIssue,
    fields: { ...eventIssue?.fields, ...restIssue.fields }
  };
}

async function readIssueWithAttachmentRetry(
  issueKey: string,
  readIssue: IssueReader,
  sleep: Sleeper,
  retryDelaysMs: number[]
): Promise<JiraIssueReadResult> {
  let lastRead = await readIssue(issueKey);
  if (!lastRead.ok) {
    return lastRead;
  }

  if (hasAttachments(lastRead)) {
    return lastRead;
  }

  for (const delayMs of retryDelaysMs) {
    await sleep(delayMs);
    lastRead = await readIssue(issueKey);
    if (hasAttachments(lastRead)) {
      return lastRead;
    }
  }

  return lastRead;
}

function hasAttachments(read: JiraIssueReadResult): boolean {
  if (!read.ok) {
    return false;
  }

  const attachments = read.issue.fields?.attachment;
  return Array.isArray(attachments) && attachments.length > 0;
}

function getSkipReason(
  event: SanitizedEvent
): 'UNSUPPORTED_EVENT_TYPE' | 'PROJECT_NOT_ALLOWED' | 'UPDATED_EVENT_WITHOUT_ATTACHMENT_CHANGE' | null {
  if (event.eventType && ![CREATED_ISSUE_EVENT, UPDATED_ISSUE_EVENT].includes(event.eventType)) {
    return 'UNSUPPORTED_EVENT_TYPE';
  }

  if (event.projectKey && !ALLOWED_PROJECT_KEYS.has(event.projectKey)) {
    return 'PROJECT_NOT_ALLOWED';
  }

  if (event.eventType === UPDATED_ISSUE_EVENT && !hasAttachmentChange(event)) {
    return 'UPDATED_EVENT_WITHOUT_ATTACHMENT_CHANGE';
  }

  return null;
}

function hasAttachmentChange(event: SanitizedEvent): boolean {
  return event.changedFieldNames.some((field) => field.toLowerCase() === 'attachment');
}

// Decide que fecha usar para "cuando paso esto de verdad": primero intenta
// la de actualizacion, luego la de creacion, y si ninguna sirve, usa la
// hora en la que la app recibio el evento. `source` dice cual se uso, para
// no tener que adivinarlo despues.
export function deriveEventDate(
  event: JiraIssueEvent,
  receivedAt: string
): { value: string; source: 'issue.fields.updated' | 'issue.fields.created' | 'receivedAt' } {
  const updated = parseDate(event.issue?.fields?.updated);
  if (updated) {
    return { value: updated, source: 'issue.fields.updated' };
  }

  const created = parseDate(event.issue?.fields?.created);
  if (created) {
    return { value: created, source: 'issue.fields.created' };
  }

  return { value: receivedAt, source: 'receivedAt' };
}

// Intenta convertir un valor cualquiera en una fecha valida. Si no es texto
// o no se puede interpretar como fecha, devuelve `null` en vez de lanzar un
// error.
function parseDate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

// Devuelve solo los nombres de las claves de un objeto (nunca sus valores),
// ordenados. Se usa para el paso 2 de la traza: dice que campos trajo el
// evento sin exponer lo que hay dentro de cada uno.
function ownKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.keys(value).sort();
}

// Escribe una linea de traza como JSON de una sola linea. Todo lo que pasa
// por aqui ya deberia estar saneado antes de llegar.
function logJson(log: LogWriter, payload: Record<string, unknown>): void {
  log(JSON.stringify(payload));
}
