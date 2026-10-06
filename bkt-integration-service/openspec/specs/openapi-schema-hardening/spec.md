# openapi-schema-hardening Specification

## Purpose

TBD - Defines how strictly the generated OpenAPI component schemas constrain payload shape: which self-owned response schemas reject unknown properties, which mapping-driven/echoed schemas stay open, and the length/pattern/range/array-size bounds declared on documentation and runtime-validator string and array fields.

## Requirements

### Requirement: Own response schemas reject unknown properties
The generated OpenAPI document SHALL declare `additionalProperties: false` for response schemas whose full property set is defined and controlled by this service (`ExecutionError`, `AttachedDocument`, `IssueInfo`, `IssueProcessResult`, `IssueProcessSummary`, `IssueProcessResponse`, `IssueAcceptedResponse`, `ErrorResponse` and its nested `error` object, `RateLimitErrorResponse` and its nested `error` object, `HealthResponse`, `ApiRootResponse`).

#### Scenario: Unknown property in a self-owned response schema fails validation
- **WHEN** a payload shaped like `ExecutionError` includes a property not declared in its schema
- **THEN** validating that payload against the `ExecutionError` component schema fails

### Requirement: Mapping-driven and echoed schemas remain open
The generated OpenAPI document SHALL NOT restrict which property names are allowed on schemas whose real contract is driven by external data: `IssueContent` (and its nested `technicianInfo`), `IssuePayload`, `IssueBatchRequest`, and their nested `fields`/`issuetype` objects. Their `additionalProperties` SHALL reference a typed JSON value schema (`JsonValue`) rather than an unconstrained empty schema, so extra properties are still declared to be valid JSON without naming or restricting them.

#### Scenario: Mapping-driven extra property in IssueContent still validates
- **WHEN** a payload shaped like `IssueContent` includes a property not explicitly listed in the schema (as produced by a `mappings` MongoDB entry targeting a new subfield)
- **THEN** validating that payload against the `IssueContent` component schema succeeds

#### Scenario: Echoed Jira payload with extra fields still validates
- **WHEN** a payload shaped like `IssuePayload` includes Jira fields beyond `id`, `key`, and `fields`
- **THEN** validating that payload against the `IssuePayload` component schema succeeds

#### Scenario: additionalProperties on an open schema is typed, not empty
- **WHEN** the `additionalProperties` keyword of `IssuePayload`, `IssueBatchRequest`, their nested `fields`/`issuetype` objects, `IssueContent`, or `technicianInfo` is inspected
- **THEN** it is a `$ref` to the `JsonValue` component schema, not an empty `{}` schema

### Requirement: Documentation-only string fields declare length and a control-character-safe pattern
Every `z.string()` field defined in `src/openapi/schemas.ts` (used only for OpenAPI documentation, never for real request/response validation) SHALL declare a `maxLength` and a `pattern` that rejects control characters while accepting all other Unicode text.

#### Scenario: Documentation string field rejects control characters
- **WHEN** a value for a documentation-only string field (e.g. `IssueContent.title`) contains a control character such as `\x00` or `\x1F`
- **THEN** validating that value against its component schema's `pattern` fails

#### Scenario: Documentation string field accepts normal Unicode text within bound
- **WHEN** a value for a documentation-only string field contains normal Unicode text (letters, accents, spaces, punctuation) at or under its declared `maxLength`
- **THEN** validating that value against its component schema succeeds

### Requirement: Runtime validator string fields declare a length ceiling and a control-character-safe pattern
The 5 `z.string()` fields in `src/validators/issue.validator.ts` that validate real incoming Jira/TC payloads (`issuePayload.id`, `issuePayload.key`, `fields.summary`, `fields.issuetype.name`, `issueBatch.initiatedBy`) SHALL declare a generous `maxLength` and SHALL declare a `pattern` that rejects control characters while accepting all other Unicode text — the same `freeText` pattern already used throughout `src/openapi/schemas.ts` for documentation-only fields.

#### Scenario: Real Jira text within bound is accepted
- **WHEN** an incoming ticket payload has `key`, `id`, `fields.summary`, `fields.issuetype.name`, and `initiatedBy` values within their declared `maxLength` and containing no control characters
- **THEN** the payload passes validation regardless of punctuation, accents, emoji, or other non-control Unicode characters they contain

#### Scenario: Oversized field value is rejected
- **WHEN** an incoming ticket payload has one of these 5 fields exceeding its declared `maxLength`
- **THEN** validation fails for that field

#### Scenario: Control character in one of these fields is rejected
- **WHEN** an incoming ticket payload has one of these 5 fields containing a control character such as `\x00` or `\x1F`
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

### Requirement: Open additionalProperties declare a typed, finite JSON value schema instead of an empty schema
Every schema whose `additionalProperties` is intentionally left open (mapping-driven/echoed schemas) SHALL reference a `JsonValue` component schema — a **finite, non-recursive** `anyOf` of `JsonPrimitive` (string, number, or boolean), an array of `JsonPrimitive`, or an object of `JsonPrimitive` values — instead of an empty `{}` schema. `JsonValue` SHALL NOT reference itself, directly or indirectly, in any branch.

`ErrorResponse.error.details` is explicitly OUT of scope for this requirement: its real shape is polymorphic and nests deeper than `JsonValue`'s bounded depth allows (see the `openapi-response-completeness` Non-Goal on `error.details` from the prior hardening round). It SHALL remain an empty `{}` schema.

#### Scenario: JsonValue does not reference itself
- **WHEN** the `JsonValue` component schema (including every schema it transitively references) is inspected
- **THEN** no branch of `JsonValue` resolves back to `JsonValue`, directly or through any other component schema

#### Scenario: JsonValue accepts a null leaf value
- **WHEN** a `null` value (as produced by an optional Jira/mapping field with no value) is validated against `JsonValue`
- **THEN** validation succeeds

#### Scenario: error.details stays an empty schema, by design
- **WHEN** the `details` property of the `ErrorResponse.error` component schema is inspected
- **THEN** it is still an empty `{}` schema, not a `$ref` to `JsonValue`
