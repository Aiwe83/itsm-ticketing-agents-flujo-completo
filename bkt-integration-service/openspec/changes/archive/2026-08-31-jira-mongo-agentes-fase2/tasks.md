## 1. Contract and validation

- [x] 1.1 Confirm single-ticket POST contract and reject batches or legacy payloads.
- [x] 1.2 Align translated field naming with Jira, including `status`.

## 2. Persistence and translation

- [x] 2.1 Persist the raw Jira ticket in `itsm_tickets` before translation.
- [x] 2.2 Translate the ticket with MongoDB mappings and store the result in `tickets`.

## 3. Orchestration and traceability

- [x] 3.1 Dispatch the orchestrator notification without blocking the HTTP response.
- [x] 3.2 Record orchestration outcome in `executions` for traceability.

## 4. Demo and validation

- [x] 4.1 Update manual test and demo docs with the single-ticket flow.
- [x] 4.2 Validate the implementation with typecheck, Jest, and build.
