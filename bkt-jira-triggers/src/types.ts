// Tipos compartidos por todo el proyecto: la forma del evento que manda
// Jira, la del mensaje saneado, la del mensaje que se envia, y la del
// resultado del envio. Nada de logica aqui, solo formas de datos.

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

// --- Lo que Jira manda (evento crudo) ---------------------------------

export interface JiraIssueFields {
  summary?: string;
  description?: JsonValue;
  project?: {
    key?: string;
  };
  issuetype?: {
    name?: string;
  };
  status?: {
    name?: string;
  };
  priority?: {
    name?: string;
  };
  created?: string;
  updated?: string;
  resolutiondate?: string | null;
  [key: string]: unknown;
}

export interface JiraIssue {
  id?: string;
  key?: string;
  self?: string;
  fields?: JiraIssueFields;
  [key: string]: unknown;
}

export interface JiraChangelogItem {
  field?: string;
  fieldId?: string;
  fieldtype?: string;
  from?: string | null;
  to?: string | null;
  [key: string]: unknown;
}

export interface JiraIssueEvent {
  eventType?: string;
  selfGenerated?: boolean;
  jiraEventTypeName?: string;
  issue?: JiraIssue;
  atlassianId?: string;
  associatedUsers?: unknown[];
  changelog?: {
    items?: JiraChangelogItem[];
    [key: string]: unknown;
  };
  associatedStatuses?: unknown[];
  clonedFrom?: unknown;
  [key: string]: unknown;
}

export interface ForgeContext {
  [key: string]: unknown;
}

// Firma minima de `fetch`: permite sustituirlo en los tests por una funcion
// de mentira, sin depender del `fetch` real de Forge.
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

// --- Lo que sobrevive al saneado ---------------------------------------

export interface SanitizedEvent {
  eventType: string | null;
  selfGenerated: boolean | null;
  jiraEventTypeName: string | null;
  issueId: string | null;
  issueKey: string | null;
  projectKey: string | null;
  issueTypeName: string | null;
  statusName: string | null;
  priorityName: string | null;
  created: string | null;
  updated: string | null;
  resolutiondate: string | null;
  summaryLength: number | null;
  summarySha256Prefix: string | null;
  descriptionPresent: boolean;
  actorPresent: boolean;
  actorSha256Prefix: string | null;
  associatedUsersCount: number;
  customFieldCount: number;
  changedFieldNames: string[];
  changelogItems: Array<Pick<JiraChangelogItem, 'field' | 'fieldId' | 'fieldtype'>>;
}

// --- El mensaje que se enviaria a integration-service -------------------

// Metadatos de un adjunto ya normalizado: solo sobrevive si tiene `filename`
// y una `content` (URL de descarga) validas — sin eso, integration-service
// no puede hacer nada con el. Nunca los bytes del fichero.
export interface IssueAttachment {
  id?: string;
  filename: string;
  mimeType?: string;
  size?: number;
  content: string;
}

// `issues` es una tupla de un solo elemento, no un array cualquiera: obliga
// a nivel de tipos a que siempre haya exactamente una incidencia, igual que
// exige integration-service.
export interface IssuesRequest {
  initiatedBy?: string;
  issues: [
    {
      id?: string;
      key: string;
      fields: {
        summary: string;
        issuetype?: {
          name?: string;
        };
        status?: {
          name?: string;
        };
        project?: {
          key?: string;
        };
        priority?: {
          name?: string;
        };
        created?: string;
        updated?: string;
        // Texto plano: el ADF de Jira se aplana en contract.ts, porque el
        // modelo de datos espera `description` como string.
        description?: string;
        components?: Array<{ id?: string; name: string }>;
        assignee?: {
          accountId?: string;
          emailAddress?: string;
          displayName?: string;
        };
        // Metadatos de cada adjunto. `content` es la URL de descarga;
        // integration-service descarga el fichero con sus credenciales.
        attachment?: IssueAttachment[];
      };
    }
  ];
}

// --- Lectura del ticket completo por REST --------------------------------

export type JiraIssueReadResult =
  | { ok: true; status: number; issue: JiraIssue }
  | { ok: false; status: number | null; errorCode: string };

export type BuildIssuesRequestFailureReason =
  | 'MISSING_FIELDS'
  | 'MISSING_KEY'
  | 'MISSING_SUMMARY';

// Union discriminada por `ok`: cuando es `true`, TypeScript sabe que hay un
// `request`; cuando es `false`, sabe que hay un `reason`. Nunca los dos a
// la vez, ni ninguno de los dos.
export type BuildIssuesRequestResult =
  | {
      ok: true;
      request: IssuesRequest;
    }
  | {
      ok: false;
      reason: BuildIssuesRequestFailureReason;
    };

// --- Configuracion de envio, leida de variables de entorno --------------

export interface IntegrationRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  apiKeyHeader: string;
  timeoutMs: number;
}

export interface MissingIntegrationRuntimeConfig {
  ok: false;
  missingKeys: string[];
  errorCode: 'MISSING_RUNTIME_CONFIG' | 'INVALID_INTEGRATION_SERVICE_BASE_URL';
}

export interface LoadedIntegrationRuntimeConfig {
  ok: true;
  config: IntegrationRuntimeConfig;
}

export type LoadIntegrationRuntimeConfigResult =
  | LoadedIntegrationRuntimeConfig
  | MissingIntegrationRuntimeConfig;

// --- Resultado del envio --------------------------------------------------

// Las seis formas en las que puede acabar un intento de envio. Ver
// integration-client.ts para donde se produce cada una.
export type IntegrationDispatchErrorKind =
  | 'CONFIG'        // faltaba configuracion, ni se intento
  | 'TIMEOUT'       // se agoto el tiempo de espera
  | 'NETWORK'       // no se pudo conectar
  | 'HTTP'          // respondio con un codigo de error
  | 'APPLICATION'   // respondio bien, pero dijo que el ticket fallo
  | 'PARSE';        // respondio algo que no encaja con lo esperado

interface IntegrationDispatchBase {
  sent: boolean;
  success: boolean;
  status: number | null;
  requestIdEcho: string | null;
  executionId: string | null;
  storedTicketId: string | null;
  ticketsSucceeded: number | null;
  ticketsFailed: number | null;
  orchestratorDispatched: boolean | null;
}

export interface IntegrationDispatchSuccess extends IntegrationDispatchBase {
  sent: true;
  success: true;
  status: number;
}

// Pistas para saber quien devolvio un error HTTP (egress de Forge, borde del
// tunel o el servicio). Nunca la ruta, la clave ni datos del ticket.
export interface HttpDiagnostic {
  host: string;
  server: string | null;
  cfRay: string | null;
  ngrokErrorCode: string | null;
  bodyHint: string | null;
}

export interface IntegrationDispatchFailure extends IntegrationDispatchBase {
  success: false;
  errorKind: IntegrationDispatchErrorKind;
  errorCode: string;
  missingConfigKeys?: string[];
  diagnostic?: HttpDiagnostic;
}

export type IntegrationDispatchResult = IntegrationDispatchSuccess | IntegrationDispatchFailure;
