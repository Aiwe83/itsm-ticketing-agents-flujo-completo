import { Request, Response, Router } from 'express'
import { database } from '../config/database'
import { env } from '../config/environment'
import { apiKeyMiddleware } from '../middlewares/auth.middleware'
import { toUtcIsoString } from '../utils/date.util'
import issueRoutes from './issue.routes'

const router: Router = Router()

router.get(env.HEALTH_CHECK_PATH, (_: Request, res: Response) => {
  const health = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: toUtcIsoString(),
    environment: env.NODE_ENV,
    database: database.isConnected() ? 'connected' : 'disconnected',
  }

  const statusCode = database.isConnected() ? 200 : 503

  res.status(statusCode).json(health)
})

const apiRouter = Router()

apiRouter.get('/', (_: Request, res: Response) => {
  res.json({
    success: true,
    message: env.APP_DESCRIPTION,
    version: env.API_VERSION,
  })
})

apiRouter.use('/issues', issueRoutes)

router.use(`/api/${env.API_VERSION}`, apiKeyMiddleware, apiRouter)

export default router
