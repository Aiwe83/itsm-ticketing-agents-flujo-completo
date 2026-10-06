## Why

The Jira/TC ingestion service must keep a single supported entry point while adding attachment handling to the existing ticket flow. The implementation plan identified that attachment text must be available to downstream agents without introducing a second ingestion pipeline or extra MongoDB collections.

The flow also needs hardening because attachment URLs and files come from incoming ticket payloads. Remote downloads must be constrained to the configured Jira host, large files must be bounded, and sensitive headers must not appear in logs.

## What Changes

- Extend the existing `POST /api/v1/issues` flow so supported Jira attachments are converted to plain text.
- Store converted attachment content in the translated ticket under `content.attachedDocuments`.
- Keep the raw ticket in `itsm_tickets` unchanged.
- Keep the translated ticket in `tickets` as the only normalized-ticket output.
- Keep execution traceability in `executions`.
- Keep the orchestrator notification in background mode, after translated ticket persistence and attachment enrichment.
- Add a safe Jira attachment downloader that only allows the configured Jira origin, rejects cross-origin URLs, does not follow redirects, applies a download size limit, and uses credentials only from environment variables.
- Redact sensitive request headers and passwords from logs.
- Confirm no unsupported parallel ingestion endpoint is exposed.

## Capabilities

### Modified Capabilities

- `jira-mongo-agentes`: add attachment-to-text enrichment and secure background notification behavior to the existing Jira ticket ingestion capability.

### New Capabilities

- None.

## Out Of Scope

- No new ingestion endpoint.
- No new MongoDB collections for a parallel ticket pipeline.
- No batch support; `POST /api/v1/issues` still accepts exactly one ticket.
- No scheduler, queue consumer, or external polling process.
- No migration of historical documents.
- No support for additional binary formats beyond the supported attachment formats defined in this change.
- No changes to orchestrator API contract beyond sending already persisted translated-ticket references as today.

## Impact

- `src/services/issue.service.ts`
- `src/services/attachment.service.ts`
- `src/services/jira-attachment.fetcher.ts`
- `src/config/environment.ts`
- `src/config/logger.ts`
- `src/utils/issue.util.ts`
- `src/routes/index.ts`
- `src/__tests__/attachment.service.test.ts`
- `src/__tests__/jira-attachment.fetcher.test.ts`
- `src/__tests__/issues.integration.test.ts`
- `.env.example`
- `README.md`
- `CHANGELOG.md`

## Validation

- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/jest/bin/jest.js --coverage --runInBand`
- `node node_modules/typescript/bin/tsc`
- Text search confirming no unsupported parallel ingestion endpoint remains in runtime code or docs.
- Manual test with Postman and MongoDB Compass showing:
  - raw ticket in `itsm_tickets`
  - translated ticket in `tickets`
  - `content.attachedDocuments` populated when a supported attachment is present
  - execution trace in `executions`
