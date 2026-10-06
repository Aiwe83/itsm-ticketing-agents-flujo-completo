import { Request, Response } from 'express'
import logger from '../config/logger'
import { AppError, ErrorCode, HttpStatusCode } from '../errors'
import { exceptionHandler } from '../middlewares/error.middleware'

jest.mock('../config/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}))

const buildResponse = () => {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response

  return response
}

describe('exceptionHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns errors without stack and logs non-operational stack server-side', () => {
    const request = {
      requestId: 'request-1',
      path: '/api/v1/issues',
      method: 'POST',
    } as Request
    const response = buildResponse()
    const error = new AppError(
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      'Persistence failed',
      ErrorCode.DATABASE_ERROR,
      false
    )

    exceptionHandler(error, request, response, jest.fn())

    expect(response.status).toHaveBeenCalledWith(HttpStatusCode.INTERNAL_SERVER_ERROR)
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.not.objectContaining({
          stack: expect.anything(),
        }),
      })
    )
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        }),
      })
    )
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-1',
        method: 'POST',
        path: '/api/v1/issues',
        stack: expect.any(String),
      }),
      'AppError (non-operational)'
    )
  })

  it('handles a plain Error without exposing stack and exposes the message in local mode', () => {
    const request = {
      requestId: 'request-2',
      path: '/api/v1/issues',
      method: 'POST',
    } as Request
    const response = buildResponse()
    const error = new Error('Unexpected boom')

    exceptionHandler(error, request, response, jest.fn())

    expect(response.status).toHaveBeenCalledWith(HttpStatusCode.INTERNAL_SERVER_ERROR)
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          message: 'Unexpected boom',
          code: ErrorCode.INTERNAL_ERROR,
          statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR,
        }),
      })
    )
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.not.objectContaining({
          stack: expect.anything(),
        }),
      })
    )
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-2',
        method: 'POST',
        path: '/api/v1/issues',
        stack: expect.any(String),
      }),
      'Unexpected error: Unexpected boom'
    )
  })
})
