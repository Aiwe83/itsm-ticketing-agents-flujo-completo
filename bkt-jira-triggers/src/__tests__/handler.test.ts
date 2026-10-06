import { deriveEventDate, handleJiraIssueEvent } from '../handler';
import { findForbiddenContent } from '../sanitize';
import type { IntegrationDispatchResult, IssuesRequest, JiraIssueReadResult } from '../types';
import { canaries, createdEvent, restIssue } from './fixtures/events';

const successfulDispatch: IntegrationDispatchResult = {
  sent: true,
  success: true,
  status: 201,
  requestIdEcho: 'request-echo-1',
  executionId: 'execution-1',
  storedTicketId: 'mesh-pilot:BFC-3',
  ticketsSucceeded: 1,
  ticketsFailed: 0,
  orchestratorDispatched: false
};

const readOk = jest
  .fn<Promise<JiraIssueReadResult>, [string]>()
  .mockResolvedValue({ ok: true, status: 200, issue: restIssue });

describe('handleJiraIssueEvent', () => {
  it('emits four log records with the same correlation id when dispatch succeeds', async () => {
    const lines: string[] = [];
    const send = jest
      .fn<Promise<IntegrationDispatchResult>, [IssuesRequest, string]>()
      .mockResolvedValue(successfulDispatch);

    await handleJiraIssueEvent(
      createdEvent,
      { cloudId: 'cloud-1' },
      {
        log: (line) => lines.push(line),
        readIssue: readOk,
        send,
        uuid: () => '00000000-0000-4000-8000-000000000001',
        now: () => new Date('2026-08-13T12:00:00.000Z')
      }
    );

    expect(lines).toHaveLength(4);
    const records = lines.map((line) => JSON.parse(line));
    expect(records.map((record) => record.eventName)).toEqual([
      'jira.event.received',
      'jira.event.shape',
      'jira.contract.payload.built',
      'jira.integration.response'
    ]);
    expect(new Set(records.map((record) => record.correlationId))).toEqual(
      new Set(['00000000-0000-4000-8000-000000000001'])
    );
    expect(readOk).toHaveBeenCalledWith('BFC-3');
    expect(send).toHaveBeenCalledTimes(1);
    // El payload sale del ticket leido por REST: lleva los campos del
    // catalogo de mappings que el evento no trae (descripcion, prioridad
    // real, componentes, responsable, adjuntos con URL valida), ya en la
    // forma que espera el servicio.
    expect(send).toHaveBeenCalledWith(
      {
        initiatedBy: 'bkt-jira-triggers',
        issues: [
          {
            id: '10001',
            key: 'BFC-3',
            fields: {
              summary: canaries.summary,
              issuetype: { name: 'Task' },
              status: { name: 'To Do' },
              project: { key: 'BFC' },
              priority: { name: 'High' },
              created: '2026-08-13T10:00:00.000+0000',
              updated: '2026-08-13T10:05:00.000+0000',
              description: `${canaries.description}\n- paso uno`,
              components: [{ id: '10100', name: 'Pagos' }],
              assignee: {
                accountId: 'account-123',
                emailAddress: canaries.email,
                displayName: canaries.displayName
              },
              attachment: [
                {
                  id: '20001',
                  filename: `${canaries.attachment}.txt`,
                  mimeType: 'text/plain',
                  size: 42,
                  content: 'https://demo.example.test/rest/api/3/attachment/content/20001'
                }
              ]
            }
          }
        ]
      },
      '00000000-0000-4000-8000-000000000001'
    );
    expect(records[2]).toMatchObject({
      eventName: 'jira.contract.payload.built',
      issueSource: 'jira-rest',
      jiraRead: { ok: true, status: 200 },
      contractValid: true
    });
    expect(records[2].payload.issues).toHaveLength(1);
    expect(records[2].payload.issues[0].fields).toEqual({
      issuetype: { name: 'Task' },
      status: { name: 'To Do' },
      project: { key: 'BFC' },
      priority: { name: 'High' },
      created: '2026-08-13T10:00:00.000+0000',
      updated: '2026-08-13T10:05:00.000+0000',
      summary: '[redacted:19]',
      descriptionLength: `${canaries.description}\n- paso uno`.length,
      componentCount: 1,
      assigneePresent: true,
      attachmentCount: 1
    });
    expect(records[3]).toMatchObject({
      eventName: 'jira.integration.response',
      sent: true,
      success: true,
      status: 201,
      requestIdEcho: 'request-echo-1',
      executionId: 'execution-1',
      storedTicketId: 'mesh-pilot:BFC-3',
      ticketsSucceeded: 1,
      ticketsFailed: 0,
      orchestratorDispatched: false
    });
    expect(JSON.stringify(records)).not.toContain(canaries.summary);
    expect(JSON.stringify(records)).not.toContain(canaries.description);
    expect(JSON.stringify(records)).not.toContain(canaries.attachment);
    expect(JSON.stringify(records)).not.toContain(canaries.email);
    expect(JSON.stringify(records)).not.toContain(canaries.displayName);
    expect(findForbiddenContent(records)).toEqual([]);
  });

  it('falls back to the event fields when the Jira read fails', async () => {
    const lines: string[] = [];
    const send = jest
      .fn<Promise<IntegrationDispatchResult>, [IssuesRequest, string]>()
      .mockResolvedValue(successfulDispatch);
    const readFails = jest
      .fn<Promise<JiraIssueReadResult>, [string]>()
      .mockResolvedValue({ ok: false, status: 404, errorCode: 'JIRA_HTTP_404' });

    await handleJiraIssueEvent(
      createdEvent,
      {},
      {
        log: (line) => lines.push(line),
        readIssue: readFails,
        send,
        uuid: () => '00000000-0000-4000-8000-000000000006',
        now: () => new Date('2026-08-13T12:00:00.000Z')
      }
    );

    // Sin lectura por REST se envia igual, solo con lo que trajo el evento
    // (en el evento real de Jira esto nunca incluiria adjuntos — aqui el
    // fixture ya trae uno con URL valida, asi que sobrevive igual).
    expect(send).toHaveBeenCalledWith(
      {
        initiatedBy: 'bkt-jira-triggers',
        issues: [
          {
            id: '10001',
            key: 'BFC-3',
            fields: {
              summary: canaries.summary,
              issuetype: { name: 'Task' },
              status: { name: 'To Do' },
              project: { key: 'BFC' },
              priority: { name: 'Medium' },
              created: '2026-08-13T10:00:00.000+0000',
              updated: '2026-08-13T10:05:00.000+0000',
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
          }
        ]
      },
      '00000000-0000-4000-8000-000000000006'
    );
    expect(JSON.parse(lines[2])).toMatchObject({
      issueSource: 'event',
      jiraRead: { ok: false, status: 404, errorCode: 'JIRA_HTTP_404' },
      contractValid: true
    });
  });

  it('retries the Jira read before dispatching when attachments are not visible yet', async () => {
    const lines: string[] = [];
    const send = jest
      .fn<Promise<IntegrationDispatchResult>, [IssuesRequest, string]>()
      .mockResolvedValue(successfulDispatch);
    const sleep = jest.fn<Promise<void>, [number]>().mockResolvedValue();
    const restIssueWithoutAttachments = {
      ...restIssue,
      fields: {
        ...restIssue.fields,
        attachment: []
      }
    };
    const readIssue = jest
      .fn<Promise<JiraIssueReadResult>, [string]>()
      .mockResolvedValueOnce({ ok: true, status: 200, issue: restIssueWithoutAttachments })
      .mockResolvedValueOnce({ ok: true, status: 200, issue: restIssue });

    await handleJiraIssueEvent(
      createdEvent,
      {},
      {
        log: (line) => lines.push(line),
        readIssue,
        send,
        sleep,
        attachmentRetryDelaysMs: [25],
        uuid: () => '00000000-0000-4000-8000-000000000007',
        now: () => new Date('2026-08-13T12:00:00.000Z')
      }
    );

    expect(readIssue).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(25);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].issues[0].fields.attachment).toEqual([
      {
        id: '20001',
        filename: `${canaries.attachment}.txt`,
        mimeType: 'text/plain',
        size: 42,
        content: 'https://demo.example.test/rest/api/3/attachment/content/20001'
      }
    ]);
    expect(JSON.parse(lines[2])).toMatchObject({
      eventName: 'jira.contract.payload.built',
      issueSource: 'jira-rest',
      payload: {
        issues: [
          {
            fields: {
              attachmentCount: 1
            }
          }
        ]
      }
    });
  });

  it('skips updated events without attachment changes to avoid duplicate dispatches', async () => {
    const lines: string[] = [];
    const send = jest.fn();

    await handleJiraIssueEvent(
      { ...createdEvent, eventType: 'avi:jira:updated:issue' },
      {},
      {
        log: (line) => lines.push(line),
        send,
        uuid: () => '00000000-0000-4000-8000-000000000003',
        now: () => new Date('2026-08-13T12:00:00.000Z')
      }
    );

    expect(lines).toHaveLength(3);
    const records = lines.map((line) => JSON.parse(line));
    expect(records[2]).toMatchObject({
      eventName: 'jira.event.skipped',
      reason: 'UPDATED_EVENT_WITHOUT_ATTACHMENT_CHANGE',
      issueKey: 'BFC-3',
      projectKey: 'BFC'
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('dispatches updated events when Jira reports an attachment change', async () => {
    const lines: string[] = [];
    const send = jest
      .fn<Promise<IntegrationDispatchResult>, [IssuesRequest, string]>()
      .mockResolvedValue(successfulDispatch);
    const readIssue = jest
      .fn<Promise<JiraIssueReadResult>, [string]>()
      .mockResolvedValue({ ok: true, status: 200, issue: restIssue });

    await handleJiraIssueEvent(
      {
        ...createdEvent,
        eventType: 'avi:jira:updated:issue',
        changelog: {
          items: [
            {
              field: 'Attachment',
              fieldId: 'attachment',
              fieldtype: 'jira'
            }
          ]
        }
      },
      {},
      {
        log: (line) => lines.push(line),
        readIssue,
        send,
        uuid: () => '00000000-0000-4000-8000-000000000008',
        now: () => new Date('2026-08-13T12:00:00.000Z')
      }
    );

    expect(readIssue).toHaveBeenCalledWith('BFC-3');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].issues[0].fields.attachment).toHaveLength(1);
    expect(JSON.parse(lines[2])).toMatchObject({
      eventName: 'jira.contract.payload.built',
      eventType: 'avi:jira:updated:issue',
      payload: {
        issues: [
          {
            fields: {
              attachmentCount: 1
            }
          }
        ]
      }
    });
  });

  it('skips DAT issues while the real E2E proof is restricted to BFC', async () => {
    const lines: string[] = [];
    const send = jest.fn();

    await handleJiraIssueEvent(
      {
        ...createdEvent,
        issue: {
          ...createdEvent.issue,
          key: 'DAT-3',
          fields: {
            ...createdEvent.issue?.fields,
            project: { key: 'DAT' }
          }
        }
      },
      {},
      {
        log: (line) => lines.push(line),
        send,
        uuid: () => '00000000-0000-4000-8000-000000000005',
        now: () => new Date('2026-08-13T12:00:00.000Z')
      }
    );

    expect(lines).toHaveLength(3);
    const records = lines.map((line) => JSON.parse(line));
    expect(records[2]).toMatchObject({
      eventName: 'jira.event.skipped',
      reason: 'PROJECT_NOT_ALLOWED',
      issueKey: 'DAT-3',
      projectKey: 'DAT'
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('skips issues outside the BFC test project before dispatching', async () => {
    const lines: string[] = [];
    const send = jest.fn();

    await handleJiraIssueEvent(
      {
        ...createdEvent,
        issue: {
          ...createdEvent.issue,
          key: 'SOP-1043',
          fields: {
            ...createdEvent.issue?.fields,
            project: { key: 'SOP' }
          }
        }
      },
      {},
      {
        log: (line) => lines.push(line),
        send,
        uuid: () => '00000000-0000-4000-8000-000000000004',
        now: () => new Date('2026-08-13T12:00:00.000Z')
      }
    );

    expect(lines).toHaveLength(3);
    const records = lines.map((line) => JSON.parse(line));
    expect(records[2]).toMatchObject({
      eventName: 'jira.event.skipped',
      reason: 'PROJECT_NOT_ALLOWED',
      issueKey: 'SOP-1043',
      projectKey: 'SOP'
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('falls back to receivedAt when dates are not parseable', () => {
    expect(
      deriveEventDate({ issue: { fields: { created: 'nope', updated: 'also-nope' } } }, 'now')
    ).toEqual({ value: 'now', source: 'receivedAt' });
    expect(
      deriveEventDate(
        { issue: { fields: { created: '2026-08-13T10:00:00.000Z' } } },
        'now'
      )
    ).toEqual({ value: '2026-08-13T10:00:00.000Z', source: 'issue.fields.created' });
  });

  it('handles missing issue and context shapes without dispatching', async () => {
    const lines: string[] = [];
    const send = jest.fn();
    const readIssue = jest.fn();

    await handleJiraIssueEvent({}, undefined, {
      log: (line) => lines.push(line),
      readIssue,
      send,
      uuid: () => '00000000-0000-4000-8000-000000000002',
      now: () => new Date('2026-08-13T12:00:00.000Z')
    });

    expect(lines).toHaveLength(3);
    const shapeRecord = JSON.parse(lines[1]);
    const contractRecord = JSON.parse(lines[2]);
    expect(shapeRecord.shape.issueKeys).toEqual([]);
    expect(shapeRecord.shape.issueFieldKeys).toEqual([]);
    expect(shapeRecord.shape.contextKeys).toEqual([]);
    expect(contractRecord.contractValid).toBe(false);
    expect(contractRecord.reason).toBe('MISSING_FIELDS');
    expect(contractRecord.jiraRead).toBeNull();
    expect(readIssue).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
