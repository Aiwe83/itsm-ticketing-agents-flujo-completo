import { createHash } from 'crypto';
import type { IssuesRequest, JiraChangelogItem, JiraIssueEvent, SanitizedEvent } from './types';

// Esta es la lista de permitidos: decide que datos de un evento de Jira son
// seguros para acabar en la traza. No es una lista de "cosas prohibidas que
// se quitan" (eso seria una lista negra, y siempre se olvida algo); es al
// reves, solo sale lo que aqui se construye explicitamente. Un campo nuevo
// que Jira empiece a mandar manana queda fuera por defecto, sin tocar nada.

// Patrones usados solo por findForbiddenContent(), la comprobacion de
// seguridad de los tests: si alguno de estos aparece en lo que se va a
// registrar, algo se ha colado y hay que arreglarlo.
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const ATLASSIAN_HOST_PATTERN = /https?:\/\/[A-Z0-9.-]*atlassian\.net\b/gi;
const FORBIDDEN_KEYS = new Set([
  'emailAddress',
  'displayName',
  'avatarUrls',
  'attachment',
  'attachments',
  'self',
  'fromString',
  'toString',
  'description'
]);
// Marcador que usan los tests para plantar datos falsos y comprobar que no
// se filtran. No tiene ningun significado fuera de las pruebas.
const CANARY_PATTERN = /\bCANARY_[A-Z0-9_@.-]+\b/gi;

// Convierte un texto en una huella corta e irreversible. Sirve para saber
// "esto cambio" o "esto es lo mismo de antes" sin guardar el texto en si
// (por ejemplo, el titulo del ticket o quien lo toco).
export function hashPrefix(value: string, length = 8): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

// El corazon del saneado. Recibe el evento crudo de Jira y devuelve solo lo
// que esta autorizado a viajar a la traza: identificadores, metadatos y
// derivados (longitudes, huellas), nunca el texto libre en si.
export function sanitizeJiraEvent(event: JiraIssueEvent): SanitizedEvent {
  const fields = event.issue?.fields;
  const summary = typeof fields?.summary === 'string' ? fields.summary : undefined;
  const atlassianId = typeof event.atlassianId === 'string' ? event.atlassianId : undefined;
  const changelogItems = Array.isArray(event.changelog?.items) ? event.changelog.items : [];

  return {
    eventType: stringOrNull(event.eventType),
    selfGenerated: typeof event.selfGenerated === 'boolean' ? event.selfGenerated : null,
    jiraEventTypeName: stringOrNull(event.jiraEventTypeName),
    issueId: stringOrNull(event.issue?.id),
    issueKey: stringOrNull(event.issue?.key),
    projectKey: stringOrNull(fields?.project?.key),
    issueTypeName: stringOrNull(fields?.issuetype?.name),
    statusName: stringOrNull(fields?.status?.name),
    priorityName: stringOrNull(fields?.priority?.name),
    created: stringOrNull(fields?.created),
    updated: stringOrNull(fields?.updated),
    resolutiondate: stringOrNull(fields?.resolutiondate),
    // El titulo nunca sale tal cual: solo su longitud y una huella, para
    // poder comparar dos eventos sin conocer el texto.
    summaryLength: summary ? summary.length : null,
    summarySha256Prefix: summary ? hashPrefix(summary) : null,
    // En el trigger real, Jira ni siquiera manda la descripcion; esto solo
    // dice si el campo llego, nunca su contenido.
    descriptionPresent: fields?.description !== undefined && fields.description !== null,
    // Lo mismo para quien hizo el cambio: se sabe que hubo alguien, nunca
    // quien, mas alla de una huella no reversible.
    actorPresent: atlassianId !== undefined,
    actorSha256Prefix: atlassianId ? hashPrefix(atlassianId) : null,
    associatedUsersCount: Array.isArray(event.associatedUsers) ? event.associatedUsers.length : 0,
    customFieldCount: fields ? countCustomFields(fields) : 0,
    changedFieldNames: extractChangedFieldNames(changelogItems),
    changelogItems: changelogItems.map(sanitizeChangelogItem)
  };
}

// Version del payload apta para la traza. El payload real lleva texto libre y
// datos personales (titulo, descripcion, responsable, nombres de adjuntos) que
// solo pueden viajar en el cuerpo HTTP; aqui se sustituyen por longitudes,
// conteos y presencia. Los campos de catalogo (tipo, estado, prioridad,
// proyecto, fechas) se quedan tal cual.
export function summarizeIssuesRequestForLog(request: IssuesRequest): Record<string, unknown> {
  return {
    initiatedBy: request.initiatedBy,
    issues: request.issues.map((issue) => {
      const { summary, description, components, assignee, attachment, ...catalogFields } =
        issue.fields;
      return {
        id: issue.id,
        key: issue.key,
        fields: {
          ...catalogFields,
          summary: `[redacted:${summary.length}]`,
          descriptionLength: description ? description.length : 0,
          componentCount: components ? components.length : 0,
          assigneePresent: assignee !== undefined,
          attachmentCount: attachment ? attachment.length : 0
        }
      };
    })
  };
}

// Usado solo por los tests de fuga de datos: busca en cualquier objeto si
// aparece alguna de las claves prohibidas, un email, un dominio de
// Atlassian, o un marcador de prueba. Si esto devuelve algo distinto de una
// lista vacia, la prueba falla — es la red de seguridad del proyecto.
export function findForbiddenContent(value: unknown): string[] {
  const matches = new Set<string>();
  collectForbiddenKeys(value, matches);

  const serialized = JSON.stringify(value);

  for (const pattern of [EMAIL_PATTERN, ATLASSIAN_HOST_PATTERN, CANARY_PATTERN]) {
    pattern.lastIndex = 0;
    for (const match of serialized.matchAll(pattern)) {
      matches.add(match[0]);
    }
  }

  return [...matches].sort();
}

function collectForbiddenKeys(value: unknown, matches: Set<string>): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectForbiddenKeys(item, matches));
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      matches.add(key);
    }
    collectForbiddenKeys(nested, matches);
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function countCustomFields(fields: Record<string, unknown>): number {
  return Object.keys(fields).filter((key) => key.startsWith('customfield_')).length;
}

function extractChangedFieldNames(items: JiraChangelogItem[]): string[] {
  return [
    ...new Set(
      items
        .map((item) => item.field)
        .filter((field): field is string => typeof field === 'string' && field.length > 0)
    )
  ].sort();
}

function sanitizeChangelogItem(
  item: JiraChangelogItem
): Pick<JiraChangelogItem, 'field' | 'fieldId' | 'fieldtype'> {
  return {
    field: item.field,
    fieldId: item.fieldId,
    fieldtype: item.fieldtype
  };
}
