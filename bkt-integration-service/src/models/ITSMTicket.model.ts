import { Document, Schema, model } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { env } from '../config/environment'
import type { StoredTicketId } from '../types/integration'
import type { IssuePayload } from '../validators/issue.validator'

export const ITSM_TICKET_STATUSES = ['persisted', 'translated', 'failed'] as const
export type ITSMTicketStatus = (typeof ITSM_TICKET_STATUSES)[number]

export interface IITSMTicket extends Document<string> {
  _id: StoredTicketId
  meshId: string
  content: IssuePayload
  status: ITSMTicketStatus
  createdAt: Date
  updatedAt: Date
}

const IssueTicketSchema = new Schema<IITSMTicket>(
  {
    _id: {
      type: String,
      default: () => randomUUID(),
    },
    meshId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    content: {
      type: Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ITSM_TICKET_STATUSES,
      default: 'persisted',
      index: true,
    },
  },
  {
    timestamps: true,
    collection: env.ORIGINAL_TICKET_COLLECTION_NAME,
    autoIndex: false,
    autoCreate: false,
    versionKey: false,
  }
)

export const ITSMTicket = model<IITSMTicket>('ITSMTicket', IssueTicketSchema)
