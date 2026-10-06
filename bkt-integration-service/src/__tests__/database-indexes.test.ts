import { ensureDatabaseIndexes } from '../config/database-indexes'
import { Execution } from '../models/Execution.model'
import { ITSMTicket } from '../models/ITSMTicket.model'
import { Mapping } from '../models/Mapping.model'
import { Ticket } from '../models/Ticket.model'

describe('ensureDatabaseIndexes', () => {
  it('creates the status index idempotently', async () => {
    await ensureDatabaseIndexes()
    await ensureDatabaseIndexes()

    const indexes = await ITSMTicket.collection.indexes()
    const statusIndexes = indexes.filter(index => index.name === 'status_1')

    expect(statusIndexes).toHaveLength(1)
    expect(statusIndexes[0]).toMatchObject({
      name: 'status_1',
      key: { status: 1 },
    })

    await expect(ITSMTicket.collection.indexExists('meshId_1')).resolves.toBe(true)
    await expect(Ticket.collection.indexExists('meshId_1')).resolves.toBe(true)
    await expect(Execution.collection.indexExists('meshId_1')).resolves.toBe(true)
    await expect(Mapping.collection.indexExists('meshId_1')).resolves.toBe(true)
    await expect(
      Mapping.collection.indexExists('meshId_1_sourceField_1_targetField_1')
    ).resolves.toBe(true)
    await expect(Ticket.collection.indexExists('meshId_1_itsmTicketId_1')).resolves.toBe(true)
  })
})
