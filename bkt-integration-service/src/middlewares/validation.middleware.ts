import { NextFunction, Request, Response } from 'express'
import { ZodError, ZodObject } from 'zod'
import { createValidationErrorFromZodError } from '../errors/validation'

export const validate = (schema: ZodObject) => {
  return async (req: Request, _: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      })

      next()
    } catch (error) {
      if (error instanceof ZodError) {
        return next(createValidationErrorFromZodError(error))
      }
      next(error)
    }
  }
}
