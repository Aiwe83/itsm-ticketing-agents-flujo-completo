## ADDED Requirements

### Requirement: Documented error responses match real global error handling
The generated OpenAPI document SHALL declare a `404` response, referencing `ErrorResponse`, on every GET operation, because `notFoundHandler` (`src/middlewares/error.middleware.ts`) is mounted globally after all routes and can respond to any unmatched request path reaching a GET operation.

#### Scenario: getHealth documents a 404 response
- **WHEN** the `responses` object of the `getHealth` operation is inspected
- **THEN** it includes a `404` entry referencing the `ErrorResponse` schema

#### Scenario: getApiRoot documents a 404 response
- **WHEN** the `responses` object of the `getApiRoot` operation is inspected
- **THEN** it includes a `404` entry referencing the `ErrorResponse` schema

### Requirement: Documented rate-limit responses match the real limiter scope
The generated OpenAPI document SHALL declare a `429` response, referencing `RateLimitErrorResponse`, on every operation mounted under `/api/` (`getApiRoot`, `createIssues`), and SHALL NOT declare it on `getHealth`, because the rate limiter in `src/app.ts` is mounted only on the `/api/` prefix.

#### Scenario: getApiRoot documents a 429 response
- **WHEN** the `responses` object of the `getApiRoot` operation is inspected
- **THEN** it includes a `429` entry referencing the `RateLimitErrorResponse` schema

#### Scenario: getHealth does not document a 429 response
- **WHEN** the `responses` object of the `getHealth` operation is inspected
- **THEN** it does not include a `429` entry

### Requirement: Every operation documents a default fallback error response
The generated OpenAPI document SHALL declare a `default` response, referencing `ErrorResponse`, on `getHealth`, `getApiRoot`, and `createIssues`, because `exceptionHandler` (`src/middlewares/error.middleware.ts`) is the last global middleware and can return an error for any unhandled failure on any operation.

#### Scenario: All three operations document a default response
- **WHEN** the `responses` object of `getHealth`, `getApiRoot`, and `createIssues` is inspected
- **THEN** each includes a `default` entry referencing the `ErrorResponse` schema

### Requirement: No responses are documented for behavior the service does not exhibit
The generated OpenAPI document SHALL NOT declare `406` or `415` responses on any operation, because this service performs no content negotiation (`res.format()`/`req.accepts()`) and `express.json()` does not reject unexpected `Content-Type` values with a 415 — a wrong content type falls through to a `400` validation error instead.

#### Scenario: No operation documents a 406 response
- **WHEN** the `responses` object of any operation is inspected
- **THEN** it does not include a `406` entry

#### Scenario: No operation documents a 415 response
- **WHEN** the `responses` object of any operation is inspected
- **THEN** it does not include a `415` entry
