import { NextFunction, Request, Response } from 'express'
import { env } from '../config/environment'
import logger from '../config/logger'
import { AppError, ErrorCode, HttpStatusCode } from '../errors'
import { toUtcIsoString } from '../utils/date.util'

interface ErrorResponse {
  success: false
  error: {
    message: string
    code: string
    statusCode: number
    details?: any
    timestamp: string
    requestId?: string
    path?: string
  }
}

export const exceptionHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (
    err instanceof SyntaxError &&
    'status' in err &&
    'body' in err &&
    (err as SyntaxError & { status?: number }).status === HttpStatusCode.BAD_REQUEST
  ) {
    exceptionHandler(
      new AppError(
        HttpStatusCode.BAD_REQUEST,
        'Malformed JSON body',
        ErrorCode.VALIDATION_ERROR,
        true
      ),
      req,
      res,
      _next
    )
    return
  }

  const isAppError = err instanceof AppError
  let statusCode = isAppError ? err.statusCode : HttpStatusCode.INTERNAL_SERVER_ERROR
  let message = isAppError ? err.message : 'Internal Server Error'
  let code = isAppError ? err.code : ErrorCode.INTERNAL_ERROR
  let details: any = isAppError ? err.details : undefined
  const timestamp = toUtcIsoString()

  const requestContext = {
    ...(req.requestId ? { requestId: req.requestId } : {}),
    path: req.path,
    method: req.method,
  }

  if (isAppError) {
    const logPayload = {
      ...requestContext,
      err: err.toJSON ? err.toJSON() : { message, code, statusCode, details },
      ...(err.isOperational ? {} : { stack: err.stack }),
    }

    const logMessage = err.isOperational ? 'AppError' : 'AppError (non-operational)'
    err.isOperational ? logger.warn(logPayload, logMessage) : logger.error(logPayload, logMessage)
  } else {
    logger.error(
      {
        ...requestContext,
        err,
        stack: err.stack,
      },
      `Unexpected error: ${err.message}`
    )

    if ((env.IS_DEVELOPMENT || env.IS_LOCAL) && err.message) {
      message = err.message
    } else {
      message = 'Internal Server Error'
    }
  }

  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      message,
      code,
      statusCode,
      timestamp,
      ...(req.requestId && { requestId: req.requestId }),
      path: req.path,
      ...(details && { details }),
    },
  }

  res.status(statusCode).json(errorResponse)
}

export const notFoundHandler = (req: Request, res: Response): void => {
  const message = `Route ${req.originalUrl} not found`
  logger.warn(
    {
      ...(req.requestId && { requestId: req.requestId }),
      path: req.path,
      method: req.method,
    },
    message
  )

  res.status(HttpStatusCode.NOT_FOUND).json({
    success: false,
    error: {
      message,
      code: ErrorCode.NOT_FOUND,
      statusCode: HttpStatusCode.NOT_FOUND,
      timestamp: toUtcIsoString(),
      ...(req.requestId && { requestId: req.requestId }),
      path: req.originalUrl,
    },
  })
}

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
