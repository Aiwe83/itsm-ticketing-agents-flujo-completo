import { ValidationError } from '../errors/validation'
import type { IMapping } from '../models/Mapping.model'
import { transformIssuePayload } from '../utils/issue.util'
import type { IssuePayload } from '../validators/issue.validator'
import { jiraTicket, mappingFixtures, processedTicketOracle } from './fixtures/issue.fixtures'

jest.setTimeout(60_000)

const issue = jiraTicket as IssuePayload
const mappings = mappingFixtures as unknown as IMapping[]

describe('transformIssuePayload', () => {
  it('translates PA-205 with the real mappings', () => {
    const result = transformIssuePayload(issue, mappings)

    expect(result).toMatchObject({
      meshId: expect.any(String),
      itsmTicketId: processedTicketOracle.itsmTicketId,
      ticketType: processedTicketOracle.ticketType,
      content: {
        issueDescription: processedTicketOracle.content['issueDescription'],
        title: processedTicketOracle.content['title'],
        status: processedTicketOracle.content['status'],
        severityLevel: processedTicketOracle.content['severityLevel'],
        groupId: processedTicketOracle.content['groupId'],
      },
    })
  })

  it('reports the source and target when a required mapping has no value', () => {
    const requiredMapping = {
      ...mappingFixtures[0],
      sourceField: 'fields.missingValue',
      targetField: 'content.requiredValue',
      required: true,
    } as unknown as IMapping

    let thrownError: unknown
    try {
      transformIssuePayload(issue, [requiredMapping])
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeInstanceOf(ValidationError)
    expect(thrownError).toMatchObject({
      details: {
        sourceField: 'fields.missingValue',
        targetField: 'content.requiredValue',
      },
    })
  })

  it('throws a traceable error instead of silently falling back to copy for an unknown transformer', () => {
    const unknownTransformerMapping = {
      ...mappingFixtures[0],
      transformer: 'uppercase',
    } as unknown as IMapping

    expect(() => transformIssuePayload(issue, [unknownTransformerMapping])).toThrow(
      /Unknown mapping transformer "uppercase"/
    )
  })

  it('normalizes a known severity level with the severity transformer', () => {
    const severityMapping = {
      ...mappingFixtures[0],
      sourceField: 'fields.priority.name',
      targetField: 'content.severityLevel',
      transformer: 'severity',
      required: false,
    } as unknown as IMapping

    const result = transformIssuePayload(issue, [severityMapping])

    expect(result.content['severityLevel']).toBe('3')
  })

  it('formats an array field into readable text with the mapToString transformer', () => {
    const payload = {
      ...issue,
      fields: {
        ...issue.fields,
        timeEntries: [{ hours: '2', comment: 'Investigation' }],
      },
    } as unknown as IssuePayload

    const mapToStringMapping = {
      ...mappingFixtures[0],
      sourceField: 'fields.timeEntries',
      targetField: 'content.actions[*]',
      transformer: 'mapToString',
      required: false,
      options: { transformer: { hours: 'Horas', comment: 'Comentario' } },
    } as unknown as IMapping

    const result = transformIssuePayload(payload, [mapToStringMapping])

    expect(result.content['actions']).toEqual(['Horas: 2\nComentario: Investigation\n'])
  })
})
