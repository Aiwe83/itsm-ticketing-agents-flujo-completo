export const ORCHESTRATOR_RETRY_LIMIT = 3
export const ORCHESTRATOR_RETRY_BASE_DELAY_MS = 500
export const ORCHESTRATOR_RETRY_MAX_DELAY_MS = 4000

export const ORCHESTRATOR_RETRY_METHODS = ['POST'] as const

export const ORCHESTRATOR_RETRY_STATUS_CODES = [
  408,
  429,
  500,
  502,
  503,
  504,
] as const

export const ORCHESTRATOR_RETRY_ERROR_CODES = [
  'ETIMEDOUT',
  'ECONNRESET',
  'EADDRINUSE',
  'ECONNREFUSED',
  'EPIPE',
  'ENOTFOUND',
  'ENETUNREACH',
  'EAI_AGAIN',
] as const

export interface RetryDelayInput {
  attemptCount: number
  retryLimit?: number
}

export interface RetryTraceInput {
  attemptCount: number
  retryLimit: number
  delayMs: number
  statusCode?: number
  errorCode?: string
}

export type RetryTraceHandler = (trace: RetryTraceInput) => void

export const shouldRetryOrchestratorStatus = (statusCode: number): boolean =>
  ORCHESTRATOR_RETRY_STATUS_CODES.includes(
    statusCode as (typeof ORCHESTRATOR_RETRY_STATUS_CODES)[number]
  )

export const shouldRetryOrchestratorErrorCode = (errorCode: string): boolean =>
  ORCHESTRATOR_RETRY_ERROR_CODES.includes(
    errorCode as (typeof ORCHESTRATOR_RETRY_ERROR_CODES)[number]
  )

export const calculateOrchestratorRetryDelay = ({
  attemptCount,
  retryLimit = ORCHESTRATOR_RETRY_LIMIT,
}: RetryDelayInput): number => {
  if (attemptCount > retryLimit) {
    return 0
  }

  return Math.min(
    ORCHESTRATOR_RETRY_BASE_DELAY_MS * 2 ** (attemptCount - 1),
    ORCHESTRATOR_RETRY_MAX_DELAY_MS
  )
}

export const createOrchestratorRetryOptions = (onRetry?: RetryTraceHandler) => ({
  limit: ORCHESTRATOR_RETRY_LIMIT,
  methods: [...ORCHESTRATOR_RETRY_METHODS],
  statusCodes: [...ORCHESTRATOR_RETRY_STATUS_CODES],
  errorCodes: [...ORCHESTRATOR_RETRY_ERROR_CODES],
  calculateDelay: ({
    attemptCount,
    retryOptions,
    error,
  }: {
    attemptCount: number
    retryOptions: { limit: number }
    error?: { response?: { statusCode?: number }; code?: string }
  }) => {
    const delayMs = calculateOrchestratorRetryDelay({
      attemptCount,
      retryLimit: retryOptions.limit,
    })

    if (delayMs > 0) {
      onRetry?.({
        attemptCount,
        retryLimit: retryOptions.limit,
        delayMs,
        statusCode: error?.response?.statusCode,
        errorCode: error?.code,
      })
    }

    return delayMs
  },
})
