import { env } from '../config/environment'
import { Ticket, type ITicket } from '../models/Ticket.model'
import type { StoredTicketId } from '../types/integration'
import type { IssueContent } from '../utils/issue.util'

export interface CreateTicketParams {
  _id?: StoredTicketId
  itsmTicketId: string
  ticketType: string
  content: IssueContent
}

export interface UpsertTicketParams extends Omit<CreateTicketParams, '_id'> {
  _id: StoredTicketId
}

export class TicketRepository {
  async create(params: CreateTicketParams): Promise<ITicket> {
    return await Ticket.create({
      _id: params._id,
      meshId: env.MESH_ID,
      itsmTicketId: params.itsmTicketId,
      ticketType: params.ticketType,
      content: params.content,
    })
  }

  async upsert(params: UpsertTicketParams): Promise<ITicket | null> {
    const { _id, ...fields } = params

    return await Ticket.findOneAndUpdate(
      { _id },
      {
        $set: {
          ...fields,
          meshId: env.MESH_ID,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      }
    ).exec()
  }
}

export const ticketRepository = new TicketRepository()
