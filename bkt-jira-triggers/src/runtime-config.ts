// Lee de donde y con que credencial hay que enviar los tickets, sin que
// nada de eso este escrito en el codigo. Si falta algo, lo dice de forma
// clara en vez de fallar a medias mas adelante.
import type {
  IntegrationRuntimeConfig,
  IntegrationRuntimeConfigIssue,
  LoadIntegrationRuntimeConfigResult
} from './types';

// Estos dos son la unica forma de decirle a la app a donde enviar y con que
// credencial. Nunca van escritos en el codigo ni en el manifiesto: se ponen
// con `forge variables set` y viven cifrados en Forge.
const DEFAULT_API_KEY_HEADER = 'X-API-KEY';
const DEFAULT_TIMEOUT_MS = 10_000;
const PLACEHOLDER_API_KEY = '<set-in-forge-as-encrypted-variable>';
const HTTP_HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

// Lee la configuracion de envio desde variables de entorno. Si falta algo
// obligatorio, no lanza una excepcion: devuelve un resultado que dice que
// falta y que, asi el que llama puede fallar "en limpio" (fail closed) sin
// llegar a intentar ninguna peticion de red.
//
// `env` es inyectable (por defecto `process.env`) para poder probar esta
// funcion con valores de mentira en los tests, sin tocar variables reales.
export function loadIntegrationRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): LoadIntegrationRuntimeConfigResult {
  const missingKeys: string[] = [];

  const baseUrl = env.INTEGRATION_SERVICE_BASE_URL?.trim();
  if (!baseUrl) {
    missingKeys.push('INTEGRATION_SERVICE_BASE_URL');
  }

  const apiKey = env.INTEGRATION_SERVICE_API_KEY?.trim();
  if (!apiKey) {
    missingKeys.push('INTEGRATION_SERVICE_API_KEY');
  }

  // Si falta la URL o la clave (o las dos), se para aqui. Este es el estado
  // "en reposo" del proyecto: sin estas dos variables, nunca se llega a
  // hacer ninguna peticion HTTP de verdad.
  if (missingKeys.length > 0) {
    return {
      ok: false,
      missingKeys,
      errorCode: 'MISSING_RUNTIME_CONFIG'
    };
  }

  const baseUrlIssue = validateBaseUrl(baseUrl as string);
  if (baseUrlIssue) {
    return {
      ok: false,
      missingKeys: [],
      errorCode: 'INVALID_INTEGRATION_SERVICE_BASE_URL',
      configIssue: baseUrlIssue
    };
  }

  if (apiKey === PLACEHOLDER_API_KEY) {
    return {
      ok: false,
      missingKeys: [],
      errorCode: 'PLACEHOLDER_API_KEY',
      configIssue: 'placeholder_api_key'
    };
  }

  const apiKeyHeader = env.INTEGRATION_SERVICE_API_KEY_HEADER?.trim() || DEFAULT_API_KEY_HEADER;
  if (!HTTP_HEADER_NAME_PATTERN.test(apiKeyHeader)) {
    return {
      ok: false,
      missingKeys: [],
      errorCode: 'INVALID_API_KEY_HEADER',
      configIssue: 'invalid_header_name'
    };
  }

  const config: IntegrationRuntimeConfig = {
    baseUrl: baseUrl as string,
    apiKey: apiKey as string,
    apiKeyHeader,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };

  return {
    ok: true,
    config
  };
}

function validateBaseUrl(baseUrl: string): IntegrationRuntimeConfigIssue | null {
  if ((baseUrl.match(/:\/\//g) ?? []).length > 1) {
    return 'duplicated_scheme';
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return 'not_a_url';
  }

  if (parsed.protocol !== 'https:') {
    return 'not_https';
  }

  if (parsed.username || parsed.password) {
    return 'contains_credentials';
  }

  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    return 'contains_endpoint_path';
  }

  return null;
}
