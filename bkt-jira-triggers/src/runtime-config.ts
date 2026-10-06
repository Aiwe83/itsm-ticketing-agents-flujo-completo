// Lee de donde y con que credencial hay que enviar los tickets, sin que
// nada de eso este escrito en el codigo. Si falta algo, lo dice de forma
// clara en vez de fallar a medias mas adelante.
import type {
  IntegrationRuntimeConfig,
  LoadIntegrationRuntimeConfigResult
} from './types';

// Estos dos son la unica forma de decirle a la app a donde enviar y con que
// credencial. Nunca van escritos en el codigo ni en el manifiesto: se ponen
// con `forge variables set` y viven cifrados en Forge.
const DEFAULT_API_KEY_HEADER = 'X-API-KEY';
const DEFAULT_TIMEOUT_MS = 10_000;

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

  try {
    // Comprueba que la URL configurada sea una URL absoluta valida
    // (http:// o https://), no un texto suelto por error.
    new URL(baseUrl as string);
  } catch {
    return {
      ok: false,
      missingKeys: [],
      errorCode: 'INVALID_INTEGRATION_SERVICE_BASE_URL'
    };
  }

  const config: IntegrationRuntimeConfig = {
    baseUrl: baseUrl as string,
    apiKey: apiKey as string,
    apiKeyHeader: env.INTEGRATION_SERVICE_API_KEY_HEADER?.trim() || DEFAULT_API_KEY_HEADER,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };

  return {
    ok: true,
    config
  };
}
