import {
  ORCHESTRATOR_RETRY_ERROR_CODES,
  ORCHESTRATOR_RETRY_LIMIT,
  ORCHESTRATOR_RETRY_METHODS,
  ORCHESTRATOR_RETRY_STATUS_CODES,
  calculateOrchestratorRetryDelay,
  createOrchestratorRetryOptions,
  shouldRetryOrchestratorErrorCode,
  shouldRetryOrchestratorStatus,
} from '../services/orchestrator-retry.policy'

describe('orchestrator retry policy', () => {
  it('retries only transient HTTP statuses', () => {
    expect(ORCHESTRATOR_RETRY_STATUS_CODES).toEqual([408, 429, 500, 502, 503, 504])

    expect(shouldRetryOrchestratorStatus(408)).toBe(true)
    expect(shouldRetryOrchestratorStatus(429)).toBe(true)
    expect(shouldRetryOrchestratorStatus(503)).toBe(true)

    expect(shouldRetryOrchestratorStatus(400)).toBe(false)
    expect(shouldRetryOrchestratorStatus(401)).toBe(false)
    expect(shouldRetryOrchestratorStatus(403)).toBe(false)
    expect(shouldRetryOrchestratorStatus(404)).toBe(false)
    expect(shouldRetryOrchestratorStatus(413)).toBe(false)
  })

  it('retries only transient network error codes', () => {
    expect(ORCHESTRATOR_RETRY_ERROR_CODES).toContain('ETIMEDOUT')
    expect(ORCHESTRATOR_RETRY_ERROR_CODES).toContain('ECONNRESET')
    expect(ORCHESTRATOR_RETRY_ERROR_CODES).toContain('ECONNREFUSED')

    expect(shouldRetryOrchestratorErrorCode('ETIMEDOUT')).toBe(true)
    expect(shouldRetryOrchestratorErrorCode('EAI_AGAIN')).toBe(true)
    expect(shouldRetryOrchestratorErrorCode('ERR_BAD_REQUEST')).toBe(false)
  })

  it('uses bounded exponential backoff and stops after the retry limit', () => {
    expect(calculateOrchestratorRetryDelay({ attemptCount: 1 })).toBe(500)
    expect(calculateOrchestratorRetryDelay({ attemptCount: 2 })).toBe(1000)
    expect(calculateOrchestratorRetryDelay({ attemptCount: 3 })).toBe(2000)
    expect(calculateOrchestratorRetryDelay({ attemptCount: 4 })).toBe(0)
  })

  it('exposes got retry options from the same policy', () => {
    const onRetry = jest.fn()
    const options = createOrchestratorRetryOptions(onRetry)

    expect(options.limit).toBe(ORCHESTRATOR_RETRY_LIMIT)
    expect(options.methods).toEqual([...ORCHESTRATOR_RETRY_METHODS])
    expect(options.statusCodes).toEqual([...ORCHESTRATOR_RETRY_STATUS_CODES])
    expect(options.errorCodes).toEqual([...ORCHESTRATOR_RETRY_ERROR_CODES])
    expect(
      options.calculateDelay({
        attemptCount: 2,
        retryOptions: { limit: ORCHESTRATOR_RETRY_LIMIT },
        error: { response: { statusCode: 503 }, code: 'ECONNRESET' },
      })
    ).toBe(1000)
    expect(onRetry).toHaveBeenCalledWith({
      attemptCount: 2,
      retryLimit: ORCHESTRATOR_RETRY_LIMIT,
      delayMs: 1000,
      statusCode: 503,
      errorCode: 'ECONNRESET',
    })
  })

  it('does not trace retries when the retry limit is exhausted', () => {
    const options = createOrchestratorRetryOptions()

    expect(
      options.calculateDelay({
        attemptCount: ORCHESTRATOR_RETRY_LIMIT + 1,
        retryOptions: { limit: ORCHESTRATOR_RETRY_LIMIT },
      })
    ).toBe(0)
  })
})
