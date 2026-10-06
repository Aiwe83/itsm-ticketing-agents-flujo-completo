import {
  buildMappingLogicalId,
  projectCatalogMapping,
  validateMappingCatalog,
  type CatalogMappingEntry,
  type MappingCatalog,
} from '../services/mapping-catalog.service'

const meshId = '6a323e68-6f87-403a-a87d-72da69fcde0d'

const baseMapping = (overrides: Partial<CatalogMappingEntry> = {}): CatalogMappingEntry => ({
  sourceField: 'key',
  targetField: 'itsmTicketId',
  transformer: 'copy',
  required: true,
  description: 'Ticket key',
  options: {},
  createdBy: 'catalog',
  updatedBy: 'catalog',
  ...overrides,
})

const baseCatalog = (overrides: Partial<MappingCatalog> = {}): MappingCatalog => ({
  catalogVersion: '1.0.0',
  context: { meshId },
  mappings: [baseMapping()],
  ...overrides,
})

describe('validateMappingCatalog', () => {
  it('accepts a valid catalog', () => {
    expect(() => validateMappingCatalog(baseCatalog())).not.toThrow()
  })

  it('rejects a missing catalogVersion', () => {
    const catalog = baseCatalog({ catalogVersion: '' })
    expect(() => validateMappingCatalog(catalog)).toThrow(/catalogVersion is missing/)
  })

  it('rejects the removed legacy target content.statusSp', () => {
    const catalog = baseCatalog({
      mappings: [baseMapping({ targetField: 'content.statusSp' })],
    })
    expect(() => validateMappingCatalog(catalog)).toThrow(/content\.statusSp/)
  })

  it('rejects a generic "fields" sourceField', () => {
    const catalog = baseCatalog({
      mappings: [baseMapping({ sourceField: 'fields' })],
    })
    expect(() => validateMappingCatalog(catalog)).toThrow(/too generic/)
  })

  it('rejects duplicated targetField across mappings', () => {
    const catalog = baseCatalog({
      mappings: [
        baseMapping({ sourceField: 'key', targetField: 'itsmTicketId' }),
        baseMapping({ sourceField: 'fields.key', targetField: 'itsmTicketId' }),
      ],
    })
    expect(() => validateMappingCatalog(catalog)).toThrow(/duplicated/)
  })

  it('rejects an unknown transformer', () => {
    const catalog = baseCatalog({
      mappings: [baseMapping({ transformer: 'uppercase' })],
    })
    expect(() => validateMappingCatalog(catalog)).toThrow(/not in the allowed list/)
  })
})

describe('projectCatalogMapping', () => {
  it('strips documentary properties and keeps only the Mongo-facing shape', () => {
    const entry = baseMapping({
      _evidence: { source: 'ticket-example', confidence: 'confirmed' },
    } as Partial<CatalogMappingEntry>)

    const projected = projectCatalogMapping(entry, meshId)

    expect(projected).not.toHaveProperty('_evidence')
    expect(projected).toMatchObject({
      meshId,
      sourceField: 'key',
      targetField: 'itsmTicketId',
      transformer: 'copy',
      required: true,
      createdBy: 'catalog',
      updatedBy: 'catalog',
    })
  })

  it('derives a stable logical id from meshId, sourceField and targetField', () => {
    const entry = baseMapping()
    const projected = projectCatalogMapping(entry, meshId)
    const expectedId = buildMappingLogicalId({
      meshId,
      sourceField: entry.sourceField,
      targetField: entry.targetField,
    })

    expect(projected._id).toBe(expectedId)
  })
})
