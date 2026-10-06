import { env } from '../config/environment'
import logger from '../config/logger'
import type { ExecutionError, ExecutionTicket } from '../models/Execution.model'
import { executionRepository, type ExecutionRepository } from '../repositories/execution.repository'
import {
  itsmTicketRepository,
  type ITSMTicketRepository,
} from '../repositories/itsm-ticket.repository'
import { mappingRepository, MappingRepository } from '../repositories/mapping.repository'
import { ticketRepository, type TicketRepository } from '../repositories/ticket.repository'
import type { ExecutionRecordId, StoredTicketId } from '../types/integration'
import { toUtcIsoString } from '../utils/date.util'
import { transformIssuePayload, type IssueInfo } from '../utils/issue.util'
import type { IssuePayload } from '../validators/issue.validator'
import { AttachmentService } from './attachment.service'
import { createJiraAttachmentFetcher } from './jira-attachment.fetcher'
import {
  orchestratorService,
  type OrchestratorResult,
  type OrchestratorService,
  type OrchestratorTicketPayload,
} from './orchestrator.service'

export interface IssueProcessResult {
  ticketId: string
  issueId: string
  success: boolean
  errors: ExecutionError[]
  issue: IssuePayload
  transformedIssue?: IssueInfo
  receivedAt: string
  storedTicketId?: StoredTicketId
}

export interface IssueProcessSummary {
  ticketsProcessed: number
  ticketsSucceeded: number
  ticketsFailed: number
  successIntegration: boolean
  orchestratorDispatched: boolean
}

export interface IssueProcessResponse {
  executionId: string
  summary: IssueProcessSummary
  tickets: IssueProcessResult[]
}

export class IssueService {
  constructor(
    private readonly mappings: MappingRepository = mappingRepository,
    private readonly itsmTickets: ITSMTicketRepository = itsmTicketRepository,
    private readonly executions: ExecutionRepository = executionRepository,
    private readonly tickets: TicketRepository = ticketRepository,
    private readonly orchestrator: OrchestratorService = orchestratorService,
    private readonly attachments: AttachmentService = new AttachmentService(
      createJiraAttachmentFetcher()
    )
  ) {}

  async processIssues(
    payloads: IssuePayload[],
    initiatedBy?: string
  ): Promise<IssueProcessResponse> {
    const normalizedInitiator = initiatedBy?.trim() || 'api'
    const startTime = new Date()
    const execution = await this.executions.createExecution({
      initiatedBy: normalizedInitiator,
      startTime,
    })
    // executionRecordId identifies this processing attempt; storedTicketId
    // identifies the persisted raw/final ticket; ticketKey is Jira's key.
    const executionRecordId = execution._id

    let ticketsProcessed = 0
    let ticketsSucceeded = 0
    let ticketsFailed = 0
    const ticketResults: IssueProcessResult[] = []

    for (const payload of payloads) {
      ticketsProcessed += 1
      const now = new Date()
      const storedTicketId: StoredTicketId = `${env.MESH_ID}:${payload.key}`
      let rawTicketStored = false
      const ticketSummary: ExecutionTicket = {
        itsmTicketId: payload.id ?? payload.key,
        itsmTicketRef: payload.key,
        transformedTicketId: storedTicketId,
        success: false,
        errorList: [],
      }

      try {
        await this.itsmTickets.upsert({
          _id: storedTicketId,
          meshId: env.MESH_ID,
          content: payload,
          status: 'persisted',
        })
        rawTicketStored = true

        const mappings = await this.mappings.findByContext(env.MESH_ID)
        const transformedIssue = transformIssuePayload(payload, mappings)

        await this.tickets.upsert({
          _id: storedTicketId,
          itsmTicketId: transformedIssue.itsmTicketId || payload.key,
          ticketType: transformedIssue.ticketType || payload.fields.issuetype?.name || 'Unknown',
          content: transformedIssue.content,
        })
        await this.itsmTickets.updateStatus(storedTicketId, 'translated')

        ticketSummary.success = true
        await this.executions.addTicket(executionRecordId, ticketSummary)
        ticketResults.push({
          ticketId: payload.key,
          issueId: payload.id ?? payload.key,
          success: true,
          errors: [],
          issue: payload,
          transformedIssue,
          storedTicketId,
          receivedAt: toUtcIsoString(now),
        })
        ticketsSucceeded += 1
      } catch (error) {
        const errorDetails = [this.buildExecutionError(error, 'issueService.processIssues')]

        if (rawTicketStored) {
          try {
            await this.itsmTickets.updateStatus(storedTicketId, 'failed')
          } catch (statusError) {
            errorDetails.push(
              this.buildExecutionError(statusError, 'itsmTicketRepository.updateStatus')
            )
          }
        }

        ticketSummary.errorList.push(...errorDetails)
        for (const errorDetail of errorDetails) {
          await this.executions.addError(executionRecordId, errorDetail)
        }
        await this.executions.addTicket(executionRecordId, ticketSummary)
        ticketResults.push({
          ticketId: payload.key,
          issueId: payload.id ?? payload.key,
          success: false,
          errors: errorDetails,
          issue: payload,
          receivedAt: toUtcIsoString(now),
          storedTicketId,
        })
        ticketsFailed += 1
      }
    }

    const endTime = new Date()
    const executionTime = Math.round((endTime.getTime() - startTime.getTime()) / 1000)
    const successIntegration = ticketsFailed === 0
    await this.executions.updateIntegrationStatus(executionRecordId, successIntegration)

    const orchestratorTickets = ticketResults
      .filter(ticket => ticket.success && ticket.transformedIssue && ticket.storedTicketId)
      .map(ticket => ({
        ticketId: ticket.transformedIssue?.itsmTicketId ?? ticket.ticketId,
        storedTicketId: ticket.storedTicketId as StoredTicketId,
      }))

    const orchestratorDispatched = orchestratorTickets.length > 0
    if (orchestratorDispatched) {
      await this.executions.setDispatchedExecutionIds(
        executionRecordId,
        orchestratorTickets.map(ticket => ticket.storedTicketId)
      )
      void this.postProcessTickets(executionRecordId, ticketResults, orchestratorTickets).catch(
        error => {
          logger.error(
            { err: error, executionId: executionRecordId },
            'Failed to trace ticket post-processing'
          )
        }
      )
    }

    await this.executions.completeExecution(executionRecordId, {
      endTime,
      executionTime,
      ticketsProcessed,
      ticketsSucceeded,
      ticketsFailed,
    })

    return {
      executionId: executionRecordId,
      summary: {
        ticketsProcessed,
        ticketsSucceeded,
        ticketsFailed,
        successIntegration,
        orchestratorDispatched,
      },
      tickets: ticketResults,
    }
  }

  private async postProcessTickets(
    executionId: ExecutionRecordId,
    ticketResults: IssueProcessResult[],
    orchestratorTickets: OrchestratorTicketPayload[]
  ): Promise<void> {
    for (const ticketResult of ticketResults) {
      if (!ticketResult.success || !ticketResult.transformedIssue || !ticketResult.storedTicketId)
        continue

      await this.enrichTicketWithAttachments(executionId, ticketResult)
    }

    await this.dispatchOrchestrator(executionId, ticketResults, orchestratorTickets)
  }

  private async enrichTicketWithAttachments(
    executionId: ExecutionRecordId,
    ticketResult: IssueProcessResult
  ): Promise<void> {
    const rawAttachments = this.getIssueAttachments(ticketResult.issue)
    if (!Array.isArray(rawAttachments) || rawAttachments.length === 0) return

    try {
      const attachedDocuments = await this.attachments.processAttachments(
        rawAttachments,
        ticketResult.ticketId
      )

      if (!ticketResult.transformedIssue || !ticketResult.storedTicketId) return

      ticketResult.transformedIssue.content = {
        ...ticketResult.transformedIssue.content,
        attachedDocuments,
      }

      await this.tickets.upsert({
        _id: ticketResult.storedTicketId,
        itsmTicketId: ticketResult.transformedIssue.itsmTicketId || ticketResult.ticketId,
        ticketType: ticketResult.transformedIssue.ticketType || 'Unknown',
        content: ticketResult.transformedIssue.content,
      })

      for (const skippedAttachment of attachedDocuments.filter(
        document => document.skippedReason
      )) {
        await this.executions.addError(
          executionId,
          this.buildExecutionError(
            `Attachment ${skippedAttachment.filename} skipped: ${skippedAttachment.skippedReason}`,
            'attachmentService.processAttachments'
          )
        )
      }
    } catch (error) {
      await this.executions.addError(
        executionId,
        this.buildExecutionError(error, 'attachmentService.processAttachments')
      )
    }
  }

  private async dispatchOrchestrator(
    executionId: ExecutionRecordId,
    ticketResults: IssueProcessResult[],
    orchestratorTickets: OrchestratorTicketPayload[]
  ): Promise<void> {
    try {
      const orchestratorResults = await this.orchestrator.notifyTickets(orchestratorTickets)
      await this.handleOrchestratorResults(executionId, ticketResults, orchestratorResults)

      const successOrchestrator =
        orchestratorResults.length === orchestratorTickets.length &&
        orchestratorResults.every(result => result.success)
      await this.executions.updateOrchestratorStatus(executionId, successOrchestrator)
    } catch (error) {
      await this.executions.addError(
        executionId,
        this.buildExecutionError(error, 'issueService.dispatchOrchestrator')
      )
      await this.executions.updateOrchestratorStatus(executionId, false)
    }
  }

  private async handleOrchestratorResults(
    executionId: ExecutionRecordId,
    ticketResults: IssueProcessResult[],
    orchestratorResults: OrchestratorResult[]
  ): Promise<void> {
    if (orchestratorResults.length === 0) return

    const ticketMap = new Map(
      ticketResults
        .filter(ticket => ticket.storedTicketId)
        .map(ticket => [ticket.storedTicketId as StoredTicketId, ticket])
    )

    for (const result of orchestratorResults) {
      if (result.success) continue

      const errorDetail = this.buildExecutionError(
        result.errorMessage ??
          `Orchestrator request failed with status ${result.statusCode ?? 'unknown'}`,
        'orchestratorService.notifyTickets'
      )

      await this.executions.addError(executionId, errorDetail)
      if (ticketMap.has(result.storedTicketId)) {
        await this.executions.appendTicketError(executionId, result.storedTicketId, errorDetail)
      }
    }
  }

  private getIssueAttachments(payload: IssuePayload): unknown {
    return payload.fields['attachment'] ?? payload.fields['attachments'] ?? []
  }

  private buildExecutionError(error: unknown, origin: string): ExecutionError {
    if (error instanceof Error) {
      return {
        function: origin,
        errorMessage: error.message,
        timestamp: new Date(),
      }
    }

    if (typeof error === 'string') {
      return {
        function: origin,
        errorMessage: error,
        timestamp: new Date(),
      }
    }

    return {
      function: origin,
      errorMessage: 'Unknown error',
      timestamp: new Date(),
    }
  }
}

export const issueService = new IssueService()
