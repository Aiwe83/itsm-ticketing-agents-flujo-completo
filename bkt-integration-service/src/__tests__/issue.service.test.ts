import type { IExecution } from '../models/Execution.model'
import type { IMapping } from '../models/Mapping.model'
import type { ExecutionRepository } from '../repositories/execution.repository'
import type { ITSMTicketRepository } from '../repositories/itsm-ticket.repository'
import type { MappingRepository } from '../repositories/mapping.repository'
import type { TicketRepository } from '../repositories/ticket.repository'
import type { OrchestratorService } from '../services/orchestrator.service'
import { env } from '../config/environment'
import { jiraTicket, mappingFixtures } from './fixtures/issue.fixtures'

jest.mock('../services/orchestrator.service', () => ({
  orchestratorService: {
    notifyTickets: jest.fn(),
  },
}))

import { IssueService } from '../services/issue.service'

const execution = { _id: 'execution-1' } as IExecution

const createSubject = (mappings: IMapping[] = mappingFixtures as unknown as IMapping[]) => {
  const mappingRepository = {
    findByContext: jest.fn().mockResolvedValue(mappings),
  } as unknown as jest.Mocked<MappingRepository>

  const itsmTicketRepository = {
    create: jest.fn(),
    upsert: jest.fn().mockResolvedValue({}),
    updateStatus: jest.fn().mockResolvedValue({}),
    findByContext: jest.fn(),
  } as unknown as jest.Mocked<ITSMTicketRepository>

  const executionRepository = {
    createExecution: jest.fn().mockResolvedValue(execution),
    updateIntegrationStatus: jest.fn().mockResolvedValue(execution),
    updateOrchestratorStatus: jest.fn().mockResolvedValue(execution),
    addError: jest.fn().mockResolvedValue(execution),
    addTicket: jest.fn().mockResolvedValue(execution),
    appendTicketError: jest.fn().mockResolvedValue(execution),
    completeExecution: jest.fn().mockResolvedValue(execution),
    findById: jest.fn().mockResolvedValue(execution),
    setDispatchedExecutionIds: jest.fn().mockResolvedValue(execution),
  } as unknown as jest.Mocked<ExecutionRepository>

  const ticketRepository = {
    create: jest.fn(),
    upsert: jest.fn().mockResolvedValue({}),
  } as unknown as jest.Mocked<TicketRepository>

  const orchestratorService = {
    notifyTickets: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<OrchestratorService>

  const service = new IssueService(
    mappingRepository,
    itsmTicketRepository,
    executionRepository,
    ticketRepository,
    orchestratorService
  )

  return {
    service,
    mappingRepository,
    itsmTicketRepository,
    executionRepository,
    ticketRepository,
    orchestratorService,
  }
}

describe('IssueService', () => {
  const storedTicketId = `${env.MESH_ID}:${jiraTicket.key}`

  it('uses the same deterministic id and upserts both documents on Jira retries', async () => {
    const subject = createSubject()

    await subject.service.processIssues([jiraTicket])
    await subject.service.processIssues([jiraTicket])

    expect(subject.itsmTicketRepository.upsert).toHaveBeenCalledTimes(2)
    expect(subject.itsmTicketRepository.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ _id: storedTicketId, meshId: env.MESH_ID, status: 'persisted' })
    )
    expect(subject.itsmTicketRepository.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ _id: storedTicketId, meshId: env.MESH_ID, status: 'persisted' })
    )
    expect(subject.ticketRepository.upsert).toHaveBeenCalledTimes(2)
    expect(subject.ticketRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ _id: storedTicketId })
    )
    expect(subject.itsmTicketRepository.create).not.toHaveBeenCalled()
    expect(subject.ticketRepository.create).not.toHaveBeenCalled()
  })

  it('persists the raw ticket before translation and marks it failed when a mapping is invalid', async () => {
    const requiredMapping = {
      ...mappingFixtures[0],
      sourceField: 'fields.missingValue',
      targetField: 'content.requiredValue',
      required: true,
    } as unknown as IMapping
    const subject = createSubject([requiredMapping])

    const result = await subject.service.processIssues([jiraTicket])

    expect(subject.itsmTicketRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ _id: storedTicketId, content: jiraTicket, status: 'persisted' })
    )
    expect(subject.itsmTicketRepository.updateStatus).toHaveBeenCalledWith(storedTicketId, 'failed')
    expect(subject.ticketRepository.upsert).not.toHaveBeenCalled()
    expect(subject.orchestratorService.notifyTickets).not.toHaveBeenCalled()
    expect(result.tickets[0]).toMatchObject({ success: false, storedTicketId })
  })

  it('persists the raw ticket and completes the failed execution when loading mappings fails', async () => {
    const subject = createSubject()
    subject.mappingRepository.findByContext.mockRejectedValueOnce(
      new Error('Mapping lookup failed')
    )

    const result = await subject.service.processIssues([jiraTicket])

    expect(subject.itsmTicketRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ _id: storedTicketId, content: jiraTicket, status: 'persisted' })
    )
    expect(subject.mappingRepository.findByContext).toHaveBeenCalledTimes(1)
    expect(subject.itsmTicketRepository.updateStatus).toHaveBeenCalledWith(storedTicketId, 'failed')
    expect(subject.ticketRepository.upsert).not.toHaveBeenCalled()
    expect(subject.orchestratorService.notifyTickets).not.toHaveBeenCalled()
    expect(subject.executionRepository.addError).toHaveBeenCalledWith(
      execution._id,
      expect.objectContaining({ errorMessage: 'Mapping lookup failed' })
    )
    expect(subject.executionRepository.completeExecution).toHaveBeenCalledWith(
      execution._id,
      expect.objectContaining({ ticketsProcessed: 1, ticketsSucceeded: 0, ticketsFailed: 1 })
    )
    expect(result).toMatchObject({
      summary: { ticketsProcessed: 1, ticketsSucceeded: 0, ticketsFailed: 1 },
      tickets: [{ success: false, storedTicketId }],
    })
  })

  it('stores both documents with the same id and marks the raw ticket translated', async () => {
    const subject = createSubject()

    const result = await subject.service.processIssues([jiraTicket])

    expect(subject.itsmTicketRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ _id: storedTicketId, status: 'persisted' })
    )
    expect(subject.ticketRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ _id: storedTicketId })
    )
    expect(subject.itsmTicketRepository.updateStatus).toHaveBeenCalledWith(
      storedTicketId,
      'translated'
    )
    expect(result).toMatchObject({
      summary: { orchestratorDispatched: true },
      tickets: [{ success: true, storedTicketId }],
    })
  })

  it('returns before a slow orchestrator notification is resolved', async () => {
    const subject = createSubject()
    let resolveNotification: (() => void) | undefined
    subject.orchestratorService.notifyTickets.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveNotification = () =>
            resolve([
              {
                ticketId: jiraTicket.key,
                storedTicketId,
                success: true,
                statusCode: 200,
              },
            ])
        })
    )

    const result = await subject.service.processIssues([jiraTicket])

    expect(result.summary).toMatchObject({ orchestratorDispatched: true })
    expect(subject.orchestratorService.notifyTickets).toHaveBeenCalledTimes(1)
    expect(subject.executionRepository.updateOrchestratorStatus).not.toHaveBeenCalled()

    resolveNotification?.()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(subject.executionRepository.updateOrchestratorStatus).toHaveBeenCalledWith(
      execution._id,
      true
    )
  })

  it('normalizes a whitespace-only initiator to api', async () => {
    const subject = createSubject()

    await subject.service.processIssues([jiraTicket], '   ')

    expect(subject.executionRepository.createExecution).toHaveBeenCalledWith(
      expect.objectContaining({ initiatedBy: 'api' })
    )
  })

  it('preserves the processing error when marking the raw ticket failed also fails', async () => {
    const requiredMapping = {
      ...mappingFixtures[0],
      sourceField: 'fields.missingValue',
      targetField: 'content.requiredValue',
      required: true,
    } as unknown as IMapping
    const subject = createSubject([requiredMapping])
    subject.itsmTicketRepository.updateStatus.mockRejectedValueOnce(
      new Error('Raw status update failed')
    )

    const result = await subject.service.processIssues([jiraTicket])

    expect(result.tickets[0]?.errors).toEqual([
      expect.objectContaining({
        function: 'issueService.processIssues',
        errorMessage: 'Missing required value for mapping content.requiredValue',
      }),
      expect.objectContaining({
        function: 'itsmTicketRepository.updateStatus',
        errorMessage: 'Raw status update failed',
      }),
    ])
    expect(subject.executionRepository.addError).toHaveBeenCalledTimes(2)
    expect(subject.orchestratorService.notifyTickets).not.toHaveBeenCalled()
  })
})
