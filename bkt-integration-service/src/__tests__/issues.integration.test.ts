import request from 'supertest'

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}))

jest.mock('../services/orchestrator.service', () => ({
  orchestratorService: {
    notifyTickets: jest.fn(),
  },
}))

import { createApp } from '../app'
import { env } from '../config/environment'
import { Execution } from '../models/Execution.model'
import { ITSMTicket } from '../models/ITSMTicket.model'
import { Mapping } from '../models/Mapping.model'
import { Ticket } from '../models/Ticket.model'
import { itsmTicketRepository } from '../repositories/itsm-ticket.repository'
import { orchestratorService } from '../services/orchestrator.service'
import { jiraTicket, mappingFixtures } from './fixtures/issue.fixtures'

jest.setTimeout(60_000)

const app = createApp()
const notifyTicketsMock = orchestratorService.notifyTickets as jest.MockedFunction<
  typeof orchestratorService.notifyTickets
>

const seedMappings = async (): Promise<void> => {
  await Mapping.insertMany(
    mappingFixtures.map(mapping => ({
      ...mapping,
      meshId: env.MESH_ID,
    }))
  )
}

const waitForExecution = async (predicate: (execution: any) => boolean) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const execution = await Execution.findOne().lean().exec()
    if (execution && predicate(execution)) return execution
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  throw new Error('Timed out waiting for execution update')
}

describe('POST /api/v1/issues', () => {
  beforeEach(() => {
    notifyTicketsMock.mockReset()
    notifyTicketsMock.mockResolvedValue([])
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('does not expose removed parallel ingestion endpoints', async () => {
    const response = await request(app)
      .post('/api/v1/parallel-ingestion/process-data')
      .set(env.API_KEY_HEADER, env.API_KEY)
      .send({ initiatedBy: 'integration-test', issues: [jiraTicket] })

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'NOT_FOUND',
        path: '/api/v1/parallel-ingestion/process-data',
      },
    })
    await expect(ITSMTicket.countDocuments()).resolves.toBe(0)
    await expect(Ticket.countDocuments()).resolves.toBe(0)
    await expect(Execution.countDocuments()).resolves.toBe(0)
    expect(notifyTicketsMock).not.toHaveBeenCalled()
  })

  it('processes one Jira ticket, persists both documents and notifies the orchestrator', async () => {
    await seedMappings()
    notifyTicketsMock.mockImplementation(async tickets =>
      tickets.map(ticket => ({
        ...ticket,
        success: true,
        statusCode: 200,
      }))
    )

    const response = await request(app)
      .post('/api/v1/issues')
      .set(env.API_KEY_HEADER, env.API_KEY)
      .send({ initiatedBy: 'integration-test', issues: [jiraTicket] })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      success: true,
      data: {
        summary: {
          ticketsProcessed: 1,
          ticketsSucceeded: 1,
          ticketsFailed: 0,
          successIntegration: true,
          orchestratorDispatched: true,
        },
        tickets: [
          {
            key: 'PA-205',
            issueJiraId: jiraTicket.id,
            success: true,
          },
        ],
      },
    })

    const rawTicket = await ITSMTicket.findOne().lean().exec()
    const translatedTicket = await Ticket.findOne({
      meshId: env.MESH_ID,
      key: jiraTicket.key,
    })
      .lean()
      .exec()
    const execution = await waitForExecution(execution => execution.successOrchestrator === true)

    expect(rawTicket?.content).toEqual(jiraTicket)
    expect(rawTicket).toMatchObject({
      _id: `${env.MESH_ID}:${jiraTicket.key}`,
      meshId: env.MESH_ID,
      status: 'translated',
    })
    expect(translatedTicket).toMatchObject({
      meshId: env.MESH_ID,
      key: 'PA-205',
      content: {
        title: 'Incidencia en la cuenta puente GTX',
        status: 'Recibida',
        severityLevel: 'Medium',
        groupId: 'COMPONENTE 1',
      },
    })
    expect(execution).toMatchObject({
      initiatedBy: 'integration-test',
      successIntegration: true,
      successOrchestrator: true,
      dispatchedExecutionIds: [rawTicket?._id],
      ticketsProcessed: 1,
      ticketsSucceeded: 1,
      ticketsFailed: 0,
      ticketList: [
        {
          issueJiraId: jiraTicket.id,
          key: 'PA-205',
          success: true,
        },
      ],
    })
    expect(notifyTicketsMock).toHaveBeenCalledWith([
      {
        ticketDocumentId: translatedTicket?._id,
        storedTicketId: rawTicket?._id,
      },
    ])

    const rawTicketDoc = await ITSMTicket.findById(rawTicket?._id).exec()
    const translatedTicketDoc = await Ticket.findById(translatedTicket?._id).exec()
    const executionDoc = await Execution.findById(execution?._id).exec()

    expect(rawTicketDoc?.createdAt).toBeInstanceOf(Date)
    expect(rawTicketDoc?.updatedAt).toBeInstanceOf(Date)
    expect(translatedTicketDoc?.createdAt).toBeInstanceOf(Date)
    expect(translatedTicketDoc?.updatedAt).toBeInstanceOf(Date)
    expect(executionDoc?.startTime).toBeInstanceOf(Date)
    expect(executionDoc?.endTime).toBeInstanceOf(Date)
  })

  it('adds Jira attachment text to the translated ticket before notifying the orchestrator', async () => {
    await seedMappings()
    const ticketWithAttachment = {
      ...jiraTicket,
      fields: {
        ...jiraTicket.fields,
        attachment: [
          {
            filename: 'nota.txt',
            data: ' Texto visible para el flujo de agentes ',
          },
        ],
      },
    }
    let contentAtNotify: unknown
    notifyTicketsMock.mockImplementation(async tickets => {
      const storedTicket = await Ticket.findById(tickets[0]?.ticketDocumentId).lean().exec()
      contentAtNotify = storedTicket?.content
      return tickets.map(ticket => ({
        ...ticket,
        success: true,
        statusCode: 200,
      }))
    })

    const response = await request(app)
      .post('/api/v1/issues')
      .set(env.API_KEY_HEADER, env.API_KEY)
      .send({ initiatedBy: 'integration-test', issues: [ticketWithAttachment] })

    expect(response.status).toBe(201)

    const execution = await waitForExecution(execution => execution.successOrchestrator === true)
    const translatedTicket = await Ticket.findOne({
      meshId: env.MESH_ID,
      key: jiraTicket.key,
    })
      .lean()
      .exec()

    expect(translatedTicket?.content).toMatchObject({
      attachedDocuments: [
        {
          filename: 'nota.txt',
          markdown: 'Texto visible para el flujo de agentes',
        },
      ],
    })
    expect(contentAtNotify).toMatchObject({
      attachedDocuments: [
        {
          filename: 'nota.txt',
          markdown: 'Texto visible para el flujo de agentes',
        },
      ],
    })
    expect(execution).toMatchObject({
      successIntegration: true,
      successOrchestrator: true,
    })
  })

  it('upserts repeated deliveries without duplicating raw or translated tickets', async () => {
    await seedMappings()
    notifyTicketsMock.mockImplementation(async tickets =>
      tickets.map(ticket => ({
        ...ticket,
        success: true,
        statusCode: 200,
      }))
    )

    const firstResponse = await request(app)
      .post('/api/v1/issues')
      .set(env.API_KEY_HEADER, env.API_KEY)
      .send({ initiatedBy: 'jira-retry', issues: [jiraTicket] })
    const secondResponse = await request(app)
      .post('/api/v1/issues')
      .set(env.API_KEY_HEADER, env.API_KEY)
      .send({ initiatedBy: 'jira-retry', issues: [jiraTicket] })

    const storedTicketId = `${env.MESH_ID}:${jiraTicket.key}`
    expect(firstResponse.status).toBe(201)
    expect(secondResponse.status).toBe(201)
    await expect(ITSMTicket.countDocuments({ _id: storedTicketId })).resolves.toBe(1)
    await expect(
      Ticket.countDocuments({ meshId: env.MESH_ID, key: jiraTicket.key })
    ).resolves.toBe(1)
    await expect(Execution.countDocuments()).resolves.toBe(2)
    expect(notifyTicketsMock).toHaveBeenCalledTimes(2)
  })

  it('preserves the last valid translation when a Jira retry fails', async () => {
    await seedMappings()
    notifyTicketsMock.mockImplementation(async tickets =>
      tickets.map(ticket => ({
        ...ticket,
        success: true,
        statusCode: 200,
      }))
    )

    const firstResponse = await request(app)
      .post('/api/v1/issues')
      .set(env.API_KEY_HEADER, env.API_KEY)
      .send({ initiatedBy: 'jira-first-delivery', issues: [jiraTicket] })
    const translatedBeforeRetry = await Ticket.findOne().lean().exec()

    await Mapping.deleteMany({})
    await Mapping.create({
      sourceField: 'fields.missingValue',
      targetField: 'content.requiredValue',
      required: true,
      createdBy: 'integration-test',
      updatedBy: 'integration-test',
      meshId: env.MESH_ID,
      transformer: 'copy',
    })

    const retryResponse = await request(app)
      .post('/api/v1/issues')
      .set(env.API_KEY_HEADER, env.API_KEY)
      .send({ initiatedBy: 'jira-failed-retry', issues: [jiraTicket] })

    const storedTicketId = `${env.MESH_ID}:${jiraTicket.key}`
    const rawAfterRetry = await ITSMTicket.findById(storedTicketId).lean().exec()
    const translatedAfterRetry = await Ticket.findOne({
      meshId: env.MESH_ID,
      key: jiraTicket.key,
    })
      .lean()
      .exec()
    const executions = await Execution.find().sort({ createdAt: 1 }).lean().exec()

    expect(firstResponse.status).toBe(201)
    expect(retryResponse.status).toBe(201)
    expect(retryResponse.body.data).toMatchObject({
      summary: {
        ticketsProcessed: 1,
        ticketsSucceeded: 0,
        ticketsFailed: 1,
        successIntegration: false,
      },
    })
    await expect(ITSMTicket.countDocuments({ _id: storedTicketId })).resolves.toBe(1)
    await expect(
      Ticket.countDocuments({ meshId: env.MESH_ID, key: jiraTicket.key })
    ).resolves.toBe(1)
    expect(rawAfterRetry).toMatchObject({ _id: storedTicketId, status: 'failed' })
    expect(translatedAfterRetry).toEqual(translatedBeforeRetry)
    expect(executions).toHaveLength(2)
    expect(executions[0]).toMatchObject({ successIntegration: true, ticketsFailed: 0 })
    expect(executions[1]).toMatchObject({ successIntegration: false, ticketsFailed: 1 })
    expect(notifyTicketsMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['key', { ...jiraTicket, key: undefined }],
    ['fields.summary', { ...jiraTicket, fields: { ...jiraTicket.fields, summary: undefined } }],
  ])('returns 400 when %s is missing', async (_field, ticket) => {
    const response = await request(app)
      .post('/api/v1/issues')
      .set(env.API_KEY_HEADER, env.API_KEY)
      .send({ issues: [ticket] })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR', statusCode: 400 },
    })
    await expect(Execution.countDocuments()).resolves.toBe(0)
  })

  it('returns 400 when more than one ticket is sent', async () => {
    const response = await request(app)
      .post('/api/v1/issues')
      .set(env.API_KEY_HEADER, env.API_KEY)
      .send({ issues: [jiraTicket, jiraTicket] })

    expect(response.status).toBe(400)
    await expect(Execution.countDocuments()).resolves.toBe(0)
  })

  it('returns 400 when no ticket is sent', async () => {
    const response = await request(app)
      .post('/api/v1/issues')
      .set(env.API_KEY_HEADER, env.API_KEY)
      .send({ issues: [] })

    expect(response.status).toBe(400)
    await expect(Execution.countDocuments()).resolves.toBe(0)
  })

  it('returns a validation error for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/v1/issues')
      .set(env.API_KEY_HEADER, env.API_KEY)
      .set('Content-Type', 'application/json')
      .send('{"issues":[')

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      error: {
        message: 'Malformed JSON body',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      },
    })
    expect(response.body.error).not.toHaveProperty('stack')
  })

  it('persists a failed raw ticket when a required mapping has no value', async () => {
    await Mapping.create({
      sourceField: 'fields.missingValue',
      targetField: 'content.requiredValue',
      required: true,
      createdBy: 'integration-test',
      updatedBy: 'integration-test',
      meshId: env.MESH_ID,
      transformer: 'copy',
    })

    const response = await request(app)
      .post('/api/v1/issues')
      .set(env.API_KEY_HEADER, env.API_KEY)
      .send({ issues: [jiraTicket] })

    expect(response.status).toBe(201)
    expect(response.body.data).toMatchObject({
      summary: {
        ticketsProcessed: 1,
        ticketsSucceeded: 0,
        ticketsFailed: 1,
        successIntegration: false,
        orchestratorDispatched: false,
      },
      tickets: [
        {
          key: 'PA-205',
          success: false,
          errors: [
            {
              function: 'issueService.processIssues',
              errorMessage: 'Missing required value for mapping content.requiredValue',
            },
          ],
        },
      ],
    })
    await expect(ITSMTicket.countDocuments()).resolves.toBe(1)
    await expect(Ticket.countDocuments()).resolves.toBe(0)

    const rawTicket = await ITSMTicket.findOne().lean().exec()
    expect(rawTicket).toMatchObject({
      _id: `${env.MESH_ID}:${jiraTicket.key}`,
      status: 'failed',
      content: jiraTicket,
    })

    const execution = await Execution.findOne().lean().exec()
    expect(execution).toMatchObject({
      successIntegration: false,
      successOrchestrator: false,
      ticketsFailed: 1,
      error: [
        {
          function: 'issueService.processIssues',
          errorMessage: 'Missing required value for mapping content.requiredValue',
        },
      ],
      ticketList: [
        {
          success: false,
          errorList: [
            {
              errorMessage: 'Missing required value for mapping content.requiredValue',
            },
          ],
        },
      ],
    })
    expect(notifyTicketsMock).not.toHaveBeenCalled()
  })

  it('traces a raw persistence failure without notifying', async () => {
    await seedMappings()
    const updateStatusSpy = jest.spyOn(itsmTicketRepository, 'updateStatus')
    jest
      .spyOn(itsmTicketRepository, 'upsert')
      .mockRejectedValueOnce(new Error('Raw ticket persistence failed'))

    const response = await request(app)
      .post('/api/v1/issues')
      .set(env.API_KEY_HEADER, env.API_KEY)
      .send({ issues: [jiraTicket] })

    expect(response.status).toBe(201)
    expect(response.body.data).toMatchObject({
      summary: {
        ticketsProcessed: 1,
        ticketsSucceeded: 0,
        ticketsFailed: 1,
        successIntegration: false,
      },
      tickets: [
        {
          success: false,
          errors: [{ errorMessage: 'Raw ticket persistence failed' }],
        },
      ],
    })
    await expect(ITSMTicket.countDocuments()).resolves.toBe(0)
    await expect(Ticket.countDocuments()).resolves.toBe(0)

    const execution = await Execution.findOne().lean().exec()
    expect(execution).toMatchObject({
      successIntegration: false,
      error: [{ errorMessage: 'Raw ticket persistence failed' }],
      ticketList: [
        {
          success: false,
          errorList: [{ errorMessage: 'Raw ticket persistence failed' }],
        },
      ],
    })
    expect(updateStatusSpy).not.toHaveBeenCalled()
    expect(notifyTicketsMock).not.toHaveBeenCalled()
  })

  it('keeps persisted tickets and traces an orchestrator failure', async () => {
    await seedMappings()
    notifyTicketsMock.mockImplementation(async tickets =>
      tickets.map(ticket => ({
        ...ticket,
        success: false,
        statusCode: 503,
        errorMessage: 'Orchestrator unavailable',
      }))
    )

    const response = await request(app)
      .post('/api/v1/issues')
      .set(env.API_KEY_HEADER, env.API_KEY)
      .send({ issues: [jiraTicket] })

    expect(response.status).toBe(201)
    expect(response.body.data).toMatchObject({
      summary: {
        ticketsProcessed: 1,
        ticketsSucceeded: 1,
        ticketsFailed: 0,
        successIntegration: true,
        orchestratorDispatched: true,
      },
      tickets: [
        {
          key: 'PA-205',
          success: true,
          errors: [],
        },
      ],
    })
    await expect(ITSMTicket.countDocuments()).resolves.toBe(1)
    await expect(Ticket.countDocuments()).resolves.toBe(1)

    const execution = await waitForExecution(execution =>
      execution.error.some(
        (error: { errorMessage?: string }) => error.errorMessage === 'Orchestrator unavailable'
      )
    )
    expect(execution).toMatchObject({
      successIntegration: true,
      successOrchestrator: false,
      error: [{ errorMessage: 'Orchestrator unavailable' }],
      ticketList: [
        {
          success: false,
          errorList: [{ errorMessage: 'Orchestrator unavailable' }],
        },
      ],
    })
  })
})
