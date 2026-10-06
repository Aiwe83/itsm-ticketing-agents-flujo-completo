import { sendIssueToIntegrationService } from '../integration-client';
import { findForbiddenContent } from '../sanitize';
import { canaries } from './fixtures/events';
import type { FetchLike, IssuesRequest } from '../types';

const payload: IssuesRequest = {
  initiatedBy: 'bkt-jira-triggers',
  issues: [
    {
      id: '10001',
      key: 'DEMO-1',
      fields: {
        summary: canaries.summary,
        issuetype: {
          name: 'Task'
        }
      }
    }
  ]
};

const runtimeEnv: NodeJS.ProcessEnv = {
  INTEGRATION_SERVICE_BASE_URL: 'https://integration.example.test',
  INTEGRATION_SERVICE_API_KEY: 'SECRET_API_KEY_123',
  INTEGRATION_SERVICE_API_KEY_HEADER: 'X-API-KEY'
};

describe('sendIssueToIntegrationService', () => {
  it('sends the request and classifies success from the response body', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock: FetchLike = async (url, init) => {
      calls.push({ url, init });

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Issues accepted',
          data: {
            executionId: 'execution-1',
            summary: {
              ticketsSucceeded: 1,
              ticketsFailed: 0,
              successIntegration: true,
              orchestratorDispatched: false
            },
            tickets: [
              {
                success: true,
                storedTicketId: 'mesh-pilot:DEMO-1',
                issue: {
                  fields: {
                    summary: canaries.summary
                  }
                }
              }
            ]
          }
        }),
        {
          status: 201,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Id': 'request-echo-1'
          }
        }
      );
    };

    const result = await sendIssueToIntegrationService(payload, 'correlation-1', {
      env: runtimeEnv,
      fetchImpl: fetchMock
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://integration.example.test/api/v1/issues');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      'X-Request-Id': 'correlation-1',
      'X-API-KEY': 'SECRET_API_KEY_123'
    });
    expect(result).toEqual({
      sent: true,
      success: true,
      status: 201,
      requestIdEcho: 'request-echo-1',
      executionId: 'execution-1',
      storedTicketId: 'mesh-pilot:DEMO-1',
      ticketsSucceeded: 1,
      ticketsFailed: 0,
      orchestratorDispatched: false
    });
    expect(JSON.stringify(result)).not.toContain(canaries.summary);
    expect(JSON.stringify(result)).not.toContain('SECRET_API_KEY_123');
    expect(findForbiddenContent(result)).toEqual([]);
  });

  it('fails closed when runtime configuration is missing', async () => {
    await expect(
      sendIssueToIntegrationService(payload, 'correlation-2', {
        env: {
          INTEGRATION_SERVICE_BASE_URL: 'https://integration.example.test'
        }
      })
    ).resolves.toEqual({
      sent: false,
      success: false,
      status: null,
      requestIdEcho: null,
      executionId: null,
      storedTicketId: null,
      ticketsSucceeded: null,
      ticketsFailed: null,
      orchestratorDispatched: null,
      errorKind: 'CONFIG',
      errorCode: 'MISSING_RUNTIME_CONFIG',
      missingConfigKeys: ['INTEGRATION_SERVICE_API_KEY']
    });
  });

  it('classifies application failures even when the service returns 201', async () => {
    const fetchMock: FetchLike = async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            executionId: 'execution-2',
            summary: {
              ticketsSucceeded: 0,
              ticketsFailed: 1,
              successIntegration: false,
              orchestratorDispatched: false
            },
            tickets: [
              {
                success: false,
                storedTicketId: 'mesh-pilot:DEMO-1',
                issue: {
                  fields: {
                    summary: canaries.summary
                  }
                }
              }
            ]
          }
        }),
        {
          status: 201,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Id': 'request-echo-2'
          }
        }
      );

    await expect(
      sendIssueToIntegrationService(payload, 'correlation-3', {
        env: runtimeEnv,
        fetchImpl: fetchMock
      })
    ).resolves.toEqual({
      sent: true,
      success: false,
      status: 201,
      requestIdEcho: 'request-echo-2',
      executionId: 'execution-2',
      storedTicketId: 'mesh-pilot:DEMO-1',
      ticketsSucceeded: 0,
      ticketsFailed: 1,
      orchestratorDispatched: false,
      errorKind: 'APPLICATION',
      errorCode: 'INTEGRATION_REPORTED_FAILURE'
    });
  });

  it('classifies HTTP failures separately from application failures', async () => {
    const fetchMock: FetchLike = async () =>
      new Response(
        JSON.stringify({
          success: false,
          message: 'Internal error',
          data: {
            executionId: 'execution-3',
            summary: {
              ticketsSucceeded: 0,
              ticketsFailed: 1,
              successIntegration: false,
              orchestratorDispatched: false
            },
            tickets: [
              {
                success: false,
                storedTicketId: 'mesh-pilot:DEMO-1'
              }
            ]
          }
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Id': 'request-echo-3'
          }
        }
      );

    await expect(
      sendIssueToIntegrationService(payload, 'correlation-4', {
        env: runtimeEnv,
        fetchImpl: fetchMock
      })
    ).resolves.toEqual({
      sent: true,
      success: false,
      status: 500,
      requestIdEcho: 'request-echo-3',
      executionId: 'execution-3',
      storedTicketId: 'mesh-pilot:DEMO-1',
      ticketsSucceeded: 0,
      ticketsFailed: 1,
      orchestratorDispatched: false,
      errorKind: 'HTTP',
      errorCode: 'HTTP_500',
      diagnostic: {
        host: 'integration.example.test',
        server: null,
        cfRay: null,
        ngrokErrorCode: null,
        bodyHint: null
      }
    });
  });

  it('adds host, infrastructure headers and a short body hint to a bare 403', async () => {
    const fetchMock: FetchLike = async () =>
      new Response('URL not included in the external fetch backend permissions', {
        status: 403,
        headers: { server: 'cloudflare', 'cf-ray': 'abc123-MAD' }
      });

    const result = await sendIssueToIntegrationService(payload, 'correlation-403', {
      env: runtimeEnv,
      fetchImpl: fetchMock
    });

    expect(result).toMatchObject({
      success: false,
      status: 403,
      errorCode: 'HTTP_403',
      diagnostic: {
        host: 'integration.example.test',
        server: 'cloudflare',
        cfRay: 'abc123-MAD',
        ngrokErrorCode: null,
        bodyHint: 'URL not included in the external fetch backend permissions'
      }
    });
    expect(JSON.stringify(result)).not.toContain('SECRET_API_KEY_123');
    expect(findForbiddenContent(result)).toEqual([]);
  });

  it('classifies timeout failures', async () => {
    const fetchMock: FetchLike = async (_url, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });

    await expect(
      sendIssueToIntegrationService(payload, 'correlation-5', {
        env: runtimeEnv,
        fetchImpl: fetchMock,
        timeoutMs: 1
      })
    ).resolves.toEqual({
      sent: true,
      success: false,
      status: null,
      requestIdEcho: null,
      executionId: null,
      storedTicketId: null,
      ticketsSucceeded: null,
      ticketsFailed: null,
      orchestratorDispatched: null,
      errorKind: 'TIMEOUT',
      errorCode: 'REQUEST_TIMEOUT'
    });
  });

  it('classifies network failures', async () => {
    const fetchMock: FetchLike = async () => {
      throw new Error('connect ECONNREFUSED');
    };

    await expect(
      sendIssueToIntegrationService(payload, 'correlation-6', {
        env: runtimeEnv,
        fetchImpl: fetchMock
      })
    ).resolves.toEqual({
      sent: true,
      success: false,
      status: null,
      requestIdEcho: null,
      executionId: null,
      storedTicketId: null,
      ticketsSucceeded: null,
      ticketsFailed: null,
      orchestratorDispatched: null,
      errorKind: 'NETWORK',
      errorCode: 'FETCH_FAILED'
    });
  });
});
