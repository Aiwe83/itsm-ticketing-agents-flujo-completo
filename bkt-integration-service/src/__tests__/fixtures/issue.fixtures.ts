import { readFileSync } from 'node:fs'
import path from 'node:path'

export interface JiraTicketFixture {
  id?: string
  key: string
  fields: {
    summary: string
    issuetype?: { name: string }
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface MappingFixture {
  _id: string
  sourceField: string
  targetField: string
  required: boolean
  description?: string
  createdBy: string
  updatedBy: string
  meshId: string
  transformer?: string
  options?: Record<string, unknown>
}

interface RawTicketFixture {
  content: JiraTicketFixture
}

interface ProcessedTicketFixture {
  itsmTicketId: string
  ticketType: string
  content: Record<string, unknown>
}

const dataDirectory = path.resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'jira-fixtures')

const readJson = <T>(fileName: string): T =>
  JSON.parse(readFileSync(path.join(dataDirectory, fileName), 'utf8')) as T

const rawTickets = readJson<RawTicketFixture[]>('raw-tickets.json')
const processedTickets = readJson<ProcessedTicketFixture[]>('translated-tickets.json')

if (!rawTickets[0] || !processedTickets[0]) {
  throw new Error('The Jira test fixtures must contain at least one ticket')
}

export const jiraTicket = rawTickets[0].content
export const mappingFixtures = readJson<MappingFixture[]>('mappings.json')
export const processedTicketOracle = processedTickets[0]
