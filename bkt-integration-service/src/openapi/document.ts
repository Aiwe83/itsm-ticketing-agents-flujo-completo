import { z } from 'zod'
import type { OpenAPIObject, SchemaObject } from 'openapi3-ts/oas30'
import {
  apiRootExample,
  healthDegradedExample,
  healthOkExample,
  issueAcceptedFullSuccessExample,
  issueAcceptedPartialFailureExample,
  jiraIssuePayloadExample,
  rateLimitErrorExample,
  validationErrorMultipleIssuesExample,
  validationErrorSingleIssueExample,
} from './examples'
import { registry } from './schemas'

// Constants mirrored from src/config/environment.ts DEFAULTS ONLY.
// Deliberately NOT importing `env` from that module: `env` is a singleton that
// eagerly calls parseEnv() on import and throws if required vars (MONGODB_*,
// ORCHESTRATOR_*) are missing - a docs generator must run standalone (CI,
// no .env) without needing real secrets. src/__tests__/openapi.test.ts is the
// guardrail that keeps these constants in sync with the real defaults, since
// that test DOES load `.env.test` and can safely import `env`.
export const HEALTH_CHECK_PATH_DEFAULT = '/health'
export const API_VERSION_DEFAULT = 'v1'
export const APP_DESCRIPTION_DEFAULT = 'Integration service for ITSM Torre de Control'
export const API_KEY_HEADER_DEFAULT = 'X-API-KEY'

const jsonSchemas = z.toJSONSchema(registry, {
  target: 'openapi-3.0',
  io: 'input',
  uri: id => `#/components/schemas/${id}`,
})

// z.toJSONSchema injects $id/$schema per schema - not valid inside an OpenAPI
// components.schemas map, so strip them before embedding.
const rawComponentSchemas: Record<string, SchemaObject> = {}
for (const [id, schema] of Object.entries(jsonSchemas.schemas)) {
  const { $id, $schema, ...rest } = schema as SchemaObject & { $id?: string; $schema?: string }
  void $id
  void $schema
  rawComponentSchemas[id] = rest as SchemaObject
}

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` })

const isEmptySchema = (value: unknown): value is Record<string, never> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === 0

// z.toJSONSchema (target 'openapi-3.0') wraps `.optional()` around a
// registered/$ref-able schema in a single-element `allOf`, because OAS 3.0
// forbids sibling keywords next to `$ref`. Optionality already lives in
// `required`, so a 1-element `allOf` with no sibling keys is always safe to
// collapse to the `$ref` it contains.
const collapseSingletonAllOf = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(collapseSingletonAllOf)
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    const keys = Object.keys(obj)
    const allOf = obj['allOf']
    if (keys.length === 1 && keys[0] === 'allOf' && Array.isArray(allOf) && allOf.length === 1) {
      return collapseSingletonAllOf(allOf[0])
    }
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, collapseSingletonAllOf(value)])
    )
  }
  return node
}

// `.passthrough()` (open Zod objects) produces an unconstrained empty JSON
// Schema (`{}`) for `additionalProperties`. Doc-only: replaces THAT specific
// empty schema with a $ref to a typed JsonValue union so 42Crunch stops
// flagging "no type defined" - the real contract stays exactly as open as
// before, since JsonValue still matches any JSON value up to a bounded depth.
//
// Deliberately scoped to the `additionalProperties` key only - NOT a blanket
// replacement of every empty `{}` schema. `ErrorResponse.error.details`
// (`z.unknown()`) is also an empty schema, but its real shape is genuinely
// polymorphic (single ValidationError vs AggregateValidationError.errors[],
// see src/errors/validation.ts) and nests deeper than JsonValue's bounded
// depth allows - the previous hardening round already decided NOT to model
// it precisely (~12 variants for marginal score value) and left it open.
// Rewriting it here silently would make the documented examples stop
// validating against their own schema - worse than the finding it "fixes".
const typeEmptySchemas = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(typeEmptySchemas)
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([key, value]) => [
        key,
        key === 'additionalProperties' && isEmptySchema(value)
          ? ref('JsonValue')
          : typeEmptySchemas(value),
      ])
    )
  }
  return node
}

// Deliberately NOT self-referential: a `JsonValue` that referenced itself in
// `array.items`/`object.additionalProperties` (the obvious recursive design)
// triggers 42Crunch's "Circular reference is not allowed" (Critical) and
// zeroes the whole report, worse than the "no type defined" finding it was
// meant to fix. `JsonPrimitive` is a terminal leaf with no outgoing $ref, so
// `JsonValue` is a finite, 2-level structure (scalar | array-of-scalar |
// object-of-scalar) - which covers every real extra Jira field seen so far
// (e.g. `components: "..."`, `priority: { name: "..." }`).
const jsonPrimitiveSchema: SchemaObject = {
  description: 'Scalar JSON leaf value (string, number, boolean, or null).',
  anyOf: [
    { type: 'string', maxLength: 50_000, nullable: true },
    { type: 'number' },
    { type: 'boolean' },
  ],
} as SchemaObject

const jsonValueSchema: SchemaObject = {
  description:
    'Any JSON value up to one level of nesting (scalar, or array/object of scalars). ' +
    'Extra Jira/mapping-driven keys are accepted as-is.',
  anyOf: [
    ref('JsonPrimitive'),
    { type: 'array', maxItems: 1000, items: ref('JsonPrimitive') },
    { type: 'object', maxProperties: 500, additionalProperties: ref('JsonPrimitive') },
  ],
} as SchemaObject

const componentSchemas: Record<string, SchemaObject> = {
  ...(typeEmptySchemas(collapseSingletonAllOf(rawComponentSchemas)) as Record<
    string,
    SchemaObject
  >),
  JsonPrimitive: jsonPrimitiveSchema,
  JsonValue: jsonValueSchema,
}

// Real, confirmed global handlers (src/app.ts) - not speculative, they apply
// to every route: notFoundHandler is mounted after all routes, exceptionHandler
// is the last middleware and catches anything unhandled (incl. plain 500s).
const notFoundResponse = {
  description: 'No matching route (see notFoundHandler in src/middlewares/error.middleware.ts).',
  content: { 'application/json': { schema: ref('ErrorResponse') } },
}

const defaultErrorResponse = {
  description:
    'Unexpected error, caught by the global exceptionHandler in src/middlewares/error.middleware.ts.',
  content: { 'application/json': { schema: ref('ErrorResponse') } },
}

// Real, confirmed handler: src/middlewares/auth.middleware.ts rejects with
// AppError.unauthorized(), rendered by the same exceptionHandler as every
// other error - same ErrorResponse shape, no distinct body for this case.
const unauthorizedResponse = {
  description:
    'Missing or invalid API key (see src/middlewares/auth.middleware.ts). The message is the ' +
    'same whether the header was absent or simply wrong.',
  content: { 'application/json': { schema: ref('ErrorResponse') } },
}

const rateLimitResponse = {
  description:
    'Rate limit exceeded (express-rate-limit, mounted on /api/ before requestIdMiddleware in ' +
    'src/app.ts). Shape intentionally different from every other error response - no ' +
    'statusCode/timestamp/requestId/path.',
  content: {
    'application/json': {
      schema: ref('RateLimitErrorResponse'),
      examples: { rateLimited: { value: rateLimitErrorExample } },
    },
  },
}

export function buildOpenApiDocument(): OpenAPIObject {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Integration Service BKT',
      version: '1.0.0-SNAPSHOT',
      description:
        'ITSM TC Integration Service: recibe tickets de Jira/TC, guarda el bruto, ' +
        'los traduce con mappings guardados en MongoDB y notifica al orquestador. ' +
        'Generado a partir de los schemas Zod reales (src/validators, src/services) - ' +
        'ver CHANGELOG.md y README.md para el resto de la documentacion del proyecto.',
    },
    // Absolute (a relative '/' is rejected by stricter OAS validators) but still
    // environment-agnostic: override the variables per deployment. Defaults
    // resolve to https://localhost:8000 (PORT=8000 in .env.example). Plain HTTP
    // for the local docker-compose stack is a deployment detail documented in
    // README.md, not something the published contract should advertise.
    servers: [
      {
        url: '{protocol}://{host}',
        description: 'Override the variables per deployment.',
        variables: {
          protocol: {
            default: 'https',
            enum: ['https'],
            description: 'Transport protocol.',
          },
          host: {
            default: 'localhost:8000',
            description: 'Host:port where the service is exposed.',
          },
        },
      },
    ],
    tags: [
      { name: 'Health', description: 'Liveness/readiness probe' },
      { name: 'Meta', description: 'API root/info endpoint' },
      { name: 'Issues', description: 'Jira/TC ticket ingestion' },
    ],
    paths: {
      [HEALTH_CHECK_PATH_DEFAULT]: {
        get: {
          operationId: 'getHealth',
          tags: ['Health'],
          summary: 'Health check',
          description:
            `Configurable via HEALTH_CHECK_PATH env var (default shown here: ` +
            `${HEALTH_CHECK_PATH_DEFAULT}). Not behind the rate limiter (mounted only on /api/).`,
          'x-configurable-path': 'HEALTH_CHECK_PATH',
          responses: {
            '200': {
              description: 'Database connected',
              content: {
                'application/json': {
                  schema: ref('HealthResponse'),
                  examples: { ok: { value: healthOkExample } },
                },
              },
            },
            '503': {
              description:
                'Database disconnected. Body is otherwise identical to the 200 case - `message` ' +
                'stays the literal "OK" even here; only `database` (and the HTTP status) differ.',
              content: {
                'application/json': {
                  schema: ref('HealthResponse'),
                  examples: { degraded: { value: healthDegradedExample } },
                },
              },
            },
            '404': notFoundResponse,
            default: defaultErrorResponse,
          },
          security: [],
        },
      },
      [`/api/${API_VERSION_DEFAULT}`]: {
        get: {
          operationId: 'getApiRoot',
          tags: ['Meta'],
          summary: 'API root/info',
          description: `Configurable via API_VERSION env var (default: ${API_VERSION_DEFAULT}).`,
          'x-configurable-path': 'API_VERSION',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: ref('ApiRootResponse'),
                  examples: { ok: { value: apiRootExample } },
                },
              },
            },
            '401': unauthorizedResponse,
            '404': notFoundResponse,
            '429': rateLimitResponse,
            default: defaultErrorResponse,
          },
          security: [{ ApiKeyAuth: [] }],
        },
      },
      [`/api/${API_VERSION_DEFAULT}/issues`]: {
        post: {
          operationId: 'createIssues',
          tags: ['Issues'],
          summary: 'Ingest one Jira/TC issue',
          description:
            'Accepts exactly ONE ticket per request (issues array has length 1). Persists the ' +
            'raw payload in itsm_tickets, translates it with the mappings stored in MongoDB, ' +
            'persists the normalized ticket in tickets, and - in the background, without ' +
            'blocking this response - enriches attachments and notifies the orchestrator.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: ref('IssueBatchRequest'),
                examples: { jiraIssue: { value: jiraIssuePayloadExample } },
              },
            },
          },
          responses: {
            '201': {
              description:
                'Accepted for processing. HTTP 201 does NOT imply every ticket succeeded - ' +
                'check data.summary.successIntegration and each data.tickets[].success.',
              content: {
                'application/json': {
                  schema: ref('IssueAcceptedResponse'),
                  examples: {
                    exitoCompleto: { value: issueAcceptedFullSuccessExample },
                    aceptadoConFalloPorTicket: { value: issueAcceptedPartialFailureExample },
                  },
                },
              },
            },
            '400': {
              description:
                'Validation failed. `details` takes one of two shapes depending on issue count: ' +
                'a single validation issue, or an AggregateValidationError with `details.errors[]` ' +
                '(see src/errors/validation.ts).',
              content: {
                'application/json': {
                  schema: ref('ErrorResponse'),
                  examples: {
                    unSoloIssue: { value: validationErrorSingleIssueExample },
                    variosIssues: { value: validationErrorMultipleIssuesExample },
                  },
                },
              },
            },
            '401': unauthorizedResponse,
            '429': rateLimitResponse,
            default: defaultErrorResponse,
          },
          security: [{ ApiKeyAuth: [] }],
        },
      },
    },
    components: {
      schemas: componentSchemas,
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: API_KEY_HEADER_DEFAULT,
          description:
            'Header name configurable via API_KEY_HEADER env var. Enforced by ' +
            'src/middlewares/auth.middleware.ts on every operation under /api/v1 except ' +
            'getHealth. See README.md "Estado De Seguridad".',
        },
      },
    },
    security: [],
  }
}
