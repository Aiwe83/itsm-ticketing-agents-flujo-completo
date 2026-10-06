import { Document, Schema, model } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { env } from '../config/environment'
import type { ExecutionRecordId, StoredTicketId } from '../types/integration'

export interface ExecutionError {
  function: string
  errorMessage: string
  timestamp: Date
}

export interface ExecutionTicket {
  itsmTicketId: string
  itsmTicketRef: string
  transformedTicketId: StoredTicketId
  success: boolean
  errorList: ExecutionError[]
}

export interface IExecution extends Document<string> {
  _id: ExecutionRecordId
  meshId: string
  initiatedBy: string
  successIntegration: boolean
  successOrchestrator: boolean
  error: ExecutionError[]
  startTime: Date
  endTime?: Date
  executionTime: number
  ticketsProcessed: number
  ticketsSucceeded: number
  ticketsFailed: number
  ticketList: ExecutionTicket[]
  // Contiene los storedTicketIds (= execution_id segun contrato) despachados
  // al orquestador. NO es el Execution._id (executionRecordId).
  dispatchedExecutionIds?: StoredTicketId[]
  createdAt: Date
  updatedAt: Date
}

const ExecutionErrorSchema = new Schema<ExecutionError>(
  {
    function: {
      type: String,
      required: true,
      trim: true,
    },
    errorMessage: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      required: true,
    },
  },
  { _id: false, versionKey: false }
)

const ExecutionTicketSchema = new Schema<ExecutionTicket>(
  {
    itsmTicketId: {
      type: String,
      required: true,
      trim: true,
    },
    itsmTicketRef: {
      type: String,
      required: true,
      trim: true,
    },
    transformedTicketId: {
      type: String,
      required: true,
      trim: true,
    },
    success: {
      type: Boolean,
      required: true,
      default: false,
    },
    errorList: {
      type: [ExecutionErrorSchema],
      default: [],
    },
  },
  { _id: false, versionKey: false }
)

const ExecutionSchema = new Schema<IExecution>(
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
    initiatedBy: {
      type: String,
      required: true,
      trim: true,
    },
    successIntegration: {
      type: Boolean,
      default: false,
    },
    successOrchestrator: {
      type: Boolean,
      default: false,
    },
    error: {
      type: [ExecutionErrorSchema],
      default: [],
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
    },
    executionTime: {
      type: Number,
      default: 0,
    },
    ticketsProcessed: {
      type: Number,
      default: 0,
    },
    ticketsSucceeded: {
      type: Number,
      default: 0,
    },
    ticketsFailed: {
      type: Number,
      default: 0,
    },
    ticketList: {
      type: [ExecutionTicketSchema],
      default: [],
    },
    dispatchedExecutionIds: {
      type: [String],
      default: undefined,
    },
  },
  {
    timestamps: true,
    collection: env.EXECUTIONS_COLLECTION_NAME,
    autoIndex: false,
    autoCreate: false,
    versionKey: false,
  }
)

export const Execution = model<IExecution>('Execution', ExecutionSchema)
