import type got from 'got'
import { env } from '../config/environment'
import { OrchestratorService } from '../services/orchestrator.service'

jest.mock('got', () => ({
  __esModule: true,
  default: {
    extend: jest.fn(() => ({ post: jest.fn() })),
  },
  HTTPError: class HTTPError extends Error {},
}))

describe('OrchestratorService', () => {
  it('serializes the flat orchestrator payload without legacy context or messages', async () => {
    const post = jest.fn().mockResolvedValue({ statusCode: 202 })
    const service = new OrchestratorService({ post } as unknown as typeof got)

    const result = await service.notifyTickets([
      {
        ticketId: 'PA-205',
        storedTicketId: `${env.MESH_ID}:PA-205`,
      },
    ])

    expect(post).toHaveBeenCalledWith(
      `${env.ORCHESTRATOR_BASE_URL}/${env.ORCHESTRATOR_ENDPOINT.replace(/^\/+/, '')}`,
      {
        json: {
          rol: env.ORCHESTRATOR_ROLE,
          ticket_id: 'PA-205',
          mesh_id: env.MESH_ID,
          execution_id: `${env.MESH_ID}:PA-205`,
        },
      }
    )
    expect(post.mock.calls[0]?.[1]?.json).not.toHaveProperty('messages')
    expect(post.mock.calls[0]?.[1]?.json).not.toHaveProperty('tenantId')
    expect(post.mock.calls[0]?.[1]?.json).not.toHaveProperty('projectId')
    expect(post.mock.calls[0]?.[1]?.json).not.toHaveProperty('itsmId')
    expect(result).toEqual([
      {
        ticketId: 'PA-205',
        storedTicketId: `${env.MESH_ID}:PA-205`,
        success: true,
        statusCode: 202,
      },
    ])
  })
})
