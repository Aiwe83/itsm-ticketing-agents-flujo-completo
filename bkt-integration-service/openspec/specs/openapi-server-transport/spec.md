# openapi-server-transport Specification

## Purpose

TBD - Defines how the generated OpenAPI document describes transport-level concerns that are not tied to a single schema or response: the `servers` URL template (absolute, environment-parameterized) and the explicit per-operation `security` declaration.

## Requirements

### Requirement: Server URL is absolute and environment-parameterized
The generated OpenAPI document's `servers` entry SHALL declare an absolute URL template (`{protocol}://{host}`) with `protocol` (default `https`, enum `[https]`) and `host` (default `localhost:8000`) server variables, instead of a relative URL, while remaining overridable per deployment environment.

#### Scenario: Server URL resolves to an absolute URL by default
- **WHEN** the `servers[0].url` template is resolved using the declared variable defaults
- **THEN** it resolves to `https://localhost:8000`

#### Scenario: Server URL is not a bare relative path
- **WHEN** the `servers[0].url` field is inspected
- **THEN** it is not the literal string `/`

#### Scenario: protocol variable only allows https
- **WHEN** the `protocol` server variable's `enum` is inspected
- **THEN** it contains exactly `[https]`, with no `http` option

### Requirement: Security requirement is explicit on every operation
Every operation in the generated OpenAPI document (`getHealth`, `getApiRoot`, `createIssues`) SHALL declare its own `security` array explicitly, rather than relying on inheriting the document-level `security` default.

#### Scenario: getHealth declares security explicitly
- **WHEN** the `getHealth` operation object is inspected
- **THEN** it has a `security` property (an explicit, possibly empty, array)

#### Scenario: getApiRoot declares security explicitly
- **WHEN** the `getApiRoot` operation object is inspected
- **THEN** it has a `security` property (an explicit, possibly empty, array)

#### Scenario: createIssues declares security explicitly
- **WHEN** the `createIssues` operation object is inspected
- **THEN** it has a `security` property (an explicit, possibly empty, array)
