import { z } from 'zod';
import type {
  BuildIssuesRequestResult,
  IssueAttachment,
  IssuesRequest,
  JiraIssueEvent
} from './types';

// Este fichero construye y valida el mensaje que se enviaria a
// integration-service. Es el unico sitio donde se decide si un evento de
// Jira produce un mensaje valido o no; el handler nunca construye el
// payload por su cuenta.

export const CONTRACT_SOURCE_DATE = '2026-08-13';

// Limites acordados con integration-service: si su validador cambia, estos
// numeros son los que hay que revisar primero.
const ID_MAX = 128;
const SHORT_TEXT_MAX = 500;
const INITIATED_BY_MAX = 200;
// Maximo de un campo de texto largo en Jira (la descripcion no pasa de aqui).
const DESCRIPTION_MAX = 32_767;
const URL_MAX = 2_048;
// Tope defensivo de cuantos adjuntos se aceptan por ticket: no es un limite
// real de Jira, es para no dejar crecer el payload/log sin control.
const MAX_ATTACHMENTS = 20;
// Caracteres de control (saltos de linea raros, tabulaciones invisibles,
// etc.) que se quitan del texto antes de enviarlo. No son visibles pero
// pueden romper el JSON o colarse en un log.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// Forma comun de los campos "con nombre" de Jira (issuetype, status,
// priority): todos son solo `{ name: "..." }`.
const nameSchema = z
  .object({
    name: z.string().max(SHORT_TEXT_MAX).optional()
  })
  .passthrough();

// La forma exacta de una incidencia dentro del mensaje. `.passthrough()` en
// cada nivel significa "deja pasar cualquier campo extra sin quejarte": no
// hace falta conocer todos los campos que Jira pueda mandar, solo validar
// los que de verdad importan.
const issueSchema = z
  .object({
    id: z.string().min(1).max(ID_MAX).optional(),
    key: z.string().min(1).max(ID_MAX),
    fields: z
      .object({
        summary: z.string().min(1).max(SHORT_TEXT_MAX),
        issuetype: nameSchema.optional(),
        status: nameSchema.optional(),
        project: z
          .object({
            key: z.string().min(1).max(ID_MAX).optional()
          })
          .passthrough()
          .optional(),
        priority: nameSchema.optional(),
        created: z.string().optional(),
        updated: z.string().optional(),
        description: z.string().min(1).max(DESCRIPTION_MAX).optional(),
        components: z
          .array(
            z.object({
              id: z.string().min(1).max(ID_MAX).optional(),
              name: z.string().min(1).max(SHORT_TEXT_MAX)
            })
          )
          .optional(),
        assignee: z
          .object({
            accountId: z.string().min(1).max(ID_MAX).optional(),
            emailAddress: z.string().min(1).max(SHORT_TEXT_MAX).optional(),
            displayName: z.string().min(1).max(SHORT_TEXT_MAX).optional()
          })
          .optional(),
        attachment: z
          .array(
            z.object({
              id: z.string().min(1).max(ID_MAX).optional(),
              filename: z.string().min(1).max(SHORT_TEXT_MAX),
              mimeType: z.string().min(1).max(SHORT_TEXT_MAX).optional(),
              size: z.number().nonnegative().optional(),
              content: z.string().url().max(URL_MAX)
            })
          )
          .max(MAX_ATTACHMENTS)
          .optional()
      })
      .passthrough()
  })
  .passthrough();

// El mensaje completo. `z.tuple([issueSchema])` obliga a que `issues` tenga
// exactamente un elemento, ni cero ni dos — asi coincide con lo que
// integration-service exige de verdad.
export const issuesRequestSchema = z
  .object({
    initiatedBy: z.string().min(1).max(INITIATED_BY_MAX).optional(),
    issues: z.tuple([issueSchema])
  })
  .passthrough();

// Construye el mensaje a partir de un evento de Jira, o dice por que no se
// puede construir. El handler le pasa el evento con `issue` ya sustituido por
// el ticket completo leido por REST (o el del evento, si esa lectura fallo).
// Nunca lanza una excepcion por datos incompletos: siempre
// devuelve `{ ok: true, request }` o `{ ok: false, reason }`, y es el
// handler quien decide que hacer con eso (normalmente, no enviar nada).
export function buildIssuesRequest(
  event: JiraIssueEvent,
  options: { initiatedBy: string }
): BuildIssuesRequestResult {
  const issue = event.issue;
  const fields = issue?.fields;

  // Sin `fields` no hay nada que construir: puede pasar si el evento viene
  // con una forma inesperada.
  if (!fields) {
    return { ok: false, reason: 'MISSING_FIELDS' };
  }

  // `key` (por ejemplo "DAT-3") es obligatorio para integration-service.
  const key = normalizeText(issue.key, ID_MAX);
  if (!key) {
    return { ok: false, reason: 'MISSING_KEY' };
  }

  // `summary` (el titulo) tambien es obligatorio. Aqui solo se mide y se
  // limpia su longitud; el propio texto nunca aparece en los logs (eso lo
  // hace sanitize.ts en otro punto del flujo).
  const summary = normalizeText(fields.summary, SHORT_TEXT_MAX);
  if (!summary) {
    return { ok: false, reason: 'MISSING_SUMMARY' };
  }

  const description = normalizeText(adfToPlainText(fields.description), DESCRIPTION_MAX);
  const components = buildComponents(fields.components);
  const assignee = buildAssignee(fields.assignee);
  const attachment = buildAttachments(fields.attachment);

  const request: IssuesRequest = {
    initiatedBy: normalizeText(options.initiatedBy, INITIATED_BY_MAX) || 'bkt-jira-triggers',
    issues: [
      {
        // Cada campo opcional se incluye solo si de verdad trae algo
        // despues de limpiarlo. Asi nunca se manda un campo vacio o con
        // solo espacios: si no hay nada que decir, el campo ni aparece.
        ...(normalizeText(issue.id, ID_MAX) ? { id: normalizeText(issue.id, ID_MAX) } : {}),
        key,
        fields: {
          summary,
          ...(normalizeText(fields.issuetype?.name, SHORT_TEXT_MAX)
            ? { issuetype: { name: normalizeText(fields.issuetype?.name, SHORT_TEXT_MAX) } }
            : {}),
          ...(normalizeText(fields.status?.name, SHORT_TEXT_MAX)
            ? { status: { name: normalizeText(fields.status?.name, SHORT_TEXT_MAX) } }
            : {}),
          ...(normalizeText(fields.project?.key, ID_MAX)
            ? { project: { key: normalizeText(fields.project?.key, ID_MAX) } }
            : {}),
          ...(normalizeText(fields.priority?.name, SHORT_TEXT_MAX)
            ? { priority: { name: normalizeText(fields.priority?.name, SHORT_TEXT_MAX) } }
            : {}),
          ...(normalizeText(fields.created, SHORT_TEXT_MAX)
            ? { created: normalizeText(fields.created, SHORT_TEXT_MAX) }
            : {}),
          ...(normalizeText(fields.updated, SHORT_TEXT_MAX)
            ? { updated: normalizeText(fields.updated, SHORT_TEXT_MAX) }
            : {}),
          ...(description ? { description } : {}),
          ...(components.length > 0 ? { components } : {}),
          ...(assignee ? { assignee } : {}),
          // Los adjuntos no estan en el catalogo de mappings, pero
          // integration-service solo procesa los que vienen aqui: no los
          // busca en Jira por su cuenta. Van solo los metadatos; el
          // contenido lo descarga el servicio desde `content`.
          ...(attachment.length > 0 ? { attachment } : {})
        }
      }
    ]
  };

  // Ultima comprobacion antes de dar el mensaje por bueno: si algo no
  // encajara con el esquema (no deberia, ya se ha limpiado todo a mano),
  // esto lanzaria un error en vez de dejar salir un mensaje mal formado.
  issuesRequestSchema.parse(request);
  return { ok: true, request };
}

// Limpia un valor para que sea seguro de enviar: si no es texto, lo trata
// como vacio; si lo es, le quita los caracteres de control, los espacios
// sobrantes al principio y al final, y lo recorta al maximo permitido.
export function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(FORBIDDEN_CONTROL_CHARS, '').trim().slice(0, maxLength);
}

// Aplana la descripcion a texto plano. En la API v3 Jira la devuelve en ADF
// (un arbol JSON de parrafos, listas, tablas...), pero el modelo de datos de
// integration-service la espera como string y su mapping la copia tal cual.
// Si ya es texto (API v2 u otro origen) se deja igual.
export function adfToPlainText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return adfNodeToText(value).trim();
}

function adfNodeToText(node: unknown): string {
  const record = asRecord(node);
  if (!record) {
    return '';
  }

  const attrs = asRecord(record.attrs);
  const children = Array.isArray(record.content) ? record.content.map(adfNodeToText) : [];

  switch (record.type) {
    case 'text':
      return typeof record.text === 'string' ? record.text : '';
    case 'hardBreak':
      return '\n';
    case 'mention':
    case 'emoji':
    case 'status':
      return typeof attrs?.text === 'string' ? attrs.text : '';
    case 'inlineCard':
      return typeof attrs?.url === 'string' ? attrs.url : '';
    // Bloques de una linea: sus hijos son texto en linea y van seguidos.
    case 'paragraph':
    case 'heading':
    case 'codeBlock':
      return children.join('');
    case 'listItem':
      return `- ${children.filter(Boolean).join('\n')}`;
    case 'tableRow':
      return children.filter(Boolean).join(' | ');
    // doc, listas, tablas, citas, paneles...: un bloque por linea. Lo que no
    // tiene texto (imagenes, separadores) se queda fuera.
    default:
      return children.filter(Boolean).join('\n');
  }
}

// Componentes como `{ id, name }`: sin `self` (URL interna de Jira), que el
// mapping copiaria tal cual al ticket.
function buildComponents(value: unknown): Array<{ id?: string; name: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);
    const name = normalizeText(record?.name, SHORT_TEXT_MAX);
    if (!name) {
      return [];
    }
    const id = normalizeText(record?.id, ID_MAX);
    return [{ ...(id ? { id } : {}), name }];
  });
}

// Solo los tres campos que mapea integration-service. El email puede no venir:
// Jira lo oculta segun la privacidad de cada usuario.
function buildAssignee(value: unknown): IssuesRequest['issues'][0]['fields']['assignee'] {
  const record = asRecord(value);
  const accountId = normalizeText(record?.accountId, ID_MAX);
  const emailAddress = normalizeText(record?.emailAddress, SHORT_TEXT_MAX);
  const displayName = normalizeText(record?.displayName, SHORT_TEXT_MAX);
  if (!accountId && !emailAddress && !displayName) {
    return undefined;
  }

  return {
    ...(accountId ? { accountId } : {}),
    ...(emailAddress ? { emailAddress } : {}),
    ...(displayName ? { displayName } : {})
  };
}

// Lo que necesita el AttachmentService de integration-service: nombre,
// tamano y `content` (la URL de descarga). Un adjunto sin nombre, sin URL
// http(s) valida, o por encima del tope defensivo, no se envia.
function buildAttachments(value: unknown): IssueAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const built = value.flatMap((item) => {
    const record = asRecord(item);
    const filename = normalizeText(record?.filename, SHORT_TEXT_MAX);
    const content = normalizeText(record?.content, URL_MAX);
    if (!filename || !isHttpUrl(content)) {
      return [];
    }
    const id = normalizeText(record?.id, ID_MAX);
    const mimeType = normalizeText(record?.mimeType, SHORT_TEXT_MAX);
    const size = record?.size;
    return [
      {
        ...(id ? { id } : {}),
        filename,
        ...(mimeType ? { mimeType } : {}),
        ...(typeof size === 'number' && Number.isFinite(size) && size >= 0 ? { size } : {}),
        content
      }
    ];
  });

  return built.slice(0, MAX_ATTACHMENTS);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
