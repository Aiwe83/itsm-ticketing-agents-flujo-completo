import { randomUUID } from 'node:crypto'
import { env } from '../config/environment'
import { Mapping } from '../models/Mapping.model'
import {
  buildMappingLogicalId,
  syncMappingCatalog,
  type MappingCatalog,
} from '../services/mapping-catalog.service'

const meshId = env.MESH_ID

const buildCatalog = (overrides: Partial<MappingCatalog> = {}): MappingCatalog => ({
  catalogVersion: '1.0.0',
  context: { meshId },
  mappings: [
    {
      sourceField: 'key',
      targetField: 'itsmTicketId',
      transformer: 'copy',
      required: true,
      description: 'Ticket key',
      options: {},
      createdBy: 'catalog',
      updatedBy: 'catalog',
    },
    {
      sourceField: 'fields.summary',
      targetField: 'content.title',
      transformer: 'copy',
      required: false,
      description: 'Ticket title',
      options: {},
      createdBy: 'catalog',
      updatedBy: 'catalog',
    },
  ],
  ...overrides,
})

describe('syncMappingCatalog', () => {
  it('reports everything as added on an empty Mongo and writes nothing on dry-run', async () => {
    const summary = await syncMappingCatalog(buildCatalog(), { mode: 'dry-run' })

    expect(summary).toMatchObject({ added: 2, updated: 0, unchanged: 0, conflicts: [], mongoOnly: [] })
    await expect(Mapping.countDocuments()).resolves.toBe(0)
  })

  it('applies with the correct version and a second dry-run reports everything unchanged', async () => {
    const applySummary = await syncMappingCatalog(buildCatalog(), {
      mode: 'apply',
      confirmVersion: '1.0.0',
    })
    expect(applySummary).toMatchObject({ added: 2, updated: 0 })
    await expect(Mapping.countDocuments()).resolves.toBe(2)

    const secondDryRun = await syncMappingCatalog(buildCatalog(), { mode: 'dry-run' })
    expect(secondDryRun).toMatchObject({ added: 0, updated: 0, unchanged: 2 })
  })

  it('applying twice keeps the same _id and does not duplicate documents', async () => {
    await syncMappingCatalog(buildCatalog(), { mode: 'apply', confirmVersion: '1.0.0' })
    const firstIds = (await Mapping.find().exec()).map(document => document._id).sort()

    await syncMappingCatalog(buildCatalog(), { mode: 'apply', confirmVersion: '1.0.0' })
    const secondIds = (await Mapping.find().exec()).map(document => document._id).sort()

    expect(secondIds).toEqual(firstIds)
    await expect(Mapping.countDocuments()).resolves.toBe(2)
  })

  it('updates an existing document with a legacy random UUID in place instead of duplicating it', async () => {
    const legacyId = randomUUID()
    await Mapping.create({
      _id: legacyId,
      meshId,
      sourceField: 'key',
      targetField: 'itsmTicketId',
      transformer: 'copy',
      required: false,
      description: 'Old description',
      options: {},
      createdBy: 'manual',
      updatedBy: 'manual',
    })

    const summary = await syncMappingCatalog(buildCatalog(), { mode: 'apply', confirmVersion: '1.0.0' })
    expect(summary).toMatchObject({ added: 1, updated: 1 })

    const documents = await Mapping.find().exec()
    expect(documents).toHaveLength(2)
    const updated = documents.find(document => document.sourceField === 'key')
    expect(updated?._id).toBe(legacyId)
    expect(updated?.required).toBe(true)
  })

  it('reports a Mongo-only document as drift without touching it on apply', async () => {
    await Mapping.create({
      _id: randomUUID(),
      meshId,
      sourceField: 'fields.assignee.accountId',
      targetField: 'content.technicianInfo.userId',
      transformer: 'copy',
      required: false,
      description: 'Assignee account id',
      options: {},
      createdBy: 'manual',
      updatedBy: 'manual',
    })

    const summary = await syncMappingCatalog(buildCatalog(), { mode: 'apply', confirmVersion: '1.0.0' })
    expect(summary.mongoOnly).toEqual(['fields.assignee.accountId -> content.technicianInfo.userId'])

    const stillThere = await Mapping.findOne({ sourceField: 'fields.assignee.accountId' }).exec()
    expect(stillThere).not.toBeNull()
    expect(stillThere?.updatedBy).toBe('manual')
  })

  it('rejects apply with a missing or incorrect confirm-version and writes nothing', async () => {
    await expect(syncMappingCatalog(buildCatalog(), { mode: 'apply' })).rejects.toThrow(
      /confirm-version/
    )
    await expect(
      syncMappingCatalog(buildCatalog(), { mode: 'apply', confirmVersion: '0.9.0' })
    ).rejects.toThrow(/confirm-version/)
    await expect(Mapping.countDocuments()).resolves.toBe(0)
  })

  it('rejects a catalog whose context meshId does not match env.MESH_ID and writes nothing', async () => {
    const catalog = buildCatalog({ context: { meshId: 'other-mesh' } })

    await expect(
      syncMappingCatalog(catalog, { mode: 'apply', confirmVersion: '1.0.0' })
    ).rejects.toThrow(/MESH_ID/)
    await expect(Mapping.countDocuments()).resolves.toBe(0)
  })

  it('never writes when duplicate Mongo documents share the same logical identity', async () => {
    await Mapping.create([
      {
        _id: randomUUID(),
        meshId,
        sourceField: 'key',
        targetField: 'itsmTicketId',
        transformer: 'copy',
        required: false,
        options: {},
        createdBy: 'manual',
        updatedBy: 'manual',
      },
      {
        _id: randomUUID(),
        meshId,
        sourceField: 'key',
        targetField: 'itsmTicketId',
        transformer: 'copy',
        required: true,
        options: {},
        createdBy: 'manual',
        updatedBy: 'manual',
      },
    ])

    const summary = await syncMappingCatalog(buildCatalog(), { mode: 'apply', confirmVersion: '1.0.0' })
    expect(summary.conflicts.length).toBeGreaterThan(0)
    await expect(Mapping.countDocuments()).resolves.toBe(2)
  })

  it('derives the logical id the same way projectCatalogMapping does', () => {
    const id = buildMappingLogicalId({ meshId, sourceField: 'key', targetField: 'itsmTicketId' })
    expect(id).toMatch(/^map:[0-9a-f]{64}$/)
  })
})
