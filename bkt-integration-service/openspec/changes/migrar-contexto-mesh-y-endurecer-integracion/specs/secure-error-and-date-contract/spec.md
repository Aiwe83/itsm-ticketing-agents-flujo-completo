## ADDED Requirements

### Requirement: Never expose stack traces in HTTP responses
The service MUST NOT include a `stack` property or stack-trace content in any HTTP error response, regardless of environment or error type.

#### Scenario: Malformed JSON is rejected locally
- **WHEN** a client sends malformed JSON while the service runs in `local`
- **THEN** the service responds with `400` and `VALIDATION_ERROR`
- **AND** the response does not contain `stack`

#### Scenario: Unexpected error reaches the middleware
- **WHEN** an unexpected error reaches the global exception handler
- **THEN** the response contains the public error contract only
- **AND** no stack-trace line is returned to the client

### Requirement: Preserve sanitized diagnostic logs
The service MUST log the complete diagnostic stack for operational and non-operational errors together with available request correlation data. Logs MUST exclude request bodies, attachment contents, credentials, tokens, cookies and authorization headers.

#### Scenario: Operational validation error is logged
- **WHEN** an operational error is handled
- **THEN** the logger receives its message, code, stack, method, path and available request ID
- **AND** sensitive request data is absent

#### Scenario: Unexpected error is logged
- **WHEN** a non-operational error is handled
- **THEN** the logger receives the original error and full stack for diagnosis
- **AND** the client still receives no stack

### Requirement: Persist MongoDB dates as BSON Date
All persisted date fields managed by the service MUST use MongoDB BSON `Date`, not ISO strings. The migration MUST convert valid ISO strings in known date fields and MUST report invalid strings as conflicts.

#### Scenario: Mapping dates are migrated
- **WHEN** a mapping contains string values for `createdAt` or `updatedAt` with valid ISO timestamps
- **THEN** the destination mapping stores both values as BSON `Date`

#### Scenario: Invalid date is encountered
- **WHEN** the migration finds a non-empty date string that cannot be parsed safely
- **THEN** dry-run reports the document as a conflict
- **AND** apply does not invent or overwrite that date

### Requirement: Serialize external dates as ISO 8601 UTC
Dates returned by the HTTP API and emitted as log timestamps MUST use the UTC format `YYYY-MM-DDTHH:mm:ss.sssZ`.

#### Scenario: Health or error timestamp is returned
- **WHEN** the service serializes a timestamp in an HTTP response
- **THEN** the value is valid ISO 8601 UTC and ends in `Z`

