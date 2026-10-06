## ADDED Requirements

### Requirement: Plain Error handled without stack exposure
The error middleware SHALL handle a plain `Error` (not an `HttpError`) without exposing the `stack` in the HTTP response.

#### Scenario: Plain error returns 500 without stack
- **WHEN** a route throws a plain `Error` with message `'Unexpected boom'`
- **THEN** the HTTP response has status 500, exposes the error message and code, and has no `stack` property

#### Scenario: Plain error logged server-side
- **WHEN** a plain `Error` reaches the error middleware
- **THEN** the error is logged server-side with the `stack` retained for diagnostics
