import request from 'supertest'

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}))

jest.mock('../../services/orchestrator.service', () => ({
  orchestratorService: {
    notifyTickets: jest.fn(),
  },
}))

import { createApp } from '../../app'
import { env } from '../../config/environment'
import { Execution } from '../../models/Execution.model'
import { ITSMTicket } from '../../models/ITSMTicket.model'
import { Mapping } from '../../models/Mapping.model'
import { Ticket } from '../../models/Ticket.model'
import { AttachmentService } from '../../services/attachment.service'
import { issueService } from '../../services/issue.service'
import { JiraAttachmentFetcher } from '../../services/jira-attachment.fetcher'
import { orchestratorService } from '../../services/orchestrator.service'
import { buildAttachmentCases, hostileXlsx, type AttachmentCase } from '../fixtures/attachment-files'
import { nodeFetchClient, startFakeJira, type FakeJira } from '../fixtures/fake-jira'
import { jiraTicket, mappingFixtures } from '../fixtures/issue.fixtures'

// E2E del servicio sin Jira real ni ngrok: un Jira falso sirve los adjuntos con
// autenticacion Basic (uno de ellos tras una redireccion 302) y se comprueba, en
// Mongo, lo que el servicio guarda. Es el mismo escenario que la guia manual
// (documentos_prueba/LEEME.md): 6 adjuntos se convierten y 4 se omiten.

jest.setTimeout(90_000)

const JIRA_CREDENTIALS = { user: 'e2e-user', password: 'e2e-secret' }
const REDIRECTED_FILE = '02_incidencias_excel.xlsx'

interface StoredAttachment {
  filename: string
  markdown: string
  skippedReason?: string
}

const app = createApp()
const notifyTicketsMock = orchestratorService.notifyTickets as jest.MockedFunction<
  typeof orchestratorService.notifyTickets
>

let fakeJira: FakeJira
let cases: AttachmentCase[]
let originalAttachments: unknown

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const waitFor = async <T>(read: () => Promise<T | null | undefined>, what: string, timeoutMs = 30_000): Promise<T> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await read()
    if (value) return value
    await sleep(50)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

const storedAttachments = async (expected: number): Promise<StoredAttachment[]> =>
  waitFor(async () => {
    const ticket = await Ticket.findOne().lean().exec()
    const documents = (ticket?.content as { attachedDocuments?: StoredAttachment[] } | undefined)?.attachedDocuments
    return documents && documents.length === expected ? documents : null
  }, `${expected} attached documents in Mongo`)

describe('E2E: ticket con adjuntos -> servicio -> Mongo (Jira falso)', () => {
  beforeAll(async () => {
    cases = await buildAttachmentCases()
    fakeJira = await startFakeJira(JIRA_CREDENTIALS)
    cases.forEach((attachmentCase, index) => {
      fakeJira.addFile(String(index + 1), attachmentCase.buffer, {
        redirect: attachmentCase.filename === REDIRECTED_FILE
      })
    })

    // El singleton `issueService` descarga con las credenciales del entorno; en el test se
    // le inyecta un fetcher apuntando al Jira falso (el codigo de produccion no cambia).
    const target = issueService as unknown as { attachments: AttachmentService }
    originalAttachments = target.attachments
    target.attachments = new AttachmentService(
      new JiraAttachmentFetcher({ baseUrl: fakeJira.baseUrl, ...JIRA_CREDENTIALS }, nodeFetchClient)
    )
  })

  afterAll(async () => {
    ;(issueService as unknown as { attachments: unknown }).attachments = originalAttachments
    await fakeJira.close()
  })

  beforeEach(async () => {
    notifyTicketsMock.mockReset()
    notifyTicketsMock.mockResolvedValue([])
    await Mapping.insertMany(mappingFixtures.map(mapping => ({ ...mapping, meshId: env.MESH_ID })))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('converts the supported attachments and skips the rest without breaking the ticket', async () => {
    const payload = {
      ...jiraTicket,
      fields: {
        ...jiraTicket.fields,
        attachment: cases.map((attachmentCase, index) => ({
          id: String(index + 1),
          filename: attachmentCase.filename,
          mimeType: attachmentCase.mimeType,
          size: attachmentCase.buffer.byteLength,
          content: `${fakeJira.baseUrl}/rest/api/3/attachment/content/${index + 1}`
        }))
      }
    }

    const response = await request(app)
      .post('/api/v1/issues')
      .set(env.API_KEY_HEADER, env.API_KEY)
      .send({ initiatedBy: 'e2e', issues: [payload] })

    expect(response.status).toBe(201)

    const documents = await storedAttachments(cases.length)
    const byName = new Map(documents.map(document => [document.filename, document]))

    for (const attachmentCase of cases) {
      const stored = byName.get(attachmentCase.filename)
      expect(stored).toBeDefined()
      if ('skippedReason' in attachmentCase.expected) {
        expect({ file: attachmentCase.filename, skippedReason: stored?.skippedReason }).toEqual({
          file: attachmentCase.filename,
          skippedReason: attachmentCase.expected.skippedReason
        })
        expect(stored?.markdown).toBe('')
      } else {
        expect({ file: attachmentCase.filename, skippedReason: stored?.skippedReason }).toEqual({
          file: attachmentCase.filename,
          skippedReason: undefined
        })
        for (const fragment of attachmentCase.expected.markdownIncludes) {
          expect({ file: attachmentCase.filename, includes: stored?.markdown.includes(fragment) }).toEqual({
            file: attachmentCase.filename,
            includes: true
          })
        }
      }
    }

    // El servicio descargo cada adjunto autenticado, y el redirigido se resolvio.
    const downloads = fakeJira.requests.filter(r => r.url.startsWith('/rest/api/3/attachment/content/'))
    const expectedAuthorization = `Basic ${Buffer.from(`${JIRA_CREDENTIALS.user}:${JIRA_CREDENTIALS.password}`).toString('base64')}`
    expect(downloads.length).toBeGreaterThanOrEqual(cases.length - 1)
    expect(downloads.every(r => r.authorization === expectedAuthorization)).toBe(true)
    expect(fakeJira.requests.some(r => r.url.startsWith('/media/'))).toBe(true)

    // Trazabilidad: el ticket bruto y la ejecucion quedan guardados, con un error por adjunto omitido.
    expect(await ITSMTicket.countDocuments()).toBe(1)
    const skippedCases = cases.filter(c => 'skippedReason' in c.expected)
    const execution = await waitFor(async () => {
      const found = await Execution.findOne().lean().exec()
      return found && (found.error?.length ?? 0) >= skippedCases.length ? found : null
    }, 'skipped-attachment errors in the execution')
    const messages = (execution.error ?? []).map(entry => entry.errorMessage)
    expect(messages).toHaveLength(skippedCases.length)
    for (const skipped of skippedCases) {
      expect(messages.some(message => message.includes(`Attachment ${skipped.filename} skipped`))).toBe(true)
    }
  })

  // Lento (~10 s): solo con E2E_HOSTILE=1. Un Excel hostil se descarta como too_large y el hilo principal no se bloquea.
  const hostileIt = process.env['E2E_HOSTILE'] === '1' ? it : it.skip
  hostileIt('discards a hostile xlsx as too_large without blocking the main thread', async () => {
    const hostile = await hostileXlsx()
    fakeJira.addFile('99', hostile)
    const target = issueService as unknown as { attachments: AttachmentService }
    const previous = target.attachments
    target.attachments = new AttachmentService(
      new JiraAttachmentFetcher(
        { baseUrl: fakeJira.baseUrl, ...JIRA_CREDENTIALS, bytesLimit: 10_000_000 },
        nodeFetchClient
      ),
      { bytesLimit: 10_000_000 }
    )

    let last = Date.now()
    let longestStall = 0
    const heartbeat = setInterval(() => {
      const now = Date.now()
      longestStall = Math.max(longestStall, now - last)
      last = now
    }, 100)

    try {
      const response = await request(app)
        .post('/api/v1/issues')
        .set(env.API_KEY_HEADER, env.API_KEY)
        .send({
          initiatedBy: 'e2e',
          issues: [
            {
              ...jiraTicket,
              fields: {
                ...jiraTicket.fields,
                attachment: [
                  {
                    id: '99',
                    filename: 'hostil.xlsx',
                    mimeType: 'application/octet-stream',
                    size: hostile.byteLength,
                    content: `${fakeJira.baseUrl}/rest/api/3/attachment/content/99`
                  }
                ]
              }
            }
          ]
        })
      expect(response.status).toBe(201)

      const documents = await storedAttachments(1)
      expect(documents[0]).toMatchObject({ filename: 'hostil.xlsx', skippedReason: 'too_large' })
      expect(longestStall).toBeLessThan(1500)
    } finally {
      clearInterval(heartbeat)
      target.attachments = previous
    }
  })

  it('marks every attachment as download_failed when Jira rejects the credentials', async () => {
    const target = issueService as unknown as { attachments: AttachmentService }
    const previous = target.attachments
    target.attachments = new AttachmentService(
      new JiraAttachmentFetcher({ baseUrl: fakeJira.baseUrl, user: JIRA_CREDENTIALS.user, password: 'wrong' }, nodeFetchClient)
    )

    try {
      const sample = cases.find(c => c.filename === '05_notas.md') as AttachmentCase
      const response = await request(app)
        .post('/api/v1/issues')
        .set(env.API_KEY_HEADER, env.API_KEY)
        .send({
          initiatedBy: 'e2e',
          issues: [
            {
              ...jiraTicket,
              fields: {
                ...jiraTicket.fields,
                attachment: [
                  {
                    id: '5',
                    filename: sample.filename,
                    mimeType: sample.mimeType,
                    size: sample.buffer.byteLength,
                    content: `${fakeJira.baseUrl}/rest/api/3/attachment/content/5`
                  }
                ]
              }
            }
          ]
        })

      expect(response.status).toBe(201)
      const documents = await storedAttachments(1)
      expect(documents[0]).toMatchObject({ filename: sample.filename, skippedReason: 'download_failed' })
    } finally {
      target.attachments = previous
    }
  })
})
