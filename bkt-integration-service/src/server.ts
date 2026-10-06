import { createApp } from './app'
import { database } from './config/database'
import { ensureDatabaseIndexes } from './config/database-indexes'
import { env } from './config/environment'
import logger from './config/logger'

const startServer = async (): Promise<void> => {
  try {
    await database.connect()
    await ensureDatabaseIndexes()

    const app = createApp()

    const server = app.listen(env.get('PORT'), () => {})

    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} received. Starting graceful shutdown...`)

      server.close(async () => {
        logger.info('HTTP server closed')

        try {
          await database.disconnect()
          logger.info('Database connection closed')
          process.exit(0)
        } catch (error) {
          logger.error({ err: error }, 'Error during shutdown')
          process.exit(1)
        }
      })

      setTimeout(() => {
        logger.error('Forced shutdown after timeout')
        process.exit(1)
      }, 10000)
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))

    process.on('uncaughtException', (error: Error) => {
      logger.fatal({ err: error }, 'Uncaught Exception')
      gracefulShutdown('uncaughtException')
    })

    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logger.fatal({ reason, promise }, 'Unhandled Promise Rejection')
      gracefulShutdown('unhandledRejection')
    })
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server')
    process.exit(1)
  }
}

startServer()
