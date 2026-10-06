import { ISSUE_FIELDS, readIssueFromJira } from '../jira-client';

const response = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body
});

describe('readIssueFromJira', () => {
  it('asks Jira only for the catalog fields plus attachments', () => {
    expect(ISSUE_FIELDS.split(',').sort()).toEqual([
      'assignee',
      'attachment',
      'components',
      'description',
      'issuetype',
      'priority',
      'status',
      'summary'
    ]);
  });

  it('returns the issue when Jira answers with fields', async () => {
    const issue = { id: '1', key: 'BFC-1', fields: { summary: 'x' } };
    const requester = jest.fn().mockResolvedValue(response(200, issue));

    await expect(readIssueFromJira('BFC-1', requester)).resolves.toEqual({
      ok: true,
      status: 200,
      issue
    });
    expect(requester).toHaveBeenCalledWith('BFC-1');
  });

  it('classifies an HTTP error from Jira', async () => {
    await expect(
      readIssueFromJira('BFC-1', async () => response(404, { errorMessages: ['no existe'] }))
    ).resolves.toEqual({ ok: false, status: 404, errorCode: 'JIRA_HTTP_404' });
  });

  it('classifies a body without fields', async () => {
    await expect(
      readIssueFromJira('BFC-1', async () => response(200, { key: 'BFC-1' }))
    ).resolves.toEqual({
      ok: false,
      status: 200,
      errorCode: 'JIRA_INVALID_RESPONSE'
    });
  });

  it('never throws when the request itself fails', async () => {
    await expect(
      readIssueFromJira('BFC-1', async () => {
        throw new Error('runtime no disponible');
      })
    ).resolves.toEqual({ ok: false, status: null, errorCode: 'JIRA_READ_FAILED' });
  });
});
