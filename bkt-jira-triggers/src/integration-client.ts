import { z } from 'zod';
import { fetch as forgeFetch } from '@forge/api';
import { loadIntegrationRuntimeConfig } from './runtime-config';
import type { FetchLike, HttpDiagnostic, IntegrationDispatchResult, IssuesRequest } from './types';

// El cliente HTTP que de verdad habla con integration-service. Todo lo que
// puede pasar al enviar un mensaje (falta configuracion, no hay red, tarda
// demasiado, responde con un error, responde bien pero dice que el ticket
// fallo...) se convierte aqui en un resultado clasificado. El handler nunca
// tiene que hacer un try/catch: solo lee el resultado que esta funcion
// devuelve.

// Solo se listan los campos de la respuesta que de verdad se usan.
// `.passthrough()` en cada nivel dice "puede venir mas cosas, no pasa nada":
// asi un cambio en integration-service que anada un campo nuevo no rompe
// esta validacion.
const RESPONSE_SCHEMA = z
  .object({
    success: z.boolean().optional(),
    message: z.string().optional(),
    data: z
      .object({
        executionId: z.string().optional(),
        summary: z
          .object({
            ticketsSucceeded: z.number().optional(),
            ticketsFailed: z.number().optional(),
            successIntegration: z.boolean().optional(),
            orchestratorDispatched: z.boolean().optional()
          })
          .passthrough()
          .optional(),
        tickets: z
          .array(
            z
              .object({
                success: z.boolean().optional(),
                storedTicketId: z.string().optional()
              })
              .passthrough()
          )
          .optional()
      })
      .passthrough()
      .optional(),
    error: z
      .object({
        message: z.string().optional(),
        code: z.string().optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

// `env` y `fetchImpl` son inyectables para poder probar esta funcion en los
// tests sin depender de variables de entorno reales ni de una peticion de
// red real.
interface SendOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

// Envia un mensaje ya validado a integration-service y devuelve un
// resultado clasificado. Nunca lanza una excepcion: todo fallo (falta
// configuracion, no hay red, tarda demasiado, responde mal, responde bien
// pero dice que fallo) se convierte en un valor de retorno que el handler
// puede leer sin necesitar un try/catch.
export async function sendIssueToIntegrationService(
  payload: IssuesRequest,
  correlationId: string,
  options: SendOptions = {}
): Promise<IntegrationDispatchResult> {
  const configResult = loadIntegrationRuntimeConfig(options.env);
  // Sin URL o sin clave configuradas, se para aqui mismo: ni siquiera se
  // intenta la peticion de red ("fail closed"). Es el estado en reposo del
  // proyecto.
  if (!configResult.ok) {
    return {
      sent: false,
      success: false,
      status: null,
      requestIdEcho: null,
      executionId: null,
      storedTicketId: null,
      ticketsSucceeded: null,
      ticketsFailed: null,
      orchestratorDispatched: null,
      errorKind: 'CONFIG',
      errorCode: configResult.errorCode,
      missingConfigKeys: configResult.missingKeys,
      configIssue: configResult.configIssue
    };
  }

  const fetchImpl = options.fetchImpl ?? forgeFetch;
  const controller = new AbortController();
  // Si la respuesta tarda mas de lo permitido, se aborta la peticion en vez
  // de dejar la invocacion colgada para siempre.
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? configResult.config.timeoutMs
  );

  try {
    const response = await fetchImpl(buildIssuesEndpoint(configResult.config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'X-Request-Id': correlationId,
        [configResult.config.apiKeyHeader]: configResult.config.apiKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const requestIdEcho = response.headers.get('x-request-id');
    const rawBody = await response.text();
    const parsedBody = parseJsonBody(rawBody);

    // La peticion llego, pero el servidor respondio con un codigo de error
    // (por ejemplo 401 o 500). Esto es distinto de "no se pudo conectar":
    // aqui si hubo respuesta, solo que fue mala.
    if (!response.ok) {
      const metadata = extractResponseMetadata(parsedBody);
      return {
        sent: true,
        success: false,
        status: response.status,
        requestIdEcho,
        executionId: metadata.executionId,
        storedTicketId: metadata.storedTicketId,
        ticketsSucceeded: metadata.ticketsSucceeded,
        ticketsFailed: metadata.ticketsFailed,
        orchestratorDispatched: metadata.orchestratorDispatched,
        errorKind: 'HTTP',
        errorCode: `HTTP_${response.status}`,
        diagnostic: buildHttpDiagnostic(configResult.config.baseUrl, response, rawBody, parsedBody)
      };
    }

    // Respondio con un codigo de exito (2xx), pero el cuerpo no tiene la
    // forma esperada. Puede pasar si el servicio cambia su contrato sin
    // avisar.
    const parsed = RESPONSE_SCHEMA.safeParse(parsedBody);
    if (!parsed.success) {
      return {
        sent: true,
        success: false,
        status: response.status,
        requestIdEcho,
        executionId: null,
        storedTicketId: null,
        ticketsSucceeded: null,
        ticketsFailed: null,
        orchestratorDispatched: null,
        errorKind: 'PARSE',
        errorCode: 'INVALID_RESPONSE_SHAPE'
      };
    }

    const metadata = extractResponseMetadata(parsed.data);
    // Aqui esta la regla mas importante de todo el fichero: un 201 por si
    // solo no cuenta como exito. Solo se considera exito cuando el propio
    // cuerpo de la respuesta confirma, ademas, que el ticket se proceso
    // bien.
    if (
      parsed.data.data?.summary?.successIntegration === true &&
      parsed.data.data?.tickets?.[0]?.success === true
    ) {
      return {
        sent: true,
        success: true,
        status: response.status,
        requestIdEcho,
        executionId: metadata.executionId,
        storedTicketId: metadata.storedTicketId,
        ticketsSucceeded: metadata.ticketsSucceeded,
        ticketsFailed: metadata.ticketsFailed,
        orchestratorDispatched: metadata.orchestratorDispatched
      };
    }

    // Respondio 201 y el cuerpo tiene la forma correcta, pero dice
    // explicitamente que el ticket no se proceso. Es un fallo del lado de
    // integration-service, no de esta app.
    return {
      sent: true,
      success: false,
      status: response.status,
      requestIdEcho,
      executionId: metadata.executionId,
      storedTicketId: metadata.storedTicketId,
      ticketsSucceeded: metadata.ticketsSucceeded,
      ticketsFailed: metadata.ticketsFailed,
      orchestratorDispatched: metadata.orchestratorDispatched,
      errorKind: 'APPLICATION',
      errorCode: 'INTEGRATION_REPORTED_FAILURE'
    };
  } catch (error) {
    // No hubo respuesta en absoluto: o se agoto el tiempo de espera (aborto
    // provocado arriba), o fallo la conexion misma.
    return {
      sent: true,
      success: false,
      status: null,
      requestIdEcho: null,
      executionId: null,
      storedTicketId: null,
      ticketsSucceeded: null,
      ticketsFailed: null,
      orchestratorDispatched: null,
      errorKind: isAbortError(error) ? 'TIMEOUT' : 'NETWORK',
      errorCode: isAbortError(error) ? 'REQUEST_TIMEOUT' : 'FETCH_FAILED'
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Construye la URL final juntando la base configurada con la ruta fija del
// endpoint. Se asegura de que haya exactamente una barra entre las dos
// partes, para no acabar con "//" ni con las dos partes pegadas.
function buildIssuesEndpoint(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL('api/v1/issues', normalizedBaseUrl).toString();
}

// Pistas para distinguir quien devolvio un error HTTP (el egress de Forge, el
// borde del tunel o el propio servicio) sin exponer datos del ticket: solo el
// host (nunca la ruta ni la clave), cabeceras de infraestructura y un trozo
// corto del cuerpo. El cuerpo se omite si tiene la forma del eco del servicio
// (`data`/`issues`), que puede llevar el titulo del ticket.
const BODY_HINT_MAX = 200;

function buildHttpDiagnostic(
  baseUrl: string,
  response: Response,
  rawBody: string,
  parsedBody: unknown
): HttpDiagnostic {
  const echoesTicket =
    !!parsedBody &&
    typeof parsedBody === 'object' &&
    ('data' in parsedBody || 'issues' in parsedBody);
  // eslint-disable-next-line no-control-regex
  const bodyHint = rawBody.replace(/[\x00-\x1F\x7F]/g, ' ').trim().slice(0, BODY_HINT_MAX);

  return {
    host: new URL(baseUrl).host,
    server: response.headers.get('server'),
    cfRay: response.headers.get('cf-ray'),
    ngrokErrorCode: response.headers.get('ngrok-error-code'),
    bodyHint: echoesTicket || !bodyHint ? null : bodyHint
  };
}

// Interpreta el cuerpo (ya leido como texto) como JSON. Si viene vacio o no
// es JSON valido, no lanza un error: devuelve `null` y deja que quien llama
// decida que hacer (normalmente, clasificarlo como PARSE).
function parseJsonBody(raw: string): unknown {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Saca de la respuesta solo los cinco campos que hacen falta para la
// traza y la evidencia. Nunca devuelve el cuerpo completo: integration-
// service hace eco del ticket entero en su respuesta (titulo incluido), y
// esta funcion es la barrera que evita que ese eco acabe en un log.
function extractResponseMetadata(body: unknown): {
  executionId: string | null;
  storedTicketId: string | null;
  ticketsSucceeded: number | null;
  ticketsFailed: number | null;
  orchestratorDispatched: boolean | null;
} {
  const parsed = RESPONSE_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return {
      executionId: null,
      storedTicketId: null,
      ticketsSucceeded: null,
      ticketsFailed: null,
      orchestratorDispatched: null
    };
  }

  return {
    executionId: parsed.data.data?.executionId ?? null,
    storedTicketId: parsed.data.data?.tickets?.[0]?.storedTicketId ?? null,
    ticketsSucceeded: parsed.data.data?.summary?.ticketsSucceeded ?? null,
    ticketsFailed: parsed.data.data?.summary?.ticketsFailed ?? null,
    orchestratorDispatched: parsed.data.data?.summary?.orchestratorDispatched ?? null
  };
}

// `fetch` distingue un aborto voluntario (timeout) de cualquier otro fallo
// de red lanzando un error con `name === "AbortError"`. Esta funcion solo
// traduce eso a una pregunta de si/no.
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
