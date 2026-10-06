## ADDED Requirements

### Requirement: Own response schemas reject unknown properties
The generated OpenAPI document SHALL declare `additionalProperties: false` for response schemas whose full property set is defined and controlled by this service (`ExecutionError`, `AttachedDocument`, `IssueInfo`, `IssueProcessResult`, `IssueProcessSummary`, `IssueProcessResponse`, `IssueAcceptedResponse`, `ErrorResponse` and its nested `error` object, `RateLimitErrorResponse` and its nested `error` object, `HealthResponse`, `ApiRootResponse`).

#### Scenario: Unknown property in a self-owned response schema fails validation
- **WHEN** a payload shaped like `ExecutionError` includes a property not declared in its schema
- **THEN** validating that payload against the `ExecutionError` component schema fails

### Requirement: Mapping-driven and echoed schemas remain open
The generated OpenAPI document SHALL NOT restrict `additionalProperties` on schemas whose real contract is driven by external data: `IssueContent` (and its nested `technicianInfo`), `IssuePayload`, `IssueBatchRequest`, and their nested `fields`/`issuetype` objects.

#### Scenario: Mapping-driven extra property in IssueContent still validates
- **WHEN** a payload shaped like `IssueContent` includes a property not explicitly listed in the schema (as produced by a `mappings` MongoDB entry targeting a new subfield)
- **THEN** validating that payload against the `IssueContent` component schema succeeds

#### Scenario: Echoed Jira payload with extra fields still validates
- **WHEN** a payload shaped like `IssuePayload` includes Jira fields beyond `id`, `key`, and `fields`
- **THEN** validating that payload against the `IssuePayload` component schema succeeds

### Requirement: Documentation-only string fields declare length and a control-character-safe pattern
Every `z.string()` field defined in `src/openapi/schemas.ts` (used only for OpenAPI documentation, never for real request/response validation) SHALL declare a `maxLength` and a `pattern` that rejects control characters while accepting all other Unicode text.

#### Scenario: Documentation string field rejects control characters
- **WHEN** a value for a documentation-only string field (e.g. `IssueContent.title`) contains a control character such as `\x00` or `\x1F`
- **THEN** validating that value against its component schema's `pattern` fails

#### Scenario: Documentation string field accepts normal Unicode text within bound
- **WHEN** a value for a documentation-only string field contains normal Unicode text (letters, accents, spaces, punctuation) at or under its declared `maxLength`
- **THEN** validating that value against its component schema succeeds

### Requirement: Runtime validator string fields declare a length ceiling without a content pattern
The 5 `z.string()` fields in `src/validators/issue.validator.ts` that validate real incoming Jira/TC payloads (`issuePayload.id`, `issuePayload.key`, `fields.summary`, `fields.issuetype.name`, `issueBatch.initiatedBy`) SHALL declare a generous `maxLength` and SHALL NOT declare a content `pattern`.

#### Scenario: Real Jira text within bound is accepted
- **WHEN** an incoming ticket payload has `key`, `id`, `fields.summary`, `fields.issuetype.name`, and `initiatedBy` values within their declared `maxLength`
- **THEN** the payload passes validation regardless of punctuation, accents, or other non-control characters they contain

#### Scenario: Oversized field value is rejected
- **WHEN** an incoming ticket payload has one of these 5 fields exceeding its declared `maxLength`
- **THEN** validation fails for that field

### Requirement: Error status code is constrained to the valid HTTP range
The `statusCode` property of `ErrorResponse.error` SHALL declare `minimum: 100` and `maximum: 599`.

#### Scenario: Out-of-range status code fails schema validation
- **WHEN** a value for `ErrorResponse.error.statusCode` is less than 100 or greater than 599
- **THEN** validating that value against the component schema fails

#### Scenario: Real status codes used by the service validate
- **WHEN** `ErrorResponse.error.statusCode` is 200, 201, 400, 429, or 503
- **THEN** validating that value against the component schema succeeds

### Requirement: Response arrays declare a size bound consistent with real business rules
Array properties in response schemas SHALL declare a maximum (or exact, where a business rule dictates it) size: `IssueProcessResult.errors` (max 50), `IssueProcessResponse.tickets` (exactly 1, reflecting the one-ticket-per-request rule already enforced on the request side), `IssueContent.attachedDocuments` (max 100), `IssueContent.actions` (max 200).

#### Scenario: Tickets array length matches the one-ticket-per-request rule
- **WHEN** the `tickets` array in an `IssueProcessResponse` payload is validated
- **THEN** it is valid only when it contains exactly 1 item, matching `IssueBatchRequest.issues` on the request side

#### Scenario: Unbounded array exceeding its declared maximum is rejected
- **WHEN** the `errors`, `attachedDocuments`, or `actions` array in a response payload exceeds its declared maximum size
- **THEN** validating that payload against its component schema fails
