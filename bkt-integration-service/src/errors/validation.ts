import { ZodError, core } from 'zod'
import { AppError, ErrorCode, HttpStatusCode } from './index'

type ZodIssue = core.$ZodIssue
type IssueOf<Code extends ZodIssue['code']> = Extract<ZodIssue, { code: Code }>

const formatPath = (path: (string | number | symbol)[]): string =>
  path.length ? path.join('.') : 'payload'

const buildDetails = <T extends ZodIssue>(issue: T) => ({
  ...issue,
  code: issue.code,
  path: issue.path,
  message: issue.message,
})

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(HttpStatusCode.BAD_REQUEST, message, ErrorCode.VALIDATION_ERROR, true, details)
  }
}

export class InvalidTypeValidationError extends ValidationError {
  constructor(issue: IssueOf<'invalid_type'>) {
    const expected = issue.expected
    const message =
      issue.message ||
      `Invalid type at ${formatPath(issue.path)}${expected ? `, expected ${expected}` : ''}`
    super(message, buildDetails(issue))
  }
}

export class TooBigValidationError extends ValidationError {
  constructor(issue: IssueOf<'too_big'>) {
    const message =
      issue.message ||
      `Value at ${formatPath(issue.path)} must be ${
        issue.exact ? 'equal to' : issue.inclusive ? '≤' : '<'
      } ${issue.maximum}`
    super(message, buildDetails(issue))
  }
}

export class TooSmallValidationError extends ValidationError {
  constructor(issue: IssueOf<'too_small'>) {
    const message =
      issue.message ||
      `Value at ${formatPath(issue.path)} must be ${
        issue.exact ? 'equal to' : issue.inclusive ? '≥' : '>'
      } ${issue.minimum}`
    super(message, buildDetails(issue))
  }
}

export class InvalidFormatValidationError extends ValidationError {
  constructor(issue: IssueOf<'invalid_format'>) {
    const message =
      issue.message || `Value at ${formatPath(issue.path)} does not match format ${issue.format}`
    super(message, buildDetails(issue))
  }
}

export class NotMultipleOfValidationError extends ValidationError {
  constructor(issue: IssueOf<'not_multiple_of'>) {
    const message =
      issue.message || `Value at ${formatPath(issue.path)} must be a multiple of ${issue.divisor}`
    super(message, buildDetails(issue))
  }
}

export class UnrecognizedKeysValidationError extends ValidationError {
  constructor(issue: IssueOf<'unrecognized_keys'>) {
    const message =
      issue.message || `Unrecognized keys in ${formatPath(issue.path)}: ${issue.keys.join(', ')}`
    super(message, buildDetails(issue))
  }
}

export class InvalidUnionValidationError extends ValidationError {
  constructor(issue: IssueOf<'invalid_union'>) {
    const message =
      issue.message || `Value at ${formatPath(issue.path)} does not match any allowed union option`
    super(message, buildDetails(issue))
  }
}

export class InvalidKeyValidationError extends ValidationError {
  constructor(issue: IssueOf<'invalid_key'>) {
    const message = issue.message || `Invalid key in ${issue.origin} at ${formatPath(issue.path)}`
    super(message, buildDetails(issue))
  }
}

export class InvalidElementValidationError extends ValidationError {
  constructor(issue: IssueOf<'invalid_element'>) {
    const message =
      issue.message || `Invalid element in ${issue.origin} at ${formatPath(issue.path)}`
    super(message, buildDetails(issue))
  }
}

export class InvalidValueValidationError extends ValidationError {
  constructor(issue: IssueOf<'invalid_value'>) {
    const message =
      issue.message ||
      `Invalid value at ${formatPath(issue.path)}${
        issue.values?.length ? ` (expected one of: ${issue.values.join(', ')})` : ''
      }`
    super(message, buildDetails(issue))
  }
}

export class CustomValidationError extends ValidationError {
  constructor(issue: IssueOf<'custom'>) {
    const message = issue.message || `Validation failed at ${formatPath(issue.path)}`
    super(message, buildDetails(issue))
  }
}

export class UnknownValidationError extends ValidationError {
  constructor(issue: ZodIssue) {
    super(issue.message || 'Validation failed', buildDetails(issue))
  }
}

export class AggregateValidationError extends ValidationError {
  public readonly errors: ValidationError[]

  constructor(errors: ValidationError[]) {
    super('Multiple validation errors occurred', {
      errors: errors.map(error => ({
        type: error.constructor.name,
        message: error.message,
        details: error.details,
      })),
    })
    this.errors = errors
  }
}

const mapIssueToError = (issue: ZodIssue): ValidationError => {
  switch (issue.code) {
    case 'invalid_type':
      return new InvalidTypeValidationError(issue)
    case 'too_big':
      return new TooBigValidationError(issue)
    case 'too_small':
      return new TooSmallValidationError(issue)
    case 'invalid_format':
      return new InvalidFormatValidationError(issue)
    case 'not_multiple_of':
      return new NotMultipleOfValidationError(issue)
    case 'unrecognized_keys':
      return new UnrecognizedKeysValidationError(issue)
    case 'invalid_union':
      return new InvalidUnionValidationError(issue)
    case 'invalid_key':
      return new InvalidKeyValidationError(issue)
    case 'invalid_element':
      return new InvalidElementValidationError(issue)
    case 'invalid_value':
      return new InvalidValueValidationError(issue)
    case 'custom':
      return new CustomValidationError(issue)
    default:
      return new UnknownValidationError(issue)
  }
}

export const createValidationErrorFromIssue = (issue: ZodIssue): ValidationError =>
  mapIssueToError(issue)

export const createValidationErrorFromZodError = (error: ZodError): ValidationError => {
  const validationErrors = error.issues.map(mapIssueToError)
  return validationErrors.length === 1
    ? validationErrors[0]
      ? validationErrors[0]
      : new AggregateValidationError(validationErrors)
    : new AggregateValidationError(validationErrors)
}
