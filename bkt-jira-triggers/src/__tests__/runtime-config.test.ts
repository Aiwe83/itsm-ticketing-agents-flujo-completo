import { loadIntegrationRuntimeConfig } from '../runtime-config';

describe('loadIntegrationRuntimeConfig', () => {
  it('loads the integration-service URL, API key and default header', () => {
    expect(
      loadIntegrationRuntimeConfig({
        INTEGRATION_SERVICE_BASE_URL: 'https://integration.example.test',
        INTEGRATION_SERVICE_API_KEY: 'SECRET_API_KEY_123'
      })
    ).toEqual({
      ok: true,
      config: {
        baseUrl: 'https://integration.example.test',
        apiKey: 'SECRET_API_KEY_123',
        apiKeyHeader: 'X-API-KEY',
        timeoutMs: 10_000
      }
    });
  });

  it('honours a custom API key header', () => {
    expect(
      loadIntegrationRuntimeConfig({
        INTEGRATION_SERVICE_BASE_URL: 'https://integration.example.test',
        INTEGRATION_SERVICE_API_KEY: 'SECRET_API_KEY_123',
        INTEGRATION_SERVICE_API_KEY_HEADER: 'X-Custom-Key'
      })
    ).toMatchObject({
      ok: true,
      config: { apiKeyHeader: 'X-Custom-Key' }
    });
  });

  it('fails closed when required variables are missing', () => {
    expect(loadIntegrationRuntimeConfig({})).toEqual({
      ok: false,
      missingKeys: ['INTEGRATION_SERVICE_BASE_URL', 'INTEGRATION_SERVICE_API_KEY'],
      errorCode: 'MISSING_RUNTIME_CONFIG'
    });

    expect(
      loadIntegrationRuntimeConfig({
        INTEGRATION_SERVICE_BASE_URL: 'https://integration.example.test'
      })
    ).toEqual({
      ok: false,
      missingKeys: ['INTEGRATION_SERVICE_API_KEY'],
      errorCode: 'MISSING_RUNTIME_CONFIG'
    });
  });

  it.each([
    ['not-a-url', 'not_a_url'],
    ['https://https://x.ngrok-free.dev', 'duplicated_scheme'],
    ['http://x.ngrok-free.dev', 'not_https'],
    ['ftp://x.dev', 'not_https'],
    ['https://x.dev/api/v1/issues', 'contains_endpoint_path'],
    ['https://x.dev?debug=true', 'contains_endpoint_path'],
    ['https://user:pass@x.dev', 'contains_credentials']
  ])('rejects unsafe integration-service base URL %s', (baseUrl, configIssue) => {
    expect(
      loadIntegrationRuntimeConfig({
        INTEGRATION_SERVICE_BASE_URL: baseUrl,
        INTEGRATION_SERVICE_API_KEY: 'SECRET_API_KEY_123'
      })
    ).toEqual({
      ok: false,
      missingKeys: [],
      errorCode: 'INVALID_INTEGRATION_SERVICE_BASE_URL',
      configIssue
    });
  });

  it('rejects placeholder API keys', () => {
    expect(
      loadIntegrationRuntimeConfig({
        INTEGRATION_SERVICE_BASE_URL: 'https://integration.example.test',
        INTEGRATION_SERVICE_API_KEY: '<set-in-forge-as-encrypted-variable>'
      })
    ).toEqual({
      ok: false,
      missingKeys: [],
      errorCode: 'PLACEHOLDER_API_KEY',
      configIssue: 'placeholder_api_key'
    });
  });

  it.each(['X API KEY', 'X-API-KEY:', 'X/API/KEY'])(
    'rejects invalid API key header name %s',
    (apiKeyHeader) => {
      expect(
        loadIntegrationRuntimeConfig({
          INTEGRATION_SERVICE_BASE_URL: 'https://integration.example.test',
          INTEGRATION_SERVICE_API_KEY: 'SECRET_API_KEY_123',
          INTEGRATION_SERVICE_API_KEY_HEADER: apiKeyHeader
        })
      ).toEqual({
        ok: false,
        missingKeys: [],
        errorCode: 'INVALID_API_KEY_HEADER',
        configIssue: 'invalid_header_name'
      });
    }
  );
});
