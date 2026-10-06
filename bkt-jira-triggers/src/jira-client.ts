import { asApp, route } from '@forge/api';
import type { JiraIssue, JiraIssueReadResult } from './types';

export const ISSUE_FIELDS = [
  'summary',
  'description',
  'issuetype',
  'status',
  'priority',
  'components',
  'assignee',
  'attachment'
].join(',');

interface JiraResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

type JiraRequester = (issueKey: string) => Promise<JiraResponseLike>;

const requestIssueAsApp: JiraRequester = (issueKey) =>
  asApp().requestJira(route`/rest/api/3/issue/${issueKey}?fields=${ISSUE_FIELDS}`);

export async function readIssueFromJira(
  issueKey: string,
  requester: JiraRequester = requestIssueAsApp
): Promise<JiraIssueReadResult> {
  try {
    const response = await requester(issueKey);
    if (!response.ok) {
      return { ok: false, status: response.status, errorCode: `JIRA_HTTP_${response.status}` };
    }
    const body = await response.json();
    if (!isIssue(body)) {
      return { ok: false, status: response.status, errorCode: 'JIRA_INVALID_RESPONSE' };
    }
    return { ok: true, status: response.status, issue: body };
  } catch {
    return { ok: false, status: null, errorCode: 'JIRA_READ_FAILED' };
  }
}

function isIssue(value: unknown): value is JiraIssue {
  if (!value || typeof value !== 'object') return false;
  const fields = (value as { fields?: unknown }).fields;
  return !!fields && typeof fields === 'object';
}
