## ADDED Requirements

### Requirement: Forge dispatches a validated Jira issue payload to integration-service
The Forge trigger implementation MUST send exactly one Jira issue payload to `POST /api/v1/issues` only after the existing contract builder returns a valid request. If the payload is invalid, the trigger MUST skip the outbound call and report the failure as a controlled handler outcome.

#### Scenario: Valid Jira issue event triggers dispatch
- **WHEN** the Forge handler receives a Jira issue event and `buildIssuesRequest()` returns `ok: true`
- **THEN** Forge sends one authenticated `POST /api/v1/issues` request containing exactly the validated `issues` payload

#### Scenario: Invalid Jira issue event does not trigger dispatch
- **WHEN** the Forge handler receives a Jira issue event and `buildIssuesRequest()` returns `ok: false`
- **THEN** Forge does not send any outbound request and records the failure reason in structured logs

### Requirement: Forge authenticates and configures the outbound request from runtime secrets
The outbound integration request MUST use runtime-provided configuration for the service base URL, API key, and API key header name. These values MUST come from encrypted Forge environment configuration and MUST NOT be hardcoded in source files, repository docs, or structured logs.

#### Scenario: Runtime configuration is present
- **WHEN** the Forge integration client is invoked with all required runtime configuration available
- **THEN** it sends the request using the configured base URL, the configured API key header, and the configured API key value

#### Scenario: Runtime configuration is missing
- **WHEN** the Forge integration client is invoked and one or more required runtime values are missing
- **THEN** it fails closed with a classified configuration error and no outbound request is attempted

### Requirement: Forge preserves end-to-end request correlation and response truth
Forge MUST generate one correlation identifier per invocation, send it to `integration-service` as `X-Request-Id`, and reuse it in all structured Forge logs for that invocation. Forge MUST classify the integration result from both transport outcome and response body semantics, not from HTTP status alone.

#### Scenario: Service returns accepted HTTP status and successful application result
- **WHEN** `integration-service` responds with HTTP `201` and the response body reports `data.summary.successIntegration: true` and `data.tickets[0].success: true`
- **THEN** Forge records the integration attempt as successful and includes the correlation identifier, HTTP status, `executionId`, and `storedTicketId` in the integration response log

#### Scenario: Service returns accepted HTTP status but ticket processing failed
- **WHEN** `integration-service` responds with HTTP `201` and the response body reports `data.summary.successIntegration: false` or `data.tickets[0].success: false`
- **THEN** Forge records the integration attempt as failed and preserves the correlation identifier, HTTP status, and summarized failure details in the integration response log

#### Scenario: Network or timeout failure occurs
- **WHEN** the outbound request cannot complete because of timeout or network failure
- **THEN** Forge records a classified integration failure with the same correlation identifier and the handler completes without crashing

### Requirement: Forge logs and evidence remain sanitized
Forge MUST keep structured logs and saved evidence free of API key material, Jira email addresses, Atlassian host leakage that is not explicitly approved for the demo, and Jira free-text fields outside the real outbound payload body. The integration response logging MUST avoid re-logging raw issue content returned by the service.

#### Scenario: Structured logs are captured during a successful send
- **WHEN** the handler logs the outbound request and response lifecycle
- **THEN** the logs include metadata such as `issueKey`, `correlationId`, HTTP status, success classification, `executionId`, and `storedTicketId`, but do not include the raw summary text, API key, or full response issue payload

#### Scenario: Evidence is stored after manual verification
- **WHEN** an end-to-end demo flow is executed
- **THEN** `docs/evidence/` contains a dated evidence file that records the issue key, event time, correlation identifier, sanitized Forge log excerpts, service outcome summary, and a conclusion for the run

### Requirement: The demo remains UI-free and service-compatible
The end-to-end demo MUST not introduce any frontend or Jira UI module and MUST keep `integration-service` compatibility as the default path. The Forge repo implementation SHOULD absorb the transport changes unless a verified contract mismatch requires a separate documented service-side follow-up.

#### Scenario: Reviewing the implemented demo scope
- **WHEN** the change is reviewed before apply or merge
- **THEN** the Forge project contains no new UI modules and the implementation scope remains centered on transport, correlation, testing, and evidence

#### Scenario: Service contract remains compatible
- **WHEN** the Forge payload is validated against the current `integration-service` contract and route behavior
- **THEN** the demo proceeds without requiring a large refactor of `integration-service`
