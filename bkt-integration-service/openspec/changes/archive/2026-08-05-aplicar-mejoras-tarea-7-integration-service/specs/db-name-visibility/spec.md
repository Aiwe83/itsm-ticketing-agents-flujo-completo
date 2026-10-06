## ADDED Requirements

### Requirement: Connection log reports active database name
The system SHALL log the active MongoDB database name (`mongoose.connection.name`) on successful connection, immediately after `mongoose.connect` resolves.

#### Scenario: Startup log contains database name
- **WHEN** the service connects to MongoDB at startup
- **THEN** an info log is emitted with the `database` field set to the connected database name

#### Scenario: Log not tied to connected listener
- **WHEN** the service connects at startup
- **THEN** the database-name log is emitted from the connect flow, not from the `connected` event listener (which never fires on startup)
