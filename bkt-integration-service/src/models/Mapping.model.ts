import { Document, Schema, model } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { env } from '../config/environment'

export interface IMapping extends Document<string> {
  _id: string
  sourceField: string
  targetField: string
  required: boolean
  description?: string
  createdBy: string
  updatedBy: string
  meshId: string
  transformer?: string
  options?: MappingOptions
  createdAt: Date
  updatedAt: Date
}

export interface MappingOptions {
  transformer?: Record<string, string>
}

const MappingSchema = new Schema<IMapping>(
  {
    _id: {
      type: String,
      default: () => randomUUID(),
    },
    sourceField: {
      type: String,
      required: true,
      trim: true,
    },
    targetField: {
      type: String,
      required: true,
      trim: true,
    },
    required: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: String,
      required: true,
      trim: true,
    },
    updatedBy: {
      type: String,
      required: true,
      trim: true,
    },
    meshId: {
      type: String,
      required: true,
      index: true,
    },
    transformer: {
      type: String,
      default: 'copy',
      trim: true,
    },
    options: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: env.MAPPINGS_COLLECTION_NAME,
    autoIndex: false,
    autoCreate: false,
    versionKey: false,
  }
)

export const Mapping = model<IMapping>('Mapping', MappingSchema)
