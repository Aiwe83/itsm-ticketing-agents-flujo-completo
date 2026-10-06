import { ITSMTicket, type IITSMTicket, type ITSMTicketStatus } from '../models/ITSMTicket.model'
import type { StoredTicketId } from '../types/integration'
import type { IssuePayload } from '../validators/issue.validator'

export interface CreateITSMTicketParams {
  meshId: string
  content: IssuePayload
  _id?: StoredTicketId
  status?: ITSMTicketStatus
}

export interface UpsertITSMTicketParams extends Omit<CreateITSMTicketParams, '_id' | 'status'> {
  _id: StoredTicketId
  status: ITSMTicketStatus
}

export class ITSMTicketRepository {
  async create(params: CreateITSMTicketParams): Promise<IITSMTicket> {
    return await ITSMTicket.create({
      _id: params._id,
      meshId: params.meshId,
      content: params.content,
      status: params.status,
    })
  }

  async upsert(params: UpsertITSMTicketParams): Promise<IITSMTicket | null> {
    const { _id, ...fields } = params

    return await ITSMTicket.findOneAndUpdate(
      { _id },
      { $set: fields },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      }
    ).exec()
  }

  async updateStatus(_id: StoredTicketId, status: ITSMTicketStatus): Promise<IITSMTicket | null> {
    return await ITSMTicket.findByIdAndUpdate(
      _id,
      { $set: { status } },
      { new: true, runValidators: true }
    ).exec()
  }

  async findByContext(meshId: string): Promise<IITSMTicket[]> {
    return await ITSMTicket.find({ meshId }).sort({ createdAt: -1 }).exec()
  }
}

export const itsmTicketRepository = new ITSMTicketRepository()
