import {
  adfToPlainText,
  buildIssuesRequest,
  issuesRequestSchema,
  normalizeText
} from '../contract';
import { canaries, createdEvent } from './fixtures/events';

describe('buildIssuesRequest', () => {
  it('builds one valid issue request', () => {
    const result = buildIssuesRequest(createdEvent, { initiatedBy: 'bkt-jira-triggers' });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.request.issues).toHaveLength(1);
    expect(issuesRequestSchema.parse(result.request)).toEqual(result.request);
  });

  it('rejects missing fields', () => {
    const result = buildIssuesRequest({ issue: { key: 'DEMO-1' } }, { initiatedBy: 'demo' });

    expect(result).toEqual({ ok: false, reason: 'MISSING_FIELDS' });
  });

  it('rejects missing key', () => {
    const result = buildIssuesRequest(
      { issue: { fields: { summary: 'hello' } } },
      { initiatedBy: 'demo' }
    );

    expect(result).toEqual({ ok: false, reason: 'MISSING_KEY' });
  });

  it('rejects missing summary', () => {
    const result = buildIssuesRequest(
      { issue: { key: 'DEMO-1', fields: {} } },
      { initiatedBy: 'demo' }
    );

    expect(result).toEqual({ ok: false, reason: 'MISSING_SUMMARY' });
  });

  it('truncates text and preserves tab newline carriage return while stripping forbidden controls', () => {
    const text = `a\tb\nc\rd${String.fromCharCode(0)}e${'x'.repeat(600)}`;

    const normalized = normalizeText(text, 10);

    expect(normalized).toBe('a\tb\nc\rdexx');
    expect(normalized).toHaveLength(10);
  });

  it('omits optional fields when they normalize to empty values', () => {
    const result = buildIssuesRequest(
      {
        issue: {
          id: '',
          key: 'DEMO-2',
          fields: {
            summary: 'Minimal',
            issuetype: { name: '' },
            status: { name: '' },
            project: { key: '' },
            priority: { name: '' },
            created: '',
            updated: ''
          }
        }
      },
      { initiatedBy: '' }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.request.initiatedBy).toBe('bkt-jira-triggers');
    expect(result.request.issues[0]).toEqual({
      key: 'DEMO-2',
      fields: {
        summary: 'Minimal'
      }
    });
  });

  it('keeps a valid attachment, normalized', () => {
    const result = buildIssuesRequest(createdEvent, { initiatedBy: 'bkt-jira-triggers' });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.request.issues[0].fields.attachment).toEqual([
      {
        id: '30001',
        filename: canaries.attachment,
        content: 'https://demo-canary.atlassian.net/rest/api/3/attachment/content/30001',
        mimeType: 'text/plain',
        size: 512
      }
    ]);
  });

  it('drops attachment items missing filename or an http(s) content URL', () => {
    const result = buildIssuesRequest(
      {
        issue: {
          key: 'DEMO-3',
          fields: {
            summary: 'Con adjuntos parciales',
            attachment: [
              { filename: 'sin-content.docx' },
              { content: 'https://jira.example.invalid/y' },
              { filename: 'url-rara.docx', content: 'javascript:alert(1)' },
              { filename: 'valido.docx', content: 'https://jira.example.invalid/z' }
            ]
          }
        }
      },
      { initiatedBy: 'demo' }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.request.issues[0].fields.attachment).toEqual([
      { filename: 'valido.docx', content: 'https://jira.example.invalid/z' }
    ]);
  });

  it('caps attachments at MAX_ATTACHMENTS', () => {
    const attachment = Array.from({ length: 25 }, (_, i) => ({
      filename: `f${i}.txt`,
      content: `https://jira.example.invalid/${i}`
    }));

    const result = buildIssuesRequest(
      { issue: { key: 'DEMO-4', fields: { summary: 'Muchos adjuntos', attachment } } },
      { initiatedBy: 'demo' }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.request.issues[0].fields.attachment).toHaveLength(20);
  });

  it('omits the attachment field entirely when it normalizes to nothing', () => {
    const result = buildIssuesRequest(
      {
        issue: {
          key: 'DEMO-5',
          fields: { summary: 'Sin adjuntos validos', attachment: [{ filename: '' }] }
        }
      },
      { initiatedBy: 'demo' }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.request.issues[0].fields.attachment).toBeUndefined();
  });
});

describe('mapping fields from the full Jira issue', () => {
  const build = (fields: Record<string, unknown>) => {
    const result = buildIssuesRequest(
      { issue: { key: 'DEMO-3', fields: { summary: 'Con campos', ...fields } } },
      { initiatedBy: 'demo' }
    );
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(issuesRequestSchema.parse(result.request)).toEqual(result.request);
    return result.request.issues[0].fields;
  };

  it('keeps only id and name of components', () => {
    expect(
      build({
        components: [
          { id: '1', name: 'Pagos', self: 'https://x.test/c/1' },
          { id: '2', name: '  ' },
          'no-es-un-objeto'
        ]
      }).components
    ).toEqual([{ id: '1', name: 'Pagos' }]);
  });

  it('keeps the three assignee fields the catalog maps and drops the rest', () => {
    expect(
      build({ assignee: { accountId: 'a-1', displayName: 'Ana', avatarUrls: {}, active: true } })
        .assignee
    ).toEqual({ accountId: 'a-1', displayName: 'Ana' });
    expect(build({ assignee: null }).assignee).toBeUndefined();
  });

  it('keeps attachments that integration-service can download and drops the rest', () => {
    expect(
      build({
        attachment: [
          {
            id: '9',
            filename: 'log.txt',
            mimeType: 'text/plain',
            size: 10,
            content: 'https://x.test/rest/api/3/attachment/content/9',
            author: { displayName: 'Ana' }
          },
          { filename: 'sin-url.txt' },
          { filename: 'url-rara.txt', content: 'javascript:alert(1)' },
          { filename: '', content: 'https://x.test/a' }
        ]
      }).attachment
    ).toEqual([
      {
        id: '9',
        filename: 'log.txt',
        mimeType: 'text/plain',
        size: 10,
        content: 'https://x.test/rest/api/3/attachment/content/9'
      }
    ]);
  });

  it('omits the new fields when Jira sends them empty', () => {
    const fields = build({ description: null, components: [], assignee: null, attachment: [] });
    expect(fields).toEqual({ summary: 'Con campos' });
  });

  it('sends a plain-text description unchanged', () => {
    expect(build({ description: '  texto plano  ' }).description).toBe('texto plano');
  });
});

describe('adfToPlainText', () => {
  it('flattens paragraphs, lists, breaks, mentions and tables into lines', () => {
    const adf = {
      type: 'doc',
      version: 1,
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Titulo' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hola ' },
            { type: 'mention', attrs: { id: 'x', text: '@Ana' } },
            { type: 'hardBreak' },
            { type: 'text', text: 'segunda linea ' },
            { type: 'inlineCard', attrs: { url: 'https://x.test' } }
          ]
        },
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'uno' }] }]
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'dos' }] }]
            }
          ]
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }]
                },
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }]
                }
              ]
            }
          ]
        },
        { type: 'rule' },
        { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'img' } }] },
        {
          type: 'paragraph',
          content: [{ type: 'emoji', attrs: { shortName: ':ok:', text: '👍' } }]
        }
      ]
    };

    expect(adfToPlainText(adf)).toBe(
      'Titulo\nHola @Ana\nsegunda linea https://x.test\n- uno\n- dos\na | b\n👍'
    );
  });

  it('returns an empty string for anything that is not ADF or text', () => {
    expect(adfToPlainText(undefined)).toBe('');
    expect(adfToPlainText(42)).toBe('');
    expect(adfToPlainText({ type: 'doc', content: 'no-es-array' })).toBe('');
  });
});
