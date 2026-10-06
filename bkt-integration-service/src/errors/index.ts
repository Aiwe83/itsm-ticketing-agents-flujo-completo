import { toUtcIsoString } from '../utils/date.util'

export enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
}

export enum ErrorCode {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',

  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  NOT_FOUND = 'NOT_FOUND',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',

  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED',

  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  API_ERROR = 'API_ERROR',

  DATABASE_ERROR = 'DATABASE_ERROR',
  DATABASE_CONNECTION_ERROR = 'DATABASE_CONNECTION_ERROR',

  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

interface HttpExceptionOptions {
  code?: ErrorCode
  details?: unknown
  isOperational?: boolean
  headers?: Record<string, string>
  cause?: unknown
}

export class HttpException extends Error {
  public readonly statusCode: number
  public readonly code: ErrorCode
  public readonly isOperational: boolean
  public readonly details?: unknown
  public readonly timestamp: string
  public readonly headers?: Record<string, string>

  constructor(statusCode: number, message: string, options: HttpExceptionOptions = {}) {
    super(message)
    this.statusCode = statusCode
    this.code = options.code ?? ErrorCode.INTERNAL_ERROR
    this.isOperational = options.isOperational ?? true
    this.details = options.details
    this.headers = options.headers
    this.timestamp = toUtcIsoString()

    if (options.cause) {
      this.cause = options.cause as Error
    }

    Object.setPrototypeOf(this, new.target.prototype)
    Error.captureStackTrace?.(this, this.constructor)
  }

  toJSON() {
    return {
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      ...(this.details ? { details: this.details } : {}),
      timestamp: this.timestamp,
    }
  }
}

export class AppError extends HttpException {
  constructor(
    statusCode: number,
    message: string,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    isOperational: boolean = true,
    details?: unknown
  ) {
    super(statusCode, message, { code, isOperational, details })
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(HttpStatusCode.BAD_REQUEST, message, ErrorCode.INVALID_INPUT, true, details)
  }

  static unauthorized(message: string = 'Unauthorized access', details?: unknown): AppError {
    return new AppError(HttpStatusCode.UNAUTHORIZED, message, ErrorCode.UNAUTHORIZED, true, details)
  }

  static forbidden(message: string = 'Forbidden access', details?: unknown): AppError {
    return new AppError(HttpStatusCode.FORBIDDEN, message, ErrorCode.FORBIDDEN, true, details)
  }

  static notFound(message: string = 'Resource not found', details?: unknown): AppError {
    return new AppError(HttpStatusCode.NOT_FOUND, message, ErrorCode.NOT_FOUND, true, details)
  }

  static conflict(message: string = 'Resource already exists', details?: unknown): AppError {
    return new AppError(HttpStatusCode.CONFLICT, message, ErrorCode.ALREADY_EXISTS, true, details)
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(
      HttpStatusCode.BAD_REQUEST,
      message,
      ErrorCode.VALIDATION_ERROR,
      true,
      details
    )
  }

  static invalidCredentials(message: string = 'Invalid credentials'): AppError {
    return new AppError(HttpStatusCode.UNAUTHORIZED, message, ErrorCode.INVALID_CREDENTIALS, true)
  }

  static tokenExpired(message: string = 'Token has expired'): AppError {
    return new AppError(HttpStatusCode.UNAUTHORIZED, message, ErrorCode.TOKEN_EXPIRED, true)
  }

  static tokenInvalid(message: string = 'Invalid token'): AppError {
    return new AppError(HttpStatusCode.UNAUTHORIZED, message, ErrorCode.TOKEN_INVALID, true)
  }

  static internal(message: string = 'Internal server error', details?: unknown): AppError {
    return new AppError(
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      message,
      ErrorCode.INTERNAL_ERROR,
      false,
      details
    )
  }

  static serviceUnavailable(message: string = 'Service unavailable', details?: unknown): AppError {
    return new AppError(
      HttpStatusCode.SERVICE_UNAVAILABLE,
      message,
      ErrorCode.SERVICE_UNAVAILABLE,
      true,
      details
    )
  }

  static externalService(message: string = 'External service error', details?: unknown): AppError {
    return new AppError(
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      message,
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      true,
      details
    )
  }

  static database(message: string = 'Database error', details?: unknown): AppError {
    return new AppError(
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      message,
      ErrorCode.DATABASE_ERROR,
      false,
      details
    )
  }

  static businessRule(message: string, details?: unknown): AppError {
    return new AppError(
      HttpStatusCode.UNPROCESSABLE_ENTITY,
      message,
      ErrorCode.BUSINESS_RULE_VIOLATION,
      true,
      details
    )
  }

  static rateLimitExceeded(message: string = 'Too many requests', details?: unknown): AppError {
    return new AppError(
      HttpStatusCode.TOO_MANY_REQUESTS,
      message,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      true,
      details
    )
  }
}

export function isOperationalError(error: unknown): error is HttpException {
  return error instanceof HttpException && error.isOperational
}
