import { database } from '../config/database'
import { ensureDatabaseIndexes } from '../config/database-indexes'
import logger from '../config/logger'

const run = async (): Promise<void> => {
  try {
    await database.connect()
    await ensureDatabaseIndexes()
    logger.info('MongoDB indexes ensured')
  } finally {
    if (database.isConnected()) {
      await database.disconnect()
    }
  }
}

void run().catch((error: unknown) => {
  logger.error({ err: error }, 'Failed to ensure MongoDB indexes')
  process.exitCode = 1
})
