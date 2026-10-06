import { envSchema } from '../config/environment'
import {
  API_KEY_HEADER_DEFAULT,
  API_VERSION_DEFAULT,
  APP_DESCRIPTION_DEFAULT,
  HEALTH_CHECK_PATH_DEFAULT,
  buildOpenApiDocument,
} from '../openapi/document'
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
} from '../openapi/examples'
import {
  apiRootResponseSchema,
  errorResponseSchema,
  healthResponseSchema,
  issueAcceptedResponseSchema,
  rateLimitErrorResponseSchema,
} from '../openapi/schemas'
import { issueBatchSchema } from '../validators/issue.validator'

// Minimal set of vars with no schema default, just enough for envSchema.parse
// to succeed so we can read back the DEFAULTS of the vars that do have one.
// Deliberately not process.env / .env.test: that file intentionally overrides
// APP_DESCRIPTION for test readability, which is NOT the same thing as the
// schema default the generator documents (what ships when the var is unset).
const REQUIRED_ENV_STUB = {
  MONGODB_USERNAME: 'x',
  MONGODB_PASSWORD: 'x',
  MONGODB_HOST: 'x',
  MONGODB_DATABASE: 'x',
  API_KEY: 'x',
  ORCHESTRATOR_BASE_URL: 'https://example.invalid',
  ORCHESTRATOR_ENDPOINT: '/x',
  MESH_ID: 'x',
  ORIGINAL_TICKET_COLLECTION_NAME: 'x',
  PROCESSED_TICKET_COLLECTION_NAME: 'x',
  EXECUTIONS_COLLECTION_NAME: 'x',
  MAPPINGS_COLLECTION_NAME: 'x',
}

describe('openapi document', () => {
  it('keeps generator constants in sync with the real env schema defaults', () => {
    const defaults = envSchema.parse(REQUIRED_ENV_STUB)
    expect(HEALTH_CHECK_PATH_DEFAULT).toBe(defaults.HEALTH_CHECK_PATH)
    expect(API_VERSION_DEFAULT).toBe(defaults.API_VERSION)
    expect(APP_DESCRIPTION_DEFAULT).toBe(defaults.APP_DESCRIPTION)
    expect(API_KEY_HEADER_DEFAULT).toBe(defaults.API_KEY_HEADER)
  })

  it('every documented example parses against its own schema', () => {
    expect(() => issueBatchSchema.parse(jiraIssuePayloadExample)).not.toThrow()
    expect(() => issueAcceptedResponseSchema.parse(issueAcceptedFullSuccessExample)).not.toThrow()
    expect(() =>
      issueAcceptedResponseSchema.parse(issueAcceptedPartialFailureExample)
    ).not.toThrow()
    expect(() => errorResponseSchema.parse(validationErrorSingleIssueExample)).not.toThrow()
    expect(() => errorResponseSchema.parse(validationErrorMultipleIssuesExample)).not.toThrow()
    expect(() => rateLimitErrorResponseSchema.parse(rateLimitErrorExample)).not.toThrow()
    expect(() => healthResponseSchema.parse(healthOkExample)).not.toThrow()
    expect(() => healthResponseSchema.parse(healthDegradedExample)).not.toThrow()
    expect(() => apiRootResponseSchema.parse(apiRootExample)).not.toThrow()
  })

  it('builds a document whose $ref pointers all resolve to a real component schema', () => {
    const document = buildOpenApiDocument()
    const schemaIds = new Set(Object.keys(document.components?.schemas ?? {}))
    expect(schemaIds.size).toBeGreaterThan(0)

    const refs: string[] = []
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk)
        return
      }
      if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          if (key === '$ref' && typeof value === 'string') {
            refs.push(value)
          } else {
            walk(value)
          }
        }
      }
    }
    walk(document.paths)
    walk(document.components?.schemas)

    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) {
      const id = ref.replace('#/components/schemas/', '')
      expect(schemaIds.has(id)).toBe(true)
    }
  })

  it('declares every documented HTTP path/method from the real routes', () => {
    const document = buildOpenApiDocument()
    expect(document.paths[HEALTH_CHECK_PATH_DEFAULT]?.get).toBeDefined()
    expect(document.paths[`/api/${API_VERSION_DEFAULT}`]?.get).toBeDefined()
    expect(document.paths[`/api/${API_VERSION_DEFAULT}/issues`]?.post).toBeDefined()

    const issuesPost = document.paths[`/api/${API_VERSION_DEFAULT}/issues`]?.post
    expect(Object.keys(issuesPost?.responses ?? {}).sort()).toEqual([
      '201',
      '400',
      '401',
      '429',
      'default',
    ])
  })

  it('requires ApiKeyAuth on protected operations and leaves getHealth open', () => {
    const document = buildOpenApiDocument()
    const getApiRootOp = document.paths[`/api/${API_VERSION_DEFAULT}`]?.get
    const createIssuesOp = document.paths[`/api/${API_VERSION_DEFAULT}/issues`]?.post
    const getHealthOp = document.paths[HEALTH_CHECK_PATH_DEFAULT]?.get

    expect(getApiRootOp?.security).toEqual([{ ApiKeyAuth: [] }])
    expect(createIssuesOp?.security).toEqual([{ ApiKeyAuth: [] }])
    expect(getHealthOp?.security).toEqual([])

    expect(getApiRootOp?.responses?.['401']).toBeDefined()
    expect(createIssuesOp?.responses?.['401']).toBeDefined()
    expect(getHealthOp?.responses?.['401']).toBeUndefined()
  })

  it('declares ApiKeyAuth as enforced and only allows https as the server protocol', () => {
    const document = buildOpenApiDocument()
    const apiKeyScheme = document.components?.securitySchemes?.ApiKeyAuth as
      | Record<string, unknown>
      | undefined

    expect(apiKeyScheme).toBeDefined()
    expect(apiKeyScheme).not.toHaveProperty('x-enforced')

    const protocolVariable = document.servers?.[0]?.variables?.protocol
    expect(protocolVariable?.enum).toEqual(['https'])
  })

  it('never emits an allOf wrapper or an untyped additionalProperties', () => {
    const document = buildOpenApiDocument()

    // ErrorResponse.error.details is the one deliberate exception: its real
    // shape is genuinely polymorphic (single ValidationError vs
    // AggregateValidationError.errors[], see src/errors/validation.ts) and
    // nests deeper than the bounded JsonValue schema allows - modeling it
    // precisely would need ~12 schema variants for marginal score value.
    const errorSchema = document.components?.schemas?.['ErrorResponse'] as
      | { properties?: { error?: { properties?: Record<string, unknown> } } }
      | undefined
    expect(errorSchema?.properties?.error?.properties?.['details']).toEqual({})

    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk)
        return
      }
      if (node && typeof node === 'object') {
        const obj = node as Record<string, unknown>
        expect(obj).not.toHaveProperty('allOf')
        if ('additionalProperties' in obj) {
          const additionalProperties = obj['additionalProperties']
          const isEmpty =
            typeof additionalProperties === 'object' &&
            additionalProperties !== null &&
            Object.keys(additionalProperties).length === 0
          expect(isEmpty).toBe(false)
        }
        Object.values(obj).forEach(walk)
      }
    }

    walk(document.components?.schemas)
  })
})
