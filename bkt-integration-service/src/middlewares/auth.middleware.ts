import { createHash, timingSafeEqual } from 'node:crypto'
import { NextFunction, Request, Response } from 'express'
import { env } from '../config/environment'
import { AppError } from '../errors'

// Hash both sides before comparing so timingSafeEqual always receives two
// 32-byte buffers - a mismatched header length never short-circuits the
// comparison and never throws (timingSafeEqual requires equal-length inputs).
const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest()

// Same message and status regardless of whether the header was missing or
// simply wrong - distinguishing the two would tell an attacker which kind of
// failure they are looking at.
const reject = (next: NextFunction): void => {
  next(AppError.unauthorized('Missing or invalid API key'))
}

export const apiKeyMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const provided = req.header(env.API_KEY_HEADER)

  if (typeof provided !== 'string' || provided.length === 0) {
    reject(next)
    return
  }

  if (!timingSafeEqual(digest(provided), digest(env.API_KEY))) {
    reject(next)
    return
  }

  next()
}
