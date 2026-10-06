import { Document, Schema, model } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { env } from '../config/environment'
import type { StoredTicketId } from '../types/integration'
import type { IssueContent } from '../utils/issue.util'

export interface ITicket extends Document<string> {
  _id: StoredTicketId
  meshId: string
  itsmTicketId: string
  ticketType: string
  content: IssueContent
  createdAt: Date
  updatedAt: Date
}

const TicketSchema = new Schema<ITicket>(
  {
    _id: {
      type: String,
      default: () => randomUUID(),
    },
    meshId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    itsmTicketId: {
      type: String,
      required: true,
      trim: true,
    },
    ticketType: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: env.PROCESSED_TICKET_COLLECTION_NAME,
    autoIndex: false,
    autoCreate: false,
    versionKey: false,
  }
)

export const Ticket = model<ITicket>('Ticket', TicketSchema)
