import { config } from 'dotenv'
import { z } from 'zod'

config()

const blankToUndefined = (value: unknown) => (value === '' ? undefined : value)

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'local']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  API_VERSION: z.string().default('v1'),

  MONGODB_USERNAME: z.string(),
  MONGODB_PASSWORD: z.string(),
  MONGODB_HOST: z.string(),
  MONGODB_DATABASE: z.string(),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().positive().default(10),
  MONGODB_MIN_POOL_SIZE: z.coerce.number().int().min(0).default(5),

  API_KEY_HEADER: z.string().default('X-API-KEY'),
  // No .default(): fail-closed on purpose, see src/middlewares/auth.middleware.ts.
  API_KEY: z.string().min(1, 'API_KEY is required'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY_PRINT: z.preprocess(blankToUndefined, z.stringbool().default(false)),

  CORS_ORIGIN: z.string().default('*'),
  CORS_CREDENTIALS: z.preprocess(blankToUndefined, z.stringbool().default(true)),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

  APP_NAME: z.string().default('INTEGRATION-SERVICE'),
  APP_DESCRIPTION: z.string().default('Integration service for ITSM Torre de Control'),

  HEALTH_CHECK_PATH: z.string().default('/health'),

  ORCHESTRATOR_BASE_URL: z.url(),
  ORCHESTRATOR_ENDPOINT: z.string(),
  ORCHESTRATOR_ROLE: z.string().default('agentic-orchestrator-application'),

  ATTACHMENT_BYTES_LIMIT: z
    .preprocess(blankToUndefined, z.coerce.number().int().positive())
    .default(4194304),
  JIRA_BASE_URL: z.preprocess(blankToUndefined, z.url().optional()),
  JIRA_USER: z.preprocess(blankToUndefined, z.string().optional()),
  JIRA_PASSWORD: z.preprocess(blankToUndefined, z.string().optional()),

  MESH_ID: z.string().trim().min(1, 'MESH_ID is required'),
  ORIGINAL_TICKET_COLLECTION_NAME: z.string(),
  PROCESSED_TICKET_COLLECTION_NAME: z.string(),
  EXECUTIONS_COLLECTION_NAME: z.string(),
  MAPPINGS_COLLECTION_NAME: z.string(),
})

type EnvConfig = z.infer<typeof envSchema>

const parseEnv = (): EnvConfig => {
  try {
    return envSchema.parse(process.env)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Environment validation failed:
        ${z.prettifyError(error)}
        `
      )
    }
    throw error
  }
}

class Environment {
  private static instance: (Environment & Readonly<EnvConfig>) | null = null
  private readonly config: EnvConfig

  private constructor() {
    this.config = parseEnv()
  }

  public static getInstance(): Environment & Readonly<EnvConfig> {
    if (!Environment.instance) {
      const baseInstance = new Environment()

      Environment.instance = new Proxy(baseInstance, {
        get(target: Environment, prop: string | symbol, receiver: any) {
          if (prop in target || typeof prop === 'symbol') {
            return Reflect.get(target, prop, receiver)
          }

          if (typeof prop === 'string' && prop in target.config) {
            return target.config[prop as keyof EnvConfig]
          }

          return Reflect.get(target, prop, receiver)
        },
      }) as Environment & Readonly<EnvConfig>
    }
    return Environment.instance
  }

  public get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    return this.config[key]
  }

  get IS_DEVELOPMENT(): boolean {
    return this.config.NODE_ENV === 'development'
  }

  get IS_PRODUCTION(): boolean {
    return this.config.NODE_ENV === 'production'
  }

  get IS_LOCAL(): boolean {
    return this.config.NODE_ENV === 'local'
  }
}

export const env = Environment.getInstance()
