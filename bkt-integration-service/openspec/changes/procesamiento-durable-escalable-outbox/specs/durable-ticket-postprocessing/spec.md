## ADDED Requirements

### Requirement: Persist post-processing before accepting a ticket
The system MUST persist a post-processing job in `processing_jobs` before returning `201`. The translated-ticket write, raw `translated` status, integration summary, and job upsert MUST commit atomically.

#### Scenario: Ticket is accepted durably
- **WHEN** a Jira ticket is translated successfully
- **THEN** the translated document and its post-processing job commit in the same MongoDB transaction
- **AND** the response contains `processingQueued: true`

#### Scenario: Job cannot be persisted
- **WHEN** the transaction cannot create or update the post-processing job
- **THEN** the new translated state is not partially committed
- **AND** the request does not report a successful acceptance

### Requirement: Use one revisioned job per ticket
The system MUST use `${meshId}:${ticketKey}` as the job identifier and MUST increment its revision for each accepted delivery without creating a second active job for the same ticket.

#### Scenario: Same ticket is delivered twice
- **WHEN** two valid requests contain the same Jira key
- **THEN** one raw ticket, one translated ticket, and one processing job exist
- **AND** the job revision represents the latest accepted delivery

#### Scenario: New revision arrives during processing
- **WHEN** the job revision increases after a worker has claimed an earlier revision
- **THEN** completion of the earlier revision returns the job to `pending`
- **AND** the newer revision remains available for processing

### Requirement: Claim jobs atomically across workers
Workers MUST claim eligible jobs with one atomic MongoDB operation and a time-limited lease. At most one non-expired lease MUST exist for a job.

#### Scenario: Two workers poll concurrently
- **WHEN** two workers attempt to claim the same eligible job
- **THEN** only one receives the job with `status=processing`
- **AND** the other worker processes a different job or waits

#### Scenario: Worker stops unexpectedly
- **WHEN** a worker does not renew its lease before expiration
- **THEN** another worker can reclaim the job
- **AND** the job is not lost

### Requirement: Process attachments before orchestration
The worker MUST attempt attachment enrichment and persist its result before entering the orchestrator phase. Attachment omissions or conversion errors MUST be traced without changing a successfully translated ticket to integration failure.

#### Scenario: Attachment is converted
- **WHEN** the attachments phase obtains plain text
- **THEN** `content.attachedDocuments` is updated before the orchestrator request
- **AND** the job advances to the orchestrator phase

#### Scenario: Attachment cannot be processed
- **WHEN** an attachment is unsupported, oversized, unavailable, or invalid
- **THEN** the execution records the reason
- **AND** the worker continues to the orchestrator phase with the translated ticket preserved

### Requirement: Retry post-processing predictably
Retryable failures MUST use at most five attempts with delays of 5 seconds, 30 seconds, 2 minutes, 10 minutes, and 30 minutes. After the fifth failed attempt the job MUST remain `failed` with its last error.

#### Scenario: Orchestrator temporarily fails
- **WHEN** the orchestrator returns a timeout, `429`, or `5xx`
- **THEN** the job enters `retry` with the next configured delay
- **AND** the translated ticket remains stored

#### Scenario: Retry budget is exhausted
- **WHEN** the fifth retryable attempt fails
- **THEN** the job becomes `failed`
- **AND** no translated ticket is deleted or marked as integration failure

### Requirement: Send a stable idempotency key
Every orchestrator request MUST include `X-Idempotency-Key` built from the deterministic job ID and claimed revision. Retries of that revision MUST reuse the same value.

#### Scenario: Orchestrator request is retried
- **WHEN** the same claimed revision is sent more than once
- **THEN** every attempt carries the same idempotency key

### Requirement: Support independent scalable roles
The runtime MUST support `api`, `worker`, and `all` process roles from the same build. API replicas MUST keep no local job state, and worker concurrency MUST be configurable with default value `5`.

#### Scenario: API and worker are deployed separately
- **WHEN** one process starts with `PROCESS_ROLE=api` and another with `PROCESS_ROLE=worker`
- **THEN** the API only receives and enqueues
- **AND** the worker only claims and processes persisted jobs

### Requirement: Create physical job indexes
The database index command MUST idempotently create indexes that support eligible-job polling, lease recovery, and context queries for `processing_jobs`.

#### Scenario: Index creation runs twice
- **WHEN** the index command is executed repeatedly
- **THEN** only one copy of each required index exists
- **AND** existing jobs remain unchanged

### Requirement: Preserve the single-ticket API contract
`POST /api/v1/issues` MUST continue accepting exactly one ticket and responding `201` after durable queueing. The legacy `orchestratorDispatched` field MUST be documented as deprecated while it remains present.

#### Scenario: One ticket is queued
- **WHEN** a valid single-ticket request completes its transaction
- **THEN** the response contains `processingQueued: true`
- **AND** no in-memory fire-and-forget operation is required for durability
