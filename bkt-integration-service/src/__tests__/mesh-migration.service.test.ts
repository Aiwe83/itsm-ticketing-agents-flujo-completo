import { env } from '../config/environment'
import { projectMeshDocument } from '../services/mesh-migration.service'

describe('projectMeshDocument', () => {
  it('projects a raw ticket to the mesh id and BSON dates', () => {
    const projected = projectMeshDocument(
      'itsm_tickets',
      {
        _id: 'old-id',
        tenantId: 'tenant',
        projectId: 'project',
        itsmId: 'itsm',
        content: { key: 'PA-205', fields: { summary: 'Title' } },
        status: 'received',
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
      },
      env.MESH_ID
    )

    expect(projected).toMatchObject({
      _id: `${env.MESH_ID}:PA-205`,
      document: {
        _id: `${env.MESH_ID}:PA-205`,
        meshId: env.MESH_ID,
        status: 'persisted',
      },
    })
    expect(projected.document).not.toHaveProperty('tenantId')
    expect(projected.document.createdAt).toBeInstanceOf(Date)
    expect(projected.document.updatedAt).toBeInstanceOf(Date)
  })

  it('projects execution ticket references to the new deterministic ticket id', () => {
    const projected = projectMeshDocument(
      'executions',
      {
        _id: 'execution-1',
        tenantId: 'tenant',
        projectId: 'project',
        itsmId: 'itsm',
        initiatedBy: 'test',
        ticketList: [
          {
            itsmTicketRef: 'PA-205',
            transformedTicketId: 'old-translated-id',
            errorList: [{ timestamp: '2026-05-19T00:00:00.000Z' }],
          },
        ],
        error: [{ timestamp: '2026-05-19T00:00:00.000Z' }],
      },
      env.MESH_ID
    )

    expect(projected.document).toMatchObject({
      _id: 'execution-1',
      meshId: env.MESH_ID,
      ticketList: [
        {
          itsmTicketRef: 'PA-205',
          transformedTicketId: `${env.MESH_ID}:PA-205`,
        },
      ],
    })
    expect(projected.document).not.toHaveProperty('tenantId')
    expect((projected.document.error as any[])[0].timestamp).toBeInstanceOf(Date)
  })

  it('reports conflicts when required mapping fields are missing', () => {
    expect(() =>
      projectMeshDocument(
        'mappings',
        {
          _id: 'mapping-1',
          sourceField: 'fields.summary',
          targetField: 'content.title',
          required: true,
        },
        env.MESH_ID
      )
    ).toThrow('Mapping without transformer')
  })
})
