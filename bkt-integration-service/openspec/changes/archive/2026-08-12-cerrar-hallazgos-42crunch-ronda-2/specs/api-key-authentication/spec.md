## ADDED Requirements

### Requirement: Protected operations require a valid API key

Requests to `GET /api/v1` and `POST /api/v1/issues` SHALL require a valid API key sent in the
header named by the `API_KEY_HEADER` environment variable (default `X-API-KEY`). `GET /health`
SHALL NOT require an API key.

#### Scenario: Request without an API key header is rejected

- **WHEN** a request to `GET /api/v1` or `POST /api/v1/issues` is sent without the configured API
  key header
- **THEN** the request is rejected before reaching the route handler

#### Scenario: Request with the correct API key succeeds

- **WHEN** a request to `GET /api/v1` or `POST /api/v1/issues` includes the configured header with
  a value equal to the service's `API_KEY`
- **THEN** the request reaches the route handler and is processed normally

#### Scenario: Request with an incorrect API key is rejected

- **WHEN** a request to `GET /api/v1` or `POST /api/v1/issues` includes the configured header with
  a value that does not match the service's `API_KEY`
- **THEN** the request is rejected before reaching the route handler

#### Scenario: Health check does not require an API key

- **WHEN** a request to `GET /health` is sent without any API key header
- **THEN** the request reaches the route handler and is processed normally

### Requirement: Rejected requests return a 401 with the standard error shape

A request rejected for a missing or invalid API key SHALL receive an HTTP 401 response shaped
like every other error response in the service (`ErrorResponse`: `success: false`, `error.message`,
`error.code`, `error.statusCode`, `error.timestamp`, and `error.requestId`/`error.path` when
available), and SHALL NOT reveal whether the key was missing or merely incorrect.

#### Scenario: Missing and incorrect API key produce the same error message

- **WHEN** comparing the response body for a request with no API key header against the response
  body for a request with an incorrect API key
- **THEN** both responses have the same `error.message` and `error.code`

#### Scenario: 401 response matches the ErrorResponse contract

- **WHEN** a request is rejected for a missing or invalid API key
- **THEN** the response body validates against the `ErrorResponse` component schema and the HTTP
  status code is 401

### Requirement: The service fails to start without a configured API key

`API_KEY` SHALL be a required environment variable with no default value. The service SHALL fail
to start if `API_KEY` is not set, regardless of `NODE_ENV`.

#### Scenario: Startup fails when API_KEY is missing

- **WHEN** the service is started without an `API_KEY` environment variable set
- **THEN** environment validation fails and the process does not start accepting requests

#### Scenario: Startup succeeds when API_KEY is present

- **WHEN** the service is started with a non-empty `API_KEY` environment variable set
- **THEN** environment validation succeeds and the process starts normally

### Requirement: Generated OpenAPI document declares ApiKeyAuth for protected operations

The generated OpenAPI document SHALL declare `security: [{ ApiKeyAuth: [] }]` on the `getApiRoot`
and `createIssues` operations, SHALL keep `security: []` on `getHealth`, and the `ApiKeyAuth`
security scheme SHALL NOT be marked as unenforced.

#### Scenario: getApiRoot requires ApiKeyAuth

- **WHEN** the `getApiRoot` operation object is inspected
- **THEN** its `security` array contains an entry referencing `ApiKeyAuth`

#### Scenario: createIssues requires ApiKeyAuth

- **WHEN** the `createIssues` operation object is inspected
- **THEN** its `security` array contains an entry referencing `ApiKeyAuth`

#### Scenario: getHealth remains unauthenticated in the document

- **WHEN** the `getHealth` operation object is inspected
- **THEN** its `security` array is empty

#### Scenario: Protected operations document a 401 response

- **WHEN** the `responses` object of `getApiRoot` or `createIssues` is inspected
- **THEN** it includes a `401` entry referencing the `ErrorResponse` component schema
