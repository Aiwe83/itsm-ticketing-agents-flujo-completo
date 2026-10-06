## MODIFIED Requirements

### Requirement: Server URL is absolute and environment-parameterized

The generated OpenAPI document's `servers` entry SHALL declare an absolute URL template
(`{protocol}://{host}`) with `protocol` (default `https`, enum `[https]`) and `host` (default
`localhost:8000`) server variables, instead of a relative URL, while remaining overridable per
deployment environment.

#### Scenario: Server URL resolves to an absolute URL by default

- **WHEN** the `servers[0].url` template is resolved using the declared variable defaults
- **THEN** it resolves to `https://localhost:8000`

#### Scenario: Server URL is not a bare relative path

- **WHEN** the `servers[0].url` field is inspected
- **THEN** it is not the literal string `/`

#### Scenario: protocol variable only allows https

- **WHEN** the `protocol` server variable's `enum` is inspected
- **THEN** it contains exactly `[https]`, with no `http` option
