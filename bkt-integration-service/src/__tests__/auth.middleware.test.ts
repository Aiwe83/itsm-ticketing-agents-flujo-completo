import { NextFunction, Request, Response } from 'express'
import { AppError, HttpStatusCode } from '../errors'
import { apiKeyMiddleware } from '../middlewares/auth.middleware'

jest.mock('../config/environment', () => ({
  env: { API_KEY_HEADER: 'X-API-KEY', API_KEY: 'correct-secret' },
}))

const buildRequest = (headerValue?: string): Request =>
  ({
    header: (name: string) => (name === 'X-API-KEY' ? headerValue : undefined),
  }) as unknown as Request

describe('apiKeyMiddleware', () => {
  it('rejects a request with no API key header', () => {
    const next = jest.fn() as unknown as NextFunction

    apiKeyMiddleware(buildRequest(undefined), {} as Response, next)

    expect(next).toHaveBeenCalledWith(expect.any(AppError))
    const error = (next as jest.Mock).mock.calls[0][0] as AppError
    expect(error.statusCode).toBe(HttpStatusCode.UNAUTHORIZED)
  })

  it('rejects a request with an incorrect API key using the same message as a missing one', () => {
    const nextMissing = jest.fn() as unknown as NextFunction
    const nextWrong = jest.fn() as unknown as NextFunction

    apiKeyMiddleware(buildRequest(undefined), {} as Response, nextMissing)
    apiKeyMiddleware(buildRequest('wrong-secret'), {} as Response, nextWrong)

    const missingError = (nextMissing as jest.Mock).mock.calls[0][0] as AppError
    const wrongError = (nextWrong as jest.Mock).mock.calls[0][0] as AppError

    expect(wrongError.statusCode).toBe(HttpStatusCode.UNAUTHORIZED)
    expect(wrongError.message).toBe(missingError.message)
    expect(wrongError.code).toBe(missingError.code)
  })

  it('calls next with no error when the API key matches', () => {
    const next = jest.fn() as unknown as NextFunction

    apiKeyMiddleware(buildRequest('correct-secret'), {} as Response, next)

    expect(next).toHaveBeenCalledWith()
  })

  it('rejects an empty API key header the same as a missing one', () => {
    const next = jest.fn() as unknown as NextFunction

    apiKeyMiddleware(buildRequest(''), {} as Response, next)

    expect(next).toHaveBeenCalledWith(expect.any(AppError))
  })
})
