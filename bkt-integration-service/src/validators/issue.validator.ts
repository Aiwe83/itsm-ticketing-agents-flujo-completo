import { z } from 'zod'
import { freeText, ID_MAX, SHORT_TEXT_MAX } from './string.schemas'

const jiraIssueTypeSchema = z
  .object({
    name: freeText(ID_MAX).min(1),
  })
  .passthrough()

const jiraFieldsSchema = z
  .object({
    summary: freeText(SHORT_TEXT_MAX).min(1),
    issuetype: jiraIssueTypeSchema.optional(),
  })
  .passthrough()

export const issuePayloadSchema = z
  .object({
    id: freeText(ID_MAX).min(1).optional(),
    key: freeText(ID_MAX).min(1),
    fields: jiraFieldsSchema,
  })
  .passthrough()

export type IssuePayload = z.infer<typeof issuePayloadSchema>

export const issueBatchSchema = z
  .object({
    initiatedBy: freeText(200).min(1).optional(),
    issues: z.array(issuePayloadSchema).length(1),
  })
  .passthrough()

export type IssueBatchPayload = z.infer<typeof issueBatchSchema>

export const createIssuesSchema = z.object({
  body: issueBatchSchema,
  query: z.unknown().optional(),
  params: z.unknown().optional(),
})
