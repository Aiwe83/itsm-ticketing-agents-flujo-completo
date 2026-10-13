// Named examples embedded in openapi.yaml. Values are illustrative but shaped
// exactly like real payloads/responses - src/__tests__/openapi.test.ts parses
// every one of these against the matching schema in schemas.ts so an example
// can never silently drift from what the schema (and the real API) allows.

export const jiraIssuePayloadExample = {
  initiatedBy: 'postman-demo',
  issues: [
    {
      id: '13401',
      key: 'PA-205',
      fields: {
        summary: 'Incidencia en la cuenta puente GTX',
        description: 'Me da error la cuenta puente intragrupo GTX.',
        issuetype: { name: 'Incidencia' },
        status: { name: 'Recibida' },
        priority: { name: 'Medium' },
        components: 'COMPONENTE 1',
      },
    },
  ],
}

export const issueAcceptedFullSuccessExample = {
  success: true,
  message: 'Issues accepted',
  data: {
    executionId: 'mesh-pilot:PA-205',
    summary: {
      ticketsProcessed: 1,
      ticketsSucceeded: 1,
      ticketsFailed: 0,
      successIntegration: true,
      orchestratorDispatched: true,
    },
    tickets: [
      {
        ticketId: 'PA-205',
        issueId: '13401',
        success: true,
        errors: [],
        issue: jiraIssuePayloadExample.issues[0],
        transformedIssue: {
          meshId: 'mesh-pilot',
          itsmTicketId: '13401',
          ticketType: 'Incidencia',
          content: {
            title: 'Incidencia en la cuenta puente GTX',
            issueDescription: 'Me da error la cuenta puente intragrupo GTX.',
            status: 'Recibida',
            severityLevel: '3',
            attachedDocuments: [],
          },
        },
        receivedAt: '2026-08-06T09:15:32.000Z',
        storedTicketId: 'mesh-pilot:PA-205',
      },
    ],
  },
}

export const issueAcceptedPartialFailureExample = {
  success: true,
  message: 'Issues accepted',
  data: {
    executionId: 'mesh-pilot:PA-206',
    summary: {
      ticketsProcessed: 1,
      ticketsSucceeded: 0,
      ticketsFailed: 1,
      successIntegration: false,
      orchestratorDispatched: false,
    },
    tickets: [
      {
        ticketId: 'PA-206',
        issueId: '13402',
        success: false,
        errors: [
          {
            function: 'issueService.processIssues',
            errorMessage: 'Missing required value for mapping content.title',
            timestamp: '2026-08-06T09:16:01.000Z',
          },
        ],
        issue: {
          id: '13402',
          key: 'PA-206',
          fields: { summary: 'Ticket sin campo obligatorio mapeado' },
        },
        receivedAt: '2026-08-06T09:16:01.000Z',
        storedTicketId: 'mesh-pilot:PA-206',
      },
    ],
  },
}

export const validationErrorSingleIssueExample = {
  success: false,
  error: {
    message: 'Value at issues.0.key must be >= 1',
    code: 'VALIDATION_ERROR',
    statusCode: 400,
    details: {
      code: 'too_small',
      path: ['issues', 0, 'key'],
      message: 'Value at issues.0.key must be >= 1',
    },
    timestamp: '2026-08-06T09:10:00.000Z',
    requestId: '7c3a5e2e-1b3a-4b7a-9c2a-2e6a9d9e0a1f',
    path: '/api/v1/issues',
  },
}

export const validationErrorMultipleIssuesExample = {
  success: false,
  error: {
    message: 'Multiple validation errors occurred',
    code: 'VALIDATION_ERROR',
    statusCode: 400,
    details: {
      errors: [
        {
          type: 'TooSmallValidationError',
          message: 'Value at issues.0.key must be >= 1',
          details: { path: ['issues', 0, 'key'] },
        },
        {
          type: 'InvalidTypeValidationError',
          message: 'Invalid type at issues.0.fields.summary, expected string',
          details: { path: ['issues', 0, 'fields', 'summary'] },
        },
      ],
    },
    timestamp: '2026-08-06T09:10:00.000Z',
    requestId: '7c3a5e2e-1b3a-4b7a-9c2a-2e6a9d9e0a1f',
    path: '/api/v1/issues',
  },
}

export const rateLimitErrorExample = {
  success: false,
  error: {
    message: 'Too many requests from this IP, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
  },
}

export const healthOkExample = {
  uptime: 12345.67,
  message: 'OK',
  timestamp: '2026-08-06T09:00:00.000Z',
  environment: 'production',
  database: 'connected',
}

export const healthDegradedExample = {
  uptime: 42.1,
  message: 'OK',
  timestamp: '2026-08-06T09:00:00.000Z',
  environment: 'production',
  database: 'disconnected',
}

export const apiRootExample = {
  success: true,
  message: 'Integration service for ITSM Torre de Control',
  version: 'v1',
}
