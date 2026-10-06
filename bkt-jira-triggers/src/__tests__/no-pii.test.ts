import { handleJiraIssueEvent } from '../handler';
import { findForbiddenContent, sanitizeJiraEvent } from '../sanitize';
import { canaries, createdEvent, restIssue, updatedEvent } from './fixtures/events';

describe('sanitizeJiraEvent', () => {
  it.each(Object.values(canaries))(
    'does not leak canary %s from sanitized created event',
    (canary) => {
      expect(JSON.stringify(sanitizeJiraEvent(createdEvent))).not.toContain(canary);
    }
  );

  it('drops forbidden content by allowlist construction', () => {
    expect(findForbiddenContent(sanitizeJiraEvent(updatedEvent))).toEqual([]);
  });

  it('detects forbidden keys in raw objects and ignores non-objects', () => {
    expect(
      findForbiddenContent({ attachment: 'file.txt', nested: { emailAddress: 'a@b.test' } })
    ).toEqual(['a@b.test', 'attachment', 'emailAddress']);
    expect(findForbiddenContent(null)).toEqual([]);
  });

  it('does not leak canaries through handler logs', async () => {
    const lines: string[] = [];

    // Con el ticket completo leido por REST: descripcion, responsable y
    // adjuntos viajan en el payload, pero no pueden aparecer en la traza.
    await handleJiraIssueEvent(
      updatedEvent,
      {},
      {
        log: (line) => lines.push(line),
        readIssue: async () => ({ ok: true, status: 200, issue: restIssue }),
        send: async () => ({
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
          errorCode: 'MISSING_RUNTIME_CONFIG'
        })
      }
    );

    const output = lines.join('\n');
    for (const canary of Object.values(canaries)) {
      expect(output).not.toContain(canary);
    }
    expect(findForbiddenContent(lines.map((line) => JSON.parse(line)))).toEqual([]);
  });
});
