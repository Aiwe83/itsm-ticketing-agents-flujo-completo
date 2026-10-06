import { env } from '../config/environment'
import { database } from '../config/database'
import { parseBsonDate } from '../utils/date.util'

export const MESH_MIGRATION_SOURCE_DB = 'caf_agents'
export const MESH_MIGRATION_TARGET_DB = 'integration-service'
export const MESH_MIGRATION_COLLECTIONS = [
  'itsm_tickets',
  'tickets',
  'executions',
  'mappings',
] as const

export type MigrationCollection = (typeof MESH_MIGRATION_COLLECTIONS)[number]
export type MeshMigrationMode = 'dry-run' | 'apply'
export type MigrationAction = 'added' | 'updated' | 'unchanged' | 'conflict'

export interface MeshMigrationOptions {
  mode: MeshMigrationMode
  confirmTarget?: string
}

export interface MeshMigrationCollectionSummary {
  collection: MigrationCollection
  scanned: number
  added: number
  updated: number
  unchanged: number
  conflicts: string[]
}

export interface MeshMigrationSummary {
  mode: MeshMigrationMode
  sourceDatabase: string
  targetDatabase: string
  meshId: string
  collections: MeshMigrationCollectionSummary[]
}

interface ProjectedDocument {
  _id: string
  document: Record<string, unknown>
}

type MutableDocument = Record<string, any>
type NativeMigrationDocument = Record<string, unknown> & { _id: string }

export const projectMeshDocument = (
  collection: MigrationCollection,
  source: Record<string, unknown>,
  meshId: string
): ProjectedDocument => {
  const document = removeLegacyContext(cloneDocument(source))
  document['meshId'] = meshId
  normalizeKnownDates(collection, document)

  switch (collection) {
    case 'itsm_tickets':
      document['_id'] = buildStoredTicketId(meshId, extractRawTicketKey(document))
      document['status'] = normalizeRawStatus(document['status'])
      break
    case 'tickets':
      document['_id'] = buildStoredTicketId(meshId, extractTranslatedTicketKey(document))
      break
    case 'executions':
      document['ticketList'] = normalizeExecutionTickets(meshId, document['ticketList'])
      break
    case 'mappings':
      validateMappingDocument(document)
      break
    default:
      assertNever(collection)
  }

  if (typeof document['_id'] !== 'string' || document['_id'].trim().length === 0) {
    throw new Error(`Missing _id after projecting ${collection}`)
  }

  return {
    _id: document['_id'],
    document,
  }
}

export const runMeshMigration = async (
  options: MeshMigrationOptions
): Promise<MeshMigrationSummary> => {
  if (options.mode === 'apply' && options.confirmTarget !== MESH_MIGRATION_TARGET_DB) {
    throw new Error(
      `Apply requires --confirm=${MESH_MIGRATION_TARGET_DB}; received ${options.confirmTarget ?? 'empty'}`
    )
  }

  const mongoose = database.getMongoose()
  const mongoClient = mongoose.connection.getClient()
  const sourceDb = mongoClient.db(MESH_MIGRATION_SOURCE_DB)
  const targetDb = mongoClient.db(MESH_MIGRATION_TARGET_DB)
  const summaries: MeshMigrationCollectionSummary[] = []

  for (const collectionName of MESH_MIGRATION_COLLECTIONS) {
    const sourceCollection = sourceDb.collection<NativeMigrationDocument>(collectionName)
    const targetCollection = targetDb.collection<NativeMigrationDocument>(collectionName)
    const sourceDocuments = await sourceCollection.find({}).toArray()
    const summary: MeshMigrationCollectionSummary = {
      collection: collectionName,
      scanned: sourceDocuments.length,
      added: 0,
      updated: 0,
      unchanged: 0,
      conflicts: [],
    }
    const projectedById = new Map<string, Record<string, unknown>>()

    for (const sourceDocument of sourceDocuments) {
      try {
        const projected = projectMeshDocument(collectionName, sourceDocument, env.MESH_ID)
        const previous = projectedById.get(projected._id)

        if (previous && stableStringify(previous) !== stableStringify(projected.document)) {
          summary.conflicts.push(
            `${collectionName}:${projected._id} duplicated with different content`
          )
          continue
        }
        projectedById.set(projected._id, projected.document)

        const existing = await targetCollection.findOne({ _id: projected._id })
        const action = classifyMigrationAction(existing, projected.document)
        incrementSummary(summary, action)

        if (options.mode === 'apply' && action !== 'conflict' && action !== 'unchanged') {
          await targetCollection.replaceOne({ _id: projected._id }, projected.document, {
            upsert: true,
          })
        }
      } catch (error) {
        summary.conflicts.push(
          `${collectionName}:${String(sourceDocument._id ?? 'unknown')}: ${
            error instanceof Error ? error.message : 'Unknown migration error'
          }`
        )
      }
    }

    summaries.push(summary)
  }

  return {
    mode: options.mode,
    sourceDatabase: MESH_MIGRATION_SOURCE_DB,
    targetDatabase: MESH_MIGRATION_TARGET_DB,
    meshId: env.MESH_ID,
    collections: summaries,
  }
}

const cloneDocument = (source: Record<string, unknown>): MutableDocument =>
  structuredClone(source) as MutableDocument

const removeLegacyContext = (document: MutableDocument): MutableDocument => {
  delete document['tenantId']
  delete document['projectId']
  delete document['itsmId']
  return document
}

const buildStoredTicketId = (meshId: string, ticketKey: string): string => `${meshId}:${ticketKey}`

const extractRawTicketKey = (document: MutableDocument): string => {
  const content = document['content'] as Record<string, unknown> | undefined
  const ticketKey = content?.['key'] ?? document['key']
  if (typeof ticketKey === 'string' && ticketKey.trim().length > 0) return ticketKey
  throw new Error('Raw ticket without Jira key')
}

const extractTranslatedTicketKey = (document: MutableDocument): string => {
  const content = document['content'] as Record<string, unknown> | undefined
  const ticketKey = document['itsmTicketId'] ?? content?.['key']
  if (typeof ticketKey === 'string' && ticketKey.trim().length > 0) return ticketKey
  throw new Error('Translated ticket without ITSM ticket reference')
}

const normalizeRawStatus = (status: unknown): 'persisted' | 'translated' | 'failed' => {
  if (status === 'translated' || status === 'failed') return status
  return 'persisted'
}

const normalizeExecutionTickets = (meshId: string, ticketList: unknown): unknown[] => {
  if (!Array.isArray(ticketList)) return []

  return ticketList.map(ticket => {
    const normalized = removeLegacyContext(cloneDocument(ticket as Record<string, unknown>))
    const ticketKey = normalized['itsmTicketRef']

    if (typeof ticketKey === 'string' && ticketKey.trim().length > 0) {
      normalized['transformedTicketId'] = buildStoredTicketId(meshId, ticketKey)
    }

    if (Array.isArray(normalized['errorList'])) {
      normalized['errorList'] = normalized['errorList'].map((error: Record<string, unknown>) =>
        normalizeErrorDate(error)
      )
    }

    return normalized
  })
}

const validateMappingDocument = (document: MutableDocument): void => {
  for (const field of ['sourceField', 'targetField', 'transformer', 'required'] as const) {
    if (document[field] === undefined || document[field] === null) {
      throw new Error(`Mapping without ${field}`)
    }
  }
}

const normalizeKnownDates = (collection: MigrationCollection, document: MutableDocument): void => {
  normalizeDateField(document, 'createdAt')
  normalizeDateField(document, 'updatedAt')

  if (collection === 'executions') {
    normalizeDateField(document, 'startTime')
    normalizeDateField(document, 'endTime')

    if (Array.isArray(document['error'])) {
      document['error'] = document['error'].map((error: Record<string, unknown>) =>
        normalizeErrorDate(error)
      )
    }
  }
}

const normalizeErrorDate = (error: Record<string, unknown>): Record<string, unknown> => {
  const normalized = cloneDocument(error)
  normalizeDateField(normalized, 'timestamp')
  return normalized
}

const normalizeDateField = (document: MutableDocument, field: string): void => {
  if (!(field in document)) return
  const parsed = parseBsonDate(document[field], field)
  if (parsed) document[field] = parsed
}

const classifyMigrationAction = (
  existing: Record<string, unknown> | null,
  projected: Record<string, unknown>
): MigrationAction => {
  if (!existing) return 'added'
  return stableStringify(existing) === stableStringify(projected) ? 'unchanged' : 'updated'
}

const incrementSummary = (
  summary: MeshMigrationCollectionSummary,
  action: MigrationAction
): void => {
  switch (action) {
    case 'added':
      summary.added += 1
      break
    case 'updated':
      summary.updated += 1
      break
    case 'unchanged':
      summary.unchanged += 1
      break
    case 'conflict':
      summary.conflicts.push('Conflict detected')
      break
    default:
      assertNever(action)
  }
}

const stableStringify = (value: unknown): string =>
  JSON.stringify(value, (_key, item) => {
    if (item instanceof Date) return item.toISOString()
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item

    return Object.keys(item)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = (item as Record<string, unknown>)[key]
        return accumulator
      }, {})
  })

const assertNever = (value: never): never => {
  throw new Error(`Unsupported migration collection ${String(value)}`)
}
