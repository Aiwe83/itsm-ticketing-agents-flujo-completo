## ADDED Requirements

### Requirement: Authenticate Jira ingestion requests
The system MUST require a valid API key for every route under `/api/`, using the header name configured by `API_KEY_HEADER` and a secret obtained only from `INTEGRATION_API_KEY`.

#### Scenario: Valid API key is provided
- **WHEN** a caller sends a valid single-ticket request with the configured API key
- **THEN** the request continues to validation and processing

#### Scenario: API key is missing or invalid
- **WHEN** a caller omits the configured header or supplies a different value
- **THEN** the system responds with `401`
- **AND** no execution or ticket is created

### Requirement: Keep liveness public
The system MUST allow `/health` to be called without an API key and MUST NOT expose ticket, configuration, credential, or dependency details in its response.

#### Scenario: Health is requested anonymously
- **WHEN** a caller requests `/health` without authentication
- **THEN** the system returns only its liveness result

### Requirement: Reject unsafe network configuration
The application MUST fail during startup when credentialed CORS uses wildcard origin, and it MUST derive proxy trust from a validated non-negative configuration value.

#### Scenario: Credentialed wildcard CORS is configured
- **WHEN** `CORS_CREDENTIALS` is true and `CORS_ORIGIN` is `*`
- **THEN** environment validation fails before the server listens

#### Scenario: Proxy hops are configured
- **WHEN** `TRUST_PROXY_HOPS` contains a valid non-negative integer
- **THEN** Express and rate limiting use that value consistently

### Requirement: Preserve single-ticket validation
The protected endpoint MUST continue accepting exactly one Jira ticket per request and MUST reject zero or multiple tickets with `400`.

#### Scenario: Multiple tickets are sent with valid authentication
- **WHEN** an authenticated request contains two issues
- **THEN** the system responds with `400`
- **AND** no ticket is persisted

### Requirement: Minimize ingestion responses
Successful ingestion responses MUST preserve `201`, execution and ticket identifiers, result status, errors, and timestamps, but MUST NOT echo the raw Jira payload or the complete translated ticket.

#### Scenario: Authenticated ticket is accepted
- **WHEN** a valid ticket is stored and translated
- **THEN** the response contains identifiers and processing status
- **AND** it contains neither `issue` nor `transformedIssue`

### Requirement: Prevent sensitive logging
The system MUST redact authorization, API-key, cookie, and password values and MUST NOT log complete request bodies or attachment contents.

#### Scenario: Authenticated request is logged
- **WHEN** the HTTP logger records the request
- **THEN** it records correlation and outcome metadata
- **AND** secret headers and body content are absent or redacted

### Requirement: Keep production dependencies within accepted risk
The production dependency audit MUST contain no known critical or high-severity vulnerability before the pilot is accepted. Unused authentication libraries MUST be removed when repository-wide inspection confirms no imports or runtime use.

#### Scenario: Dependency gate is executed
- **WHEN** the production audit runs after dependency updates
- **THEN** it reports zero critical and zero high-severity findings
- **AND** typecheck, tests, and build remain successful
