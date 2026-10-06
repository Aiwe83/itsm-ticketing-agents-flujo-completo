import got, { HTTPError, type Response } from 'got'
import { env } from '../config/environment'
import type { OrchestratorDispatchPayload, StoredTicketId, TicketKey } from '../types/integration'

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
  retry: {
    limit: 3,
    methods: ['POST'],
    statusCodes: [408, 413, 429, 500, 502, 503, 504],
    errorCodes: [
      'ETIMEDOUT',
      'ECONNRESET',
      'EADDRINUSE',
      'ECONNREFUSED',
      'EPIPE',
      'ENOTFOUND',
      'ENETUNREACH',
      'EAI_AGAIN',
    ],
    calculateDelay: ({ attemptCount, retryOptions }) => {
      if (attemptCount > retryOptions.limit) {
        return 0
      }
      const baseDelay = 500
      return Math.min(baseDelay * 2 ** (attemptCount - 1), 4000)
    },
  },
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
