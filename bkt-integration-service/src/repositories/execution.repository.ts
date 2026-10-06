import { env } from '../config/environment'
import {
  Execution,
  type ExecutionError,
  type ExecutionTicket,
  type IExecution,
} from '../models/Execution.model'
import type { ExecutionRecordId, StoredTicketId } from '../types/integration'

export interface CreateExecutionParams {
  initiatedBy: string
  startTime: Date
}

export interface CompleteExecutionParams {
  endTime: Date
  executionTime: number
  ticketsProcessed: number
  ticketsSucceeded: number
  ticketsFailed: number
}

export class ExecutionRepository {
  async createExecution(params: CreateExecutionParams): Promise<IExecution> {
    return await Execution.create({
      meshId: env.MESH_ID,
      initiatedBy: params.initiatedBy,
      startTime: params.startTime,
    })
  }

  async updateIntegrationStatus(
    executionId: ExecutionRecordId,
    success: boolean
  ): Promise<IExecution | null> {
    return await Execution.findByIdAndUpdate(
      executionId,
      { successIntegration: success },
      { new: true }
    ).exec()
  }

  async updateOrchestratorStatus(
    executionId: ExecutionRecordId,
    success: boolean
  ): Promise<IExecution | null> {
    return await Execution.findByIdAndUpdate(
      executionId,
      { successOrchestrator: success },
      { new: true }
    ).exec()
  }

  async addError(
    executionId: ExecutionRecordId,
    error: ExecutionError
  ): Promise<IExecution | null> {
    return await Execution.findByIdAndUpdate(
      executionId,
      { $push: { error } },
      { new: true }
    ).exec()
  }

  async addTicket(
    executionId: ExecutionRecordId,
    ticket: ExecutionTicket
  ): Promise<IExecution | null> {
    return await Execution.findByIdAndUpdate(
      executionId,
      { $push: { ticketList: ticket } },
      { new: true }
    ).exec()
  }

  async appendTicketError(
    executionId: ExecutionRecordId,
    transformedTicketId: StoredTicketId,
    error: ExecutionError
  ): Promise<IExecution | null> {
    return await Execution.findOneAndUpdate(
      { _id: executionId, 'ticketList.transformedTicketId': transformedTicketId },
      {
        $push: { 'ticketList.$.errorList': error },
        $set: { 'ticketList.$.success': false },
      },
      { new: true }
    ).exec()
  }

  async completeExecution(
    executionId: ExecutionRecordId,
    params: CompleteExecutionParams
  ): Promise<IExecution | null> {
    return await Execution.findByIdAndUpdate(
      executionId,
      {
        endTime: params.endTime,
        executionTime: params.executionTime,
        ticketsProcessed: params.ticketsProcessed,
        ticketsSucceeded: params.ticketsSucceeded,
        ticketsFailed: params.ticketsFailed,
      },
      { new: true }
    ).exec()
  }

  async findById(executionId: ExecutionRecordId): Promise<IExecution | null> {
    return await Execution.findById(executionId).exec()
  }

  async setDispatchedExecutionIds(
    executionId: ExecutionRecordId,
    executionIds: StoredTicketId[]
  ): Promise<IExecution | null> {
    return await Execution.findByIdAndUpdate(
      executionId,
      { $set: { dispatchedExecutionIds: executionIds } },
      { new: true }
    ).exec()
  }
}

export const executionRepository = new ExecutionRepository()
