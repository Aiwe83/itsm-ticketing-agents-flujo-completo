import type { JiraIssue, JiraIssueEvent } from '../../types';

export const canaries = {
  summary: 'CANARY_SUMMARY_9f2a',
  email: 'CANARY_EMAIL_c71b@example.invalid',
  host: 'https://demo-canary.atlassian.net/browse/CANARY_HOST_82aa',
  displayName: 'CANARY_DISPLAY_NAME_6c2d',
  description: 'CANARY_DESCRIPTION_74ad',
  attachment: 'CANARY_ATTACHMENT_16bb',
  customField: 'CANARY_CUSTOMFIELD_44cc',
  unknown: 'CANARY_UNKNOWN_55dd',
  account: 'CANARY_ACCOUNT_66ee'
} as const;

export const createdEvent: JiraIssueEvent = {
  eventType: 'avi:jira:created:issue',
  selfGenerated: false,
  atlassianId: canaries.account,
  associatedUsers: [
    {
      displayName: canaries.displayName,
      emailAddress: canaries.email
    }
  ],
  issue: {
    id: '10001',
    key: 'BFC-3',
    self: canaries.host,
    fields: {
      summary: canaries.summary,
      description: {
        content: [
          {
            text: canaries.description
          }
        ]
      },
      project: {
        key: 'BFC'
      },
      issuetype: {
        name: 'Task'
      },
      status: {
        name: 'To Do'
      },
      priority: {
        name: 'Medium'
      },
      created: '2026-08-13T10:00:00.000+0000',
      updated: '2026-08-13T10:05:00.000+0000',
      resolutiondate: null,
      customfield_10010: canaries.customField,
      somethingBrandNew: canaries.unknown,
      attachment: [
        {
          id: '30001',
          filename: canaries.attachment,
          content: 'https://demo-canary.atlassian.net/rest/api/3/attachment/content/30001',
          mimeType: 'text/plain',
          size: 512
        }
      ]
    }
  },
  somethingNewAtTopLevel: canaries.unknown
};

export const updatedEvent: JiraIssueEvent = {
  ...createdEvent,
  eventType: 'avi:jira:updated:issue',
  jiraEventTypeName: 'issue_generic',
  changelog: {
    items: [
      {
        field: 'summary',
        fieldId: 'summary',
        fieldtype: 'jira',
        fromString: canaries.summary,
        toString: 'CANARY_SUMMARY_TO_77ff'
      },
      {
        field: 'status',
        fieldId: 'status',
        fieldtype: 'jira',
        from: '1',
        to: '2'
      }
    ]
  }
};

// Ticket tal como lo devuelve GET /rest/api/3/issue/{key}?fields=... (lo que
// lee jira-client.ts). A diferencia del evento, trae descripcion en ADF,
// prioridad, componentes, responsable y adjuntos: todos con marcadores para
// comprobar que llegan al payload pero nunca a la traza.
export const restIssue: JiraIssue = {
  id: '10001',
  key: 'BFC-3',
  self: canaries.host,
  fields: {
    summary: canaries.summary,
    description: {
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: canaries.description }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'paso uno' }] }]
            }
          ]
        }
      ]
    },
    project: { key: 'BFC' },
    issuetype: { name: 'Task' },
    status: { name: 'To Do' },
    priority: { name: 'High' },
    components: [{ id: '10100', name: 'Pagos', self: canaries.host }],
    assignee: {
      accountId: 'account-123',
      emailAddress: canaries.email,
      displayName: canaries.displayName,
      avatarUrls: { '48x48': canaries.host }
    },
    attachment: [
      {
        id: '20001',
        filename: `${canaries.attachment}.txt`,
        mimeType: 'text/plain',
        size: 42,
        content: 'https://demo.example.test/rest/api/3/attachment/content/20001',
        author: { displayName: canaries.displayName }
      },
      { id: '20002', filename: 'sin-url.txt' }
    ],
    created: '2026-08-13T10:00:00.000+0000',
    updated: '2026-08-13T10:05:00.000+0000'
  }
};
