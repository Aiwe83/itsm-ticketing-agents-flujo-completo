import cors from 'cors'
import type { Application } from 'express'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { env } from './config/environment'
import { exceptionHandler, notFoundHandler } from './middlewares/error.middleware'
import { httpLogger, requestIdMiddleware } from './middlewares/logger.middleware'
import routes from './routes'

export const createApp = (): Application => {
  const app: Application = express()
  app.set('trust proxy', 1)

  app.use(
    helmet({
      contentSecurityPolicy: env.IS_PRODUCTION,
      crossOriginEmbedderPolicy: env.IS_PRODUCTION,
    })
  )

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: env.CORS_CREDENTIALS,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', env.API_KEY_HEADER],
    })
  )

  // TODO: Cuando haya autenticación y eso, habría que implementar algún rate limit por usuario, no por IP.
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    message: {
      success: false,
      error: {
        message: 'Too many requests from this IP, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
  })

  app.use('/api/', limiter)

  app.use(requestIdMiddleware)

  app.use(httpLogger)

  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))

  app.use(routes)
  app.use(notFoundHandler)

  app.use(exceptionHandler)

  return app
}
