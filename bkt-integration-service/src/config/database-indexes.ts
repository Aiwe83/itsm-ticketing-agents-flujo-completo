import logger from './logger'
import { ITSMTicket } from '../models/ITSMTicket.model'
import { Execution } from '../models/Execution.model'
import { Mapping } from '../models/Mapping.model'
import { Ticket } from '../models/Ticket.model'

export const ensureDatabaseIndexes = async (): Promise<void> => {
  await ITSMTicket.collection.createIndex({ status: 1 }, { name: 'status_1' })
  await ITSMTicket.collection.createIndex({ meshId: 1 }, { name: 'meshId_1' })
  await Ticket.collection.createIndex({ meshId: 1 }, { name: 'meshId_1' })

  const duplicateTickets = await Ticket.collection
    .aggregate([
      { $group: { _id: { meshId: '$meshId', itsmTicketId: '$itsmTicketId' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray()

  if (duplicateTickets.length > 0) {
    logger.warn(
      { duplicates: duplicateTickets.length },
      'Skipping unique meshId+itsmTicketId index on tickets: duplicates exist'
    )
  } else {
    await Ticket.collection.createIndex(
      { meshId: 1, itsmTicketId: 1 },
      { name: 'meshId_1_itsmTicketId_1', unique: true }
    )
  }
  await Execution.collection.createIndex({ meshId: 1 }, { name: 'meshId_1' })
  await Mapping.collection.createIndex({ meshId: 1 }, { name: 'meshId_1' })
  await Mapping.collection.createIndex(
    { meshId: 1, sourceField: 1, targetField: 1 },
    { name: 'meshId_1_sourceField_1_targetField_1', unique: true }
  )
}
