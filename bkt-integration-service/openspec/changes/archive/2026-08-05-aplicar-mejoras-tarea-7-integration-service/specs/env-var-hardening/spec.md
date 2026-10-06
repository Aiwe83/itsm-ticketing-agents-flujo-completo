## ADDED Requirements

### Requirement: Empty boolean env vars apply defaults
The system SHALL apply the configured default when `LOG_PRETTY_PRINT` or `CORS_CREDENTIALS` is set to an empty string in the environment.

#### Scenario: Empty LOG_PRETTY_PRINT applies default false
- **WHEN** `LOG_PRETTY_PRINT` is set to an empty string and the application environment is loaded
- **THEN** `env.LOG_PRETTY_PRINT` is `false`

#### Scenario: Empty CORS_CREDENTIALS applies default true
- **WHEN** `CORS_CREDENTIALS` is set to an empty string and the application environment is loaded
- **THEN** `env.CORS_CREDENTIALS` is `true`

### Requirement: Strict boolean parsing is preserved
The system SHALL parse `'false'` and `'true'` string values as booleans without coercing truthy strings.

#### Scenario: Explicit false string stays false
- **WHEN** `LOG_PRETTY_PRINT=false` is set in the environment
- **THEN** `env.LOG_PRETTY_PRINT` is `false`

#### Scenario: Explicit true string stays true
- **WHEN** `CORS_CREDENTIALS=true` is set in the environment
- **THEN** `env.CORS_CREDENTIALS` is `true`
