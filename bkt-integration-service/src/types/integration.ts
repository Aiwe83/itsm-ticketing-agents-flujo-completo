export interface MeshContext {
  meshId: string
}

export type StoredTicketId = string
export type ExecutionRecordId = string
export type TicketKey = string

export interface OrchestratorDispatchInput {
  role: string
  ticketId: TicketKey
  meshId: string
  storedTicketId: StoredTicketId
}

export interface OrchestratorDispatchPayload {
  rol: string
  ticket_id: TicketKey
  mesh_id: string
  execution_id: StoredTicketId
}
