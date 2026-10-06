## ADDED Requirements

### Requirement: Server URL is absolute and environment-parameterized
The generated OpenAPI document's `servers` entry SHALL declare an absolute URL template (`{protocol}://{host}`) with `protocol` (default `https`, enum `[https, http]`) and `host` (default `localhost:8000`) server variables, instead of a relative URL, while remaining overridable per deployment environment.

#### Scenario: Server URL resolves to an absolute URL by default
- **WHEN** the `servers[0].url` template is resolved using the declared variable defaults
- **THEN** it resolves to `https://localhost:8000`

#### Scenario: Server URL is not a bare relative path
- **WHEN** the `servers[0].url` field is inspected
- **THEN** it is not the literal string `/`

#### Scenario: Local docker-compose deployment can override to plain HTTP
- **WHEN** the `protocol` server variable is overridden to `http` for a local deployment
- **THEN** the resulting server URL is a valid absolute `http://` URL, consistent with the unencrypted local `docker-compose.yaml` stack on port 8000

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
