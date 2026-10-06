import { readFileSync } from 'node:fs'
import path from 'node:path'
import { issueBatchSchema } from '../validators/issue.validator'
import { jiraTicket } from './fixtures/issue.fixtures'

jest.setTimeout(60_000)

const legacyIssue = {
  issueId: '550e8400-e29b-41d4-a716-446655440000',
  ticketEntry: {
    header: {
      ticketId: 'PA-205',
      clientId: 'client-1',
      creationDate: '2026-01-01T00:00:00.000Z',
      createdBy: 'jira',
      manualClassification: 'incident',
      title: 'Legacy ticket',
      description: 'Legacy payload',
      assignedGroup: 'support',
      assignedUser: 'user-1',
      issueType: 'Incident',
      severity: 'Medium',
      specialFlag: false,
      businessProcess: 'accounting',
      softwareApplication: 'GTX',
      softwareElement: 'bridge-account',
      softwareInstance: 'prod',
      sla: { slaType: 'resolution', slaValue: null },
    },
    status: [
      {
        newStatus: 'Received',
        tsInitial: '2026-01-01T00:00:00.000Z',
        tsFinal: '2026-01-01T00:01:00.000Z',
      },
    ],
    assignments: [],
    notes: [],
    sync: { enabled: false, supportGroups: [], statusMapping: [] },
  },
}

describe('issueBatchSchema', () => {
  it('accepts a real Jira ticket and preserves additional Jira fields', () => {
    const result = issueBatchSchema.safeParse({ issues: [jiraTicket] })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.issues[0]).toMatchObject(jiraTicket)
  })

  it('rejects the legacy ticketEntry payload', () => {
    const result = issueBatchSchema.safeParse({ issues: [legacyIssue] })

    expect(result.success).toBe(false)
  })

  it.each([
    ['key', { ...jiraTicket, key: undefined }],
    ['fields.summary', { ...jiraTicket, fields: { ...jiraTicket.fields, summary: undefined } }],
  ])('requires %s', (_field, ticket) => {
    const result = issueBatchSchema.safeParse({ issues: [ticket] })

    expect(result.success).toBe(false)
  })

  it('rejects a control character in key or fields.summary', () => {
    const withControlCharInKey = { ...jiraTicket, key: 'PA-205\x00' }
    const withControlCharInSummary = {
      ...jiraTicket,
      fields: { ...jiraTicket.fields, summary: 'Bad\x01summary' },
    }

    expect(issueBatchSchema.safeParse({ issues: [withControlCharInKey] }).success).toBe(false)
    expect(issueBatchSchema.safeParse({ issues: [withControlCharInSummary] }).success).toBe(false)
  })

  it('requires exactly one ticket', () => {
    expect(issueBatchSchema.safeParse({ issues: [] }).success).toBe(false)
    expect(issueBatchSchema.safeParse({ issues: [jiraTicket, jiraTicket] }).success).toBe(false)
  })

  it('allows initiatedBy to be omitted', () => {
    const result = issueBatchSchema.safeParse({ issues: [jiraTicket] })

    expect(result.success).toBe(true)
  })

  it('keeps the Postman example on the Jira contract with exactly one ticket', () => {
    const collectionPath = path.resolve(
      process.cwd(),
      'src',
      '__tests__',
      'fixtures',
      'jira-fixtures',
      'postman-collection.json'
    )
    const collection = JSON.parse(readFileSync(collectionPath, 'utf8'))
    const requestBody = JSON.parse(collection.item[0].request.body.raw)
    const result = issueBatchSchema.safeParse(requestBody)

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.issues).toHaveLength(1)
    expect(result.data.issues[0]?.key).toBe('PA-205')
  })
})
