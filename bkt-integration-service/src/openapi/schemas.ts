import { z } from 'zod'
import {
  ATTACHMENT_TEXT_MAX,
  DATE_TIME_MAX,
  freeText,
  ID_MAX,
  LONG_TEXT_MAX,
  SHORT_TEXT_MAX,
  token,
} from '../validators/string.schemas'
import { issueBatchSchema, issuePayloadSchema } from '../validators/issue.validator'
import type { ExecutionError } from '../models/Execution.model'
import type { AttachedDocument, IssueContent, IssueInfo } from '../utils/issue.util'
import type {
  IssueProcessResponse,
  IssueProcessResult,
  IssueProcessSummary,
} from '../services/issue.service'

// Registry-based JSON Schema generation only (no zod-to-openapi dependency).
// Every schema below models the WIRE shape (what actually crosses HTTP as JSON),
// not the internal domain shape - e.g. `Date` fields become `z.string()` with a
// date-time format, because that is what `JSON.stringify` actually produces.
export const registry = z.registry<{ id: string; description?: string }>()

// Compile-time-only helper: forces `T` (a real domain/response type) and the
// inferred shape of a zod schema to match exactly. If someone adds a field to
// the real TypeScript type without mirroring it here, `tsc --noEmit` fails on
// the call site below instead of the drift going unnoticed.
function assertWireShape<T>(_value: T): void {}

// --- ExecutionError --------------------------------------------------------

type WireExecutionError = Omit<ExecutionError, 'timestamp'> & { timestamp: string }

export const executionErrorSchema = z.strictObject({
  function: token(ID_MAX).meta({
    description: 'Origin function/method where the error was captured',
  }),
  errorMessage: freeText(SHORT_TEXT_MAX),
  timestamp: z
    .string()
    .max(DATE_TIME_MAX)
    .meta({ format: 'date-time', description: 'UTC ISO-8601 timestamp' }),
})
registry.add(executionErrorSchema, { id: 'ExecutionError' })
assertWireShape<WireExecutionError>({} as z.infer<typeof executionErrorSchema>)

// --- AttachedDocument -------------------------------------------------------

export const attachedDocumentSchema = z.strictObject({
  filename: freeText(SHORT_TEXT_MAX),
  markdown: freeText(ATTACHMENT_TEXT_MAX),
  skippedReason: z.enum(['unsupported', 'too_large', 'download_failed']).optional(),
})
registry.add(attachedDocumentSchema, { id: 'AttachedDocument' })
assertWireShape<AttachedDocument>({} as z.infer<typeof attachedDocumentSchema>)

// --- IssueContent ------------------------------------------------------------
// `.passthrough()` documents that this is the KNOWN subset of DEFAULT_CONTENT
// (src/utils/issue.util.ts) - the real contract of Jira fields lives in the
// `mappings` collection in MongoDB, not in a fixed TypeScript shape.

export const issueContentSchema = z
  .object({
    key: token(ID_MAX).optional(),
    issueJiraId: token(ID_MAX).optional(),
    summary: freeText(SHORT_TEXT_MAX).optional(),
    description: freeText(LONG_TEXT_MAX).optional(),
    issueType: freeText(SHORT_TEXT_MAX).optional(),
    status: freeText(SHORT_TEXT_MAX).nullable().optional(),
    priority: freeText(SHORT_TEXT_MAX).nullable().optional(),
    components: z.array(z.unknown()).max(200).optional(),
    // Left open (no .strict()) deliberately: mapping.targetField can point at
    // any subfield here, same reasoning as the parent object's .passthrough().
    assignee: z
      .object({
        accountId: token(ID_MAX).optional(),
        email: freeText(SHORT_TEXT_MAX).optional(),
        displayName: freeText(SHORT_TEXT_MAX).optional(),
      })
      .optional(),
    attachedDocuments: z.array(attachedDocumentSchema).max(100).optional(),
  })
  .passthrough()
  .meta({
    description:
      'Known subset of the mapped Jira fields (the `mappings` collection). ' +
      'The real field contract is driven by the "mappings" MongoDB collection and can carry ' +
      'additional keys not listed here - hence additionalProperties is open, not a bug.',
  })
registry.add(issueContentSchema, { id: 'IssueContent' })
assertWireShape<IssueContent>({} as z.infer<typeof issueContentSchema>)

// --- IssueInfo (transformedIssue) -------------------------------------------

export const issueInfoSchema = z.strictObject({
  meshId: token(ID_MAX),
  content: issueContentSchema,
})
registry.add(issueInfoSchema, { id: 'IssueInfo' })
assertWireShape<IssueInfo>({} as z.infer<typeof issueInfoSchema>)

// --- IssueProcessResult / Summary / Response --------------------------------

registry.add(issuePayloadSchema, { id: 'IssuePayload' })
registry.add(issueBatchSchema, {
  id: 'IssueBatchRequest',
  description:
    'Request body of POST /api/v1/issues. Exactly one issue per request (issues.length === 1).',
})

export const issueProcessResultSchema = z.strictObject({
  key: token(ID_MAX),
  issueJiraId: token(ID_MAX),
  success: z.boolean(),
  errors: z.array(executionErrorSchema).max(50),
  issue: issuePayloadSchema,
  transformedIssue: issueInfoSchema.optional(),
  receivedAt: z.string().max(DATE_TIME_MAX).meta({ format: 'date-time' }),
  storedTicketId: token(ID_MAX).optional(),
})
registry.add(issueProcessResultSchema, { id: 'IssueProcessResult' })

type WireIssueProcessResult = Omit<IssueProcessResult, 'errors'> & { errors: WireExecutionError[] }
assertWireShape<WireIssueProcessResult>({} as z.infer<typeof issueProcessResultSchema>)

export const issueProcessSummarySchema = z.strictObject({
  ticketsProcessed: z.number().int().nonnegative(),
  ticketsSucceeded: z.number().int().nonnegative(),
  ticketsFailed: z.number().int().nonnegative(),
  successIntegration: z.boolean().meta({
    description: 'true only when every ticket in the batch succeeded (ticketsFailed === 0)',
  }),
  orchestratorDispatched: z.boolean(),
})
registry.add(issueProcessSummarySchema, { id: 'IssueProcessSummary' })
assertWireShape<IssueProcessSummary>({} as z.infer<typeof issueProcessSummarySchema>)

export const issueProcessResponseSchema = z.strictObject({
  executionId: token(ID_MAX).meta({
    description: 'Same value as the itsm_tickets/tickets _id (execution_id)',
  }),
  summary: issueProcessSummarySchema,
  tickets: z.array(issueProcessResultSchema).length(1),
})
registry.add(issueProcessResponseSchema, { id: 'IssueProcessResponse' })

type WireIssueProcessResponse = Omit<IssueProcessResponse, 'tickets'> & {
  tickets: WireIssueProcessResult[]
}
assertWireShape<WireIssueProcessResponse>({} as z.infer<typeof issueProcessResponseSchema>)

// --- Envelopes ----------------------------------------------------------------

export const issueAcceptedResponseSchema = z.strictObject({
  success: z.literal(true),
  message: freeText(SHORT_TEXT_MAX),
  data: issueProcessResponseSchema,
})
registry.add(issueAcceptedResponseSchema, {
  id: 'IssueAcceptedResponse',
  description:
    'HTTP 201 does NOT imply every ticket succeeded - check data.summary.successIntegration ' +
    'and each data.tickets[].success individually (per-ticket failures still return 201).',
})

export const errorResponseSchema = z.strictObject({
  success: z.literal(false),
  error: z.strictObject({
    message: freeText(SHORT_TEXT_MAX),
    code: token(ID_MAX),
    statusCode: z.number().int().min(100).max(599),
    details: z.unknown().optional(),
    timestamp: z.string().max(DATE_TIME_MAX).meta({ format: 'date-time' }),
    requestId: token(ID_MAX).optional(),
    path: token(ID_MAX).optional(),
  }),
})
registry.add(errorResponseSchema, { id: 'ErrorResponse' })

export const rateLimitErrorResponseSchema = z.strictObject({
  success: z.literal(false),
  error: z.strictObject({
    message: freeText(SHORT_TEXT_MAX),
    code: z.literal('RATE_LIMIT_EXCEEDED'),
  }),
})
registry.add(rateLimitErrorResponseSchema, {
  id: 'RateLimitErrorResponse',
  description:
    'express-rate-limit responds BEFORE requestIdMiddleware runs (see src/app.ts), so this ' +
    'shape intentionally omits statusCode/timestamp/requestId/path that every other error has. ' +
    'GET /health is not rate-limited (the limiter is mounted only on /api/).',
})

export const healthResponseSchema = z.strictObject({
  uptime: z.number().meta({ description: 'process.uptime() in seconds' }),
  message: z.literal('OK').meta({
    description:
      'Literal "OK" even on a 503 response - only the HTTP status and `database` differ.',
  }),
  timestamp: z.string().max(DATE_TIME_MAX).meta({ format: 'date-time' }),
  environment: token(ID_MAX),
  database: z.enum(['connected', 'disconnected']),
})
registry.add(healthResponseSchema, { id: 'HealthResponse' })

export const apiRootResponseSchema = z.strictObject({
  success: z.literal(true),
  message: freeText(SHORT_TEXT_MAX),
  version: token(ID_MAX),
})
registry.add(apiRootResponseSchema, { id: 'ApiRootResponse' })
