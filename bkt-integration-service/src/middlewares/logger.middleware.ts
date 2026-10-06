import { NextFunction, Request, Response } from 'express'
import type { IncomingMessage, ServerResponse } from 'http'
import pinoHttp from 'pino-http'
import { v4 as uuidv4 } from 'uuid'
import logger from '../config/logger'

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existingId = req.id ?? req.headers['x-request-id']
    if (existingId) return existingId
    const id = uuidv4()
    res.setHeader('X-Request-Id', id)
    return id
  },
  customLogLevel: (
    _: IncomingMessage,
    res: ServerResponse<IncomingMessage>,
    err: Error | undefined
  ) => {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      return 'warn'
    } else if (res.statusCode >= 500 || err) {
      return 'error'
    } else if (res.statusCode >= 300 && res.statusCode < 400) {
      return 'info'
    }
    return 'info'
  },
  customSuccessMessage: (
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage>,
    responseTime: number
  ) => {
    return `${req.method} ${req.url} ${res.statusCode} - ${responseTime}ms`
  },
  customErrorMessage: (req: IncomingMessage, res: ServerResponse<IncomingMessage>, err: Error) => {
    return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`
  },
  customAttributeKeys: {
    req: 'request',
    res: 'response',
    err: 'error',
    responseTime: 'duration',
  },
  serializers: {
    req: req => ({
      id: req.id,
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
      headers: {
        host: req.headers.host,
        userAgent: req.headers['user-agent'],
        referer: req.headers.referer,
      },
    }),
    res: res => ({
      statusCode: res.statusCode,
    }),
  },
})

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4()
  req.requestId = requestId
  res.setHeader('X-Request-Id', requestId)
  next()
}
