const REQUIRED_ENV: Record<string, string> = {
  NODE_ENV: 'local',
  MONGODB_USERNAME: 'test',
  MONGODB_PASSWORD: 'test',
  MONGODB_HOST: '127.0.0.1',
  MONGODB_DATABASE: 'integration-service-test',
  API_KEY: 'test-api-key',
  ORCHESTRATOR_BASE_URL: 'http://127.0.0.1:9999',
  ORCHESTRATOR_ENDPOINT: 'orchestrator',
  MESH_ID: '6a323e68-6f87-403a-a87d-72da69fcde0d',
  ORIGINAL_TICKET_COLLECTION_NAME: 'itsm_tickets_test',
  PROCESSED_TICKET_COLLECTION_NAME: 'tickets_test',
  EXECUTIONS_COLLECTION_NAME: 'executions_test',
  MAPPINGS_COLLECTION_NAME: 'mappings_test',
}

const setRequiredEnv = (): void => {
  for (const [key, value] of Object.entries(REQUIRED_ENV)) {
    process.env[key] = value
  }
}

const loadEnv = () => {
  jest.resetModules()
  setRequiredEnv()
  // Environment is loaded through require so each test can reset the module singleton.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../config/environment') as typeof import('../config/environment')
}

describe('environment', () => {
  it('applies defaults when LOG_PRETTY_PRINT and CORS_CREDENTIALS are empty', () => {
    process.env.LOG_PRETTY_PRINT = ''
    process.env.CORS_CREDENTIALS = ''

    const { env } = loadEnv()

    expect(typeof env.LOG_PRETTY_PRINT).toBe('boolean')
    expect(typeof env.CORS_CREDENTIALS).toBe('boolean')
    expect(env.LOG_PRETTY_PRINT).toBe(false)
    expect(env.CORS_CREDENTIALS).toBe(true)
  })

  it('parses LOG_PRETTY_PRINT=false as false without coercion', () => {
    process.env.LOG_PRETTY_PRINT = 'false'
    process.env.CORS_CREDENTIALS = 'false'

    const { env } = loadEnv()

    expect(env.LOG_PRETTY_PRINT).toBe(false)
    expect(env.CORS_CREDENTIALS).toBe(false)
  })

  it('parses LOG_PRETTY_PRINT=true as true', () => {
    process.env.LOG_PRETTY_PRINT = 'true'
    process.env.CORS_CREDENTIALS = 'true'

    const { env } = loadEnv()

    expect(env.LOG_PRETTY_PRINT).toBe(true)
    expect(env.CORS_CREDENTIALS).toBe(true)
  })
})
