import got, { HTTPError, type Response } from 'got'
import logger from '../config/logger'
import { env } from '../config/environment'
import type { OrchestratorDispatchPayload, StoredTicketId, TicketKey } from '../types/integration'
import { createOrchestratorRetryOptions } from './orchestrator-retry.policy'

export interface OrchestratorTicketPayload {
  ticketId: TicketKey
  storedTicketId: StoredTicketId
}

export interface OrchestratorResult {
  ticketId: TicketKey
  storedTicketId: StoredTicketId
  success: boolean
  errorMessage?: string
  statusCode?: number
}

const DEFAULT_HTTP_CLIENT = got.extend({
  retry: createOrchestratorRetryOptions(trace => {
    logger.warn(
      {
        eventName: 'orchestrator.retry.scheduled',
        attemptCount: trace.attemptCount,
        retryLimit: trace.retryLimit,
        delayMs: trace.delayMs,
        statusCode: trace.statusCode,
        errorCode: trace.errorCode,
      },
      'Retrying orchestrator dispatch'
    )
  }),
})

export class OrchestratorService {
  constructor(private readonly httpClient: typeof got = DEFAULT_HTTP_CLIENT) {}

  async notifyTickets(tickets: OrchestratorTicketPayload[]): Promise<OrchestratorResult[]> {
    if (tickets.length === 0) return []

    const results: OrchestratorResult[] = []

    await Promise.all(
      tickets.map(async ticket => {
        const ticketOrchestrator = this.serializePayload(ticket)

        try {
          const response: Response = await this.httpClient.post(this.buildUrl(), {
            json: ticketOrchestrator,
          })

          results.push({
            ticketId: ticket.ticketId,
            storedTicketId: ticket.storedTicketId,
            success: response.statusCode >= 200 && response.statusCode < 300,
            statusCode: response.statusCode,
          })
        } catch (error) {
          if (error instanceof HTTPError) {
            results.push({
              ticketId: ticket.ticketId,
              storedTicketId: ticket.storedTicketId,
              success: false,
              errorMessage: error.message,
              statusCode: error.response?.statusCode,
            })
            return
          }

          results.push({
            ticketId: ticket.ticketId,
            storedTicketId: ticket.storedTicketId,
            success: false,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      })
    )

    return results
  }

  serializePayload(ticket: OrchestratorTicketPayload): OrchestratorDispatchPayload {
    // execution_id es el _id del ticket persistido en itsm_tickets
    // (storedTicketId = `${meshId}:${ticketKey}`).
    return {
      rol: env.ORCHESTRATOR_ROLE,
      ticket_id: ticket.ticketId,
      mesh_id: env.MESH_ID,
      execution_id: ticket.storedTicketId,
    }
  }

  private buildUrl(): string {
    const baseUrl = env.ORCHESTRATOR_BASE_URL.replace(/\/+$/, '')
    const endpoint = env.ORCHESTRATOR_ENDPOINT.replace(/^\/+/, '')
    return `${baseUrl}/${endpoint}`
  }
}

export const orchestratorService = new OrchestratorService()
