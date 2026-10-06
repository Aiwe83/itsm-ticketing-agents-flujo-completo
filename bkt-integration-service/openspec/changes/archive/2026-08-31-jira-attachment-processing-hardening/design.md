## Context

The service currently receives Jira/TC tickets through `POST /api/v1/issues`, stores the raw payload, translates it with MongoDB mappings, stores the normalized ticket, and notifies an orchestrator. Attachment handling must be added to that existing flow only.

The translated ticket is the downstream contract for agents. Therefore attachment text belongs in `tickets.content.attachedDocuments`, not in a separate model or collection.

## Goals

- Process supported Jira attachments into plain text.
- Preserve the raw Jira payload unchanged.
- Store attachment text only in the translated ticket.
- Notify the orchestrator after translated-ticket enrichment has been attempted.
- Keep the HTTP response independent from orchestrator latency.
- Prevent unsafe remote downloads and credential leakage.
- Keep one ingestion endpoint: `POST /api/v1/issues`.

## Non-Goals

- No second HTTP ingestion route.
- No extra raw/final/execution collections.
- No batch processing.
- No historical migration.
- No complete file-conversion platform.
- No synchronous wait for orchestrator completion.

## Design

### Attachment Processing Service

Create a neutral attachment service under `src/services/attachment.service.ts`.

The service receives the attachment list from the Jira ticket fields and returns:

```ts
{
  filename: string
  plainText: string
  skippedReason?: 'unsupported' | 'too_large' | 'download_failed'
}
```

Supported inputs:

- Inline text-like content from `data`, `content`, or `buffer`.
- Remote Jira attachment URLs from `content`.
- Text-like extensions: `txt`, `log`, `csv`, `xml`, `html`, `htm`, `n43`, `n34`, `mt940`.
- Word-compatible extensions handled through `mammoth`: `docx`, `dotx`, `odt`.

Unsupported attachments must not fail the ticket. They are returned with `skippedReason`.

### Secure Jira Attachment Fetcher

Create a Jira attachment fetcher under `src/services/jira-attachment.fetcher.ts`.

It must:

- Be created only when `JIRA_BASE_URL`, `JIRA_USER`, and `JIRA_PASSWORD` are configured.
- Accept only URLs whose origin matches `JIRA_BASE_URL`.
- Disable redirects.
- Apply `ATTACHMENT_BYTES_LIMIT` to the HTTP response.
- Use credentials from environment variables only.

### Issue Flow Integration

`IssueService` remains the orchestration point:

1. Store raw ticket in `itsm_tickets`.
2. Translate ticket through mappings.
3. Store translated ticket in `tickets`.
4. Attempt attachment enrichment from `fields.attachment` or `fields.attachments`.
5. Upsert the enriched translated ticket.
6. Notify the orchestrator in the background.
7. Record attachment or orchestrator errors in `executions`.

Attachment failures must not change a successfully translated ticket into a failed ticket. They are traceability errors, not ingestion failures.

### Logging

Pino logging must redact sensitive fields:

- `authorization`
- `headers.authorization`
- request authorization headers
- HTTP client authorization headers
- passwords

### Routing

`src/routes/index.ts` must mount only the supported Jira issue route under `/api/:version/issues`. Unsupported parallel ingestion routes must return 404 and must not create MongoDB documents.

## Risks And Mitigations

- Remote attachment URL could target another host.
  - Mitigation: strict origin validation and redirects disabled.
- Remote file could be too large.
  - Mitigation: declared-size check and HTTP response size limit.
- Credentials could leak through HTTP client errors.
  - Mitigation: logger redaction for authorization/password paths.
- Fire-and-forget can leave a delay between HTTP response and execution update.
  - Mitigation: background catch handlers and `executions` updates.
- Unsupported formats could be expected by users.
  - Mitigation: mark as skipped and record the reason instead of failing the ticket.

## Rollback

- Remove the attachment enrichment step from `IssueService`.
- Keep the existing raw/translated/orchestrator flow unchanged.
- Remove the attachment fetcher and attachment tests.
- No database migration is required because raw tickets remain unchanged and translated-ticket enrichment is additive.
