## 1. Explore

- [x] 1.1 Confirm the only supported ingestion endpoint is `POST /api/v1/issues`.
- [x] 1.2 Confirm the current Jira ticket shape exposes attachments through `fields.attachment` or `fields.attachments`.
- [x] 1.3 Confirm raw tickets, translated tickets, mappings, and executions use the existing collections.

## 2. Proposal Artifacts

- [x] 2.1 Create `proposal.md` with why, scope, impact, out-of-scope items, and validation plan.
- [x] 2.2 Create `design.md` with the attachment service, Jira fetcher, issue-flow integration, logging, risks, and rollback.
- [x] 2.3 Create a delta spec for the modified Jira ingestion capability.
- [x] 2.4 Keep this change isolated to `openspec/changes/jira-attachment-processing-hardening/`.

## 3. Implementation Tasks For Apply

- [x] 3.1 Add a neutral attachment processing service.
- [x] 3.2 Add a Jira attachment fetcher with host pinning, redirects disabled, response size limit, and environment-based credentials.
- [x] 3.3 Add environment variables for attachment limit and optional Jira credentials.
- [x] 3.4 Redact authorization and password values in logs.
- [x] 3.5 Enrich translated tickets with `content.attachedDocuments`.
- [x] 3.6 Notify the orchestrator only after translated-ticket enrichment has been attempted.
- [x] 3.7 Ensure attachment failures are traced but do not mark a successfully translated ticket as failed.
- [x] 3.8 Ensure unsupported parallel ingestion routes are not exposed.

## 4. Tests For Apply

- [x] 4.1 Unit test inline text attachment conversion.
- [x] 4.2 Unit test Word-compatible attachment conversion.
- [x] 4.3 Unit test unsupported and oversized attachments.
- [x] 4.4 Unit test remote attachment download with and without fetcher.
- [x] 4.5 Unit test host pinning and disabled redirects.
- [x] 4.6 Integration test that `content.attachedDocuments` is persisted before orchestrator notification.
- [x] 4.7 Integration test that unsupported parallel ingestion routes return 404 and create no documents.
- [x] 4.8 Regression test for single-ticket validation.

## 5. Validation For Apply

- [x] 5.1 Run `node node_modules/typescript/bin/tsc --noEmit`.
- [x] 5.2 Run `node node_modules/jest/bin/jest.js --coverage --runInBand`.
- [x] 5.3 Run `node node_modules/typescript/bin/tsc`.
- [x] 5.4 Run a text search to confirm no unsupported parallel ingestion endpoint remains.
- [x] 5.5 Do not run `/opsx-verify`.
