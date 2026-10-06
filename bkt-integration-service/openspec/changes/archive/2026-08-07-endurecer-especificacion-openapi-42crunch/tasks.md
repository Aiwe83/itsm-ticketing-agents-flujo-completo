## 1. Security explicit per operation and additionalProperties hardening (Ronda 1)

- [x] 1.1 In `src/openapi/document.ts`, add explicit `security: []` to the `getHealth` and `getApiRoot` operations (`createIssues` already had it)
- [x] 1.2 In `src/openapi/schemas.ts`, convert `executionErrorSchema`, `attachedDocumentSchema`, `issueInfoSchema`, `issueProcessResultSchema`, `issueProcessSummarySchema`, `issueProcessResponseSchema`, `issueAcceptedResponseSchema`, `errorResponseSchema` (+ nested `error`), `rateLimitErrorResponseSchema` (+ nested `error`), `healthResponseSchema`, `apiRootResponseSchema` to `z.strictObject()`
- [x] 1.3 Do NOT convert `issueContentSchema`, its nested `technicianInfo`, or anything reusing `issuePayloadSchema`/`issueBatchSchema` from the validator — leave `.passthrough()` as-is (mapping-driven / real Jira echo)

## 2. String length and pattern bounds (Ronda 1)

- [x] 2.1 In `src/openapi/schemas.ts`, add private constants `ID_MAX=128`, `SHORT_TEXT_MAX=500`, `LONG_TEXT_MAX=50_000`, `ATTACHMENT_TEXT_MAX=20_000_000`, `DATE_TIME_MAX=40`
- [x] 2.2 Add private helpers `freeText(max)` (blocks only control characters) and `token(max)` (blocks whitespace + control characters), not exported
- [x] 2.3 Apply `freeText`/`token` with the appropriate bound to all ~34 plain `z.string()` fields in `schemas.ts` per the field table in the plan (identifiers → `token`, human/Jira-sourced text → `freeText`)
- [x] 2.4 Add `.max(DATE_TIME_MAX)` (no regex) to the 3 `format: 'date-time'` fields (`executionErrorSchema.timestamp`, `issueProcessResultSchema.receivedAt`, `errorResponseSchema.error.timestamp`)
- [x] 2.5 In `src/validators/issue.validator.ts`, add ONLY `.max()` (no `.regex()`) to `jiraIssueTypeSchema.name` (128), `jiraFieldsSchema.summary` (500), `issuePayloadSchema.id` (128), `issuePayloadSchema.key` (128), `issueBatchSchema.initiatedBy` (200) — per explicit user decision, this is the only runtime-sensitive file touched

## 3. Numeric range and array size bounds (Ronda 1 & 2)

- [x] 3.1 In `src/openapi/schemas.ts`, add `.min(100).max(599)` to `errorResponseSchema.error.statusCode`
- [x] 3.2 Add `.max(50)` to `issueProcessResultSchema.errors`
- [x] 3.3 Add `.length(1)` to `issueProcessResponseSchema.tickets` (mirrors `issueBatchSchema.issues.length(1)` — one ticket per request)
- [x] 3.4 Add `.max(100)` to `issueContentSchema.attachedDocuments`
- [x] 3.5 Add `.max(200)` to `issueContentSchema.actions`

## 4. Response completeness against real middleware behavior (Ronda 3)

- [x] 4.1 Read `src/app.ts` and `src/middlewares/error.middleware.ts` to confirm real global handler behavior before documenting anything
- [x] 4.2 In `src/openapi/document.ts`, add shared `notFoundResponse`, `defaultErrorResponse`, `rateLimitResponse` response objects referencing `ErrorResponse`/`RateLimitErrorResponse`
- [x] 4.3 Add `404` response to `getHealth` and `getApiRoot` (GET operations; `notFoundHandler` is a real global catch-all)
- [x] 4.4 Add `429` response to `getApiRoot` (rate limiter is real on `/api/`; `createIssues` already had it, refactored to the shared constant)
- [x] 4.5 Add `default` response to all 3 operations (`exceptionHandler` is a real global catch-all)
- [x] 4.6 Do NOT add `406`/`415` responses — confirmed Express does not generate them in this service
- [x] 4.7 Update `src/__tests__/openapi.test.ts` guardrail test to expect `'default'` in `createIssues` response keys

## 5. Absolute, parameterized server URL (Ronda 4)

- [x] 5.1 Verify deployment context before choosing defaults: `docker-compose.yaml` exposes `8000:8000`, `.env.example` defines `PORT=8000`, no public URL documented in the repo
- [x] 5.2 In `src/openapi/document.ts`, replace `servers: [{ url: '/' }]` with `servers: [{ url: '{protocol}://{host}', variables: { protocol: {default:'https', enum:['https','http']}, host: {default:'localhost:8000'} } }]`

## 6. Verification (run after every round, in order)

- [x] 6.1 `pnpm exec ts-node src/scripts/generate-openapi.ts` (regenerate `openapi.yaml`)
- [x] 6.2 `pnpm run openapi:lint` (redocly, 0 errors — 1 pre-existing intentional `ApiKeyAuth` warning)
- [x] 6.3 `pnpm run openapi:check` (YAML stays in sync with generator source)
- [x] 6.4 `pnpm exec tsc --noEmit`
- [x] 6.5 `pnpm exec jest --coverage --runInBand` (12/12 suites, 52/52 tests — `openapi.test.ts` re-parses every real example against the new strict/bounded schemas)
- [x] 6.6 `pnpm exec tsc` (build)
- [x] 6.7 `git diff --check`
- [x] 6.8 Re-run the real 42Crunch Security Audit in VSCode between rounds to measure actual score movement (not just internal checks): Global 15→51→63/100, Data validation 12→43→56/70
