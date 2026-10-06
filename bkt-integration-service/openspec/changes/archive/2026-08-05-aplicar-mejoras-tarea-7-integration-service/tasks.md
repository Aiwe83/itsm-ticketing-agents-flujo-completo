## 1. Startup hardening: empty boolean env vars (Paso 0)

- [x] 1.1 In `src/config/environment.ts`, change `LOG_PRETTY_PRINT` to put the default INSIDE the preprocess: `LOG_PRETTY_PRINT: z.preprocess(blankToUndefined, z.stringbool().default(false))`
- [x] 1.2 In `src/config/environment.ts`, change `CORS_CREDENTIALS` to put the default INSIDE the preprocess: `CORS_CREDENTIALS: z.preprocess(blankToUndefined, z.stringbool().default(true))`
- [x] 1.3 Do NOT use `z.coerce.boolean()` anywhere: `Boolean("false") === true` would silently flip `.env.test` values and is a regression
- [x] 1.4 Create `src/__tests__/environment.test.ts` using `jest.resetModules()` + `require()` (Jest CJS; dynamic `import()` fails without `--experimental-vm-modules`), setting the minimal required env set (`NODE_ENV`, `MONGODB_USERNAME`, `MONGODB_PASSWORD`, `MONGODB_HOST`, `MONGODB_DATABASE`, `ORCHESTRATOR_BASE_URL` as a valid URL, `ORCHESTRATOR_ENDPOINT`, `MESH_ID`, 4 collection names), and assert: empty `LOG_PRETTY_PRINT`/`CORS_CREDENTIALS` apply defaults (`false`/`true`), and explicit `LOG_PRETTY_PRINT=false` still parses to `false`

## 2. Dispatched execution_id traceability (Punto 6)

- [x] 2.1 In `src/models/Execution.model.ts`, add optional `dispatchedExecutionIds?: StoredTicketId[]` to `IExecution` and `dispatchedExecutionIds: { type: [String], default: undefined }` to the schema (optional field so existing records are unaffected)
- [x] 2.2 In `src/repositories/execution.repository.ts`, add `setDispatchedExecutionIds(executionId: ExecutionRecordId, executionIds: StoredTicketId[]): Promise<IExecution | null>` following the existing `findByIdAndUpdate` + `$set` + `{ new: true }` + `.exec()` pattern
- [x] 2.3 In `src/services/issue.service.ts`, inside `if (orchestratorDispatched)` and BEFORE the fire-and-forget block, add `await this.executions.setDispatchedExecutionIds(executionRecordId, orchestratorTickets.map(ticket => ticket.storedTicketId))` — the `await` is deliberate so a traceability failure surfaces in the response; it must NOT be outside the `if` (an unconditional `await` would write `[]` on every run)
- [x] 2.4 In `src/services/orchestrator.service.ts`, add a contract comment at `serializePayload` documenting that `execution_id` is the `_id` of the persisted `itsm_tickets` record (`storedTicketId = \`${meshId}:${ticketKey}\``)
- [x] 2.5 In `src/__tests__/issue.service.test.ts`, add the stub `setDispatchedExecutionIds: jest.fn().mockResolvedValue(execution)` to the `executionRepository` mock (otherwise the suite breaks)
- [x] 2.6 In `src/__tests__/issues.integration.test.ts`, after processing assert the `Execution` document in MongoDB contains `dispatchedExecutionIds: [storedTicketId]`

## 3. Unique meshId + itsmTicketId index on tickets (Punto 2)

- [x] 3.1 In `src/config/database-indexes.ts`, add an aggregation pre-check counting duplicate `{ meshId, itsmTicketId }` pairs in `tickets`
- [x] 3.2 If duplicates exist: `logger.warn(...)` and skip index creation; otherwise `createIndex({ meshId: 1, itsmTicketId: 1 }, { name: 'meshId_1_itsmTicketId_1', unique: true })`
- [x] 3.3 In `src/__tests__/database-indexes.test.ts`, after `ensureDatabaseIndexes()` assert `indexExists('meshId_1_itsmTicketId_1')` and that the call is idempotent

## 4. Real Date persistence (Punto 3, tests only)

- [x] 4.1 In `src/__tests__/issues.integration.test.ts`, read the raw `itsm_tickets` document WITHOUT `.lean()` and assert `createdAt`/`updatedAt` are `instanceof Date`
- [x] 4.2 Read the translated `tickets` document WITHOUT `.lean()` and assert `createdAt`/`updatedAt` are `instanceof Date`
- [x] 4.3 Read the `Execution` document WITHOUT `.lean()` and assert `startTime`/`endTime` are `instanceof Date`
- [x] 4.4 Do NOT assert on `content` (Schema.Types.Mixed): dates there are strings and `instanceof Date` would fail

## 5. Database name visible in connection log (Punto 5)

- [x] 5.1 In `src/config/database.ts`, immediately after `await mongoose.connect(url, options)` add `logger.info({ database: mongoose.connection.name }, 'Mongoose connected to MongoDB')`
- [x] 5.2 Do NOT place the log in the `connected` event listener — Mongoose emits it inside connect, before listeners register, so it never fires on startup

## 6. English naming sweep (Punto 7)

- [x] 6.1 In `src/services/issue.service.ts`, change the post-processing trace failure log from `'Fallo al trazar el postproceso de tickets'` to `'Failed to trace ticket post-processing'`
- [x] 6.2 Scan `src/` and confirm no Spanish-language log message strings remain in the service layer

## 7. Plain-Error middleware branch test (Punto 1, tests only)

- [x] 7.1 In `src/__tests__/error.middleware.test.ts`, add a test where a route throws a plain `Error` (not `HttpError`): HTTP response is 500, exposes `err.message` and `code`, has NO `stack` property (with `IS_LOCAL=true` the real message is exposed), and the error is logged server-side with the `stack` retained for diagnostics

## 8. .env residue documented (Punto 4, documentation only)

- [x] 8.1 Document that `TENANT_ID`, `PROJECT_ID` and `ITSM_ID` in `.env` are dead residue not used by the operational flow; the real `.env` file must NOT be modified

## 9. Final verification

- [x] 9.1 Run `corepack pnpm exec tsc --noEmit` from the repo root
- [x] 9.2 Run `corepack pnpm exec jest --coverage --runInBand` from the repo root
- [x] 9.3 Run `corepack pnpm exec tsc` from the repo root
- [x] 9.4 Run `git diff --check` from the repo root
