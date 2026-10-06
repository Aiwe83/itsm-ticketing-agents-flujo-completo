## Purpose
Definir el comportamiento de ingestion Jira con adjuntos, incluyendo persistencia bruta, enriquecimiento controlado y trazabilidad sin bloquear la respuesta HTTP.

## Requirements

### Requirement: Accept exactly one Jira ticket per request
The system MUST keep `POST /api/v1/issues` as the only supported ingestion endpoint for Jira/TC tickets.
The system MUST accept exactly one ticket inside `issues`.
The system MUST reject requests with zero tickets or more than one ticket.
The system MUST NOT expose unsupported parallel ingestion endpoints.

#### Scenario: One Jira ticket is accepted
- **WHEN** a request contains exactly one Jira ticket in `issues`
- **THEN** the request is accepted for processing

#### Scenario: Empty or batched input is rejected
- **WHEN** a request contains zero tickets or more than one ticket
- **THEN** the system returns a validation error

#### Scenario: Unsupported parallel ingestion route is rejected
- **WHEN** a client calls an unsupported parallel ingestion route
- **THEN** the system returns 404
- **AND** no raw ticket, translated ticket, or execution document is created

### Requirement: Persist the raw Jira ticket before translation
The system MUST store the incoming Jira ticket in `itsm_tickets` before applying mappings.
The stored raw document MUST preserve the original ticket content so the request can be audited later.
Attachment processing MUST NOT modify the raw ticket content.

#### Scenario: Raw ticket is stored unchanged
- **WHEN** a valid Jira ticket with attachments is received
- **THEN** the original ticket payload is persisted in `itsm_tickets`
- **AND** the raw payload still contains the original attachment data as received

### Requirement: Translate Jira fields using mappings
The system MUST translate the raw ticket using MongoDB mappings and store the result in `tickets`.
The translated ticket MUST use Jira-aligned field names, including `status` instead of `statusSp`.
The translated ticket MAY include `content.attachedDocuments` when supported attachments are present.

#### Scenario: Translated ticket contains attachment text
- **WHEN** a valid Jira ticket contains a supported attachment
- **THEN** the translated ticket is stored in `tickets`
- **AND** `content.attachedDocuments` contains the attachment filename and plain text

#### Scenario: Unsupported attachment does not fail the ticket
- **WHEN** a valid Jira ticket contains an unsupported attachment
- **THEN** the ticket can still be translated successfully
- **AND** the attachment entry records a skipped reason

### Requirement: Download remote Jira attachments safely
The system MUST download remote attachments only from the configured Jira origin.
The system MUST NOT follow redirects for attachment downloads.
The system MUST apply a maximum response size to remote attachment downloads.
The system MUST use Jira credentials only from environment variables.
The system MUST redact authorization and password data from logs.

#### Scenario: Remote attachment from allowed Jira origin is downloaded
- **WHEN** an attachment URL has the same origin as `JIRA_BASE_URL`
- **THEN** the system may download the attachment using configured Jira credentials

#### Scenario: Remote attachment from another origin is rejected
- **WHEN** an attachment URL points to a different origin
- **THEN** the system rejects the download
- **AND** the ticket processing continues with a skipped attachment result

#### Scenario: Remote attachment response is too large
- **WHEN** a remote attachment exceeds the configured byte limit
- **THEN** the system stops accepting the attachment content
- **AND** the attachment is marked as skipped because it is too large

### Requirement: Notify the orchestrator after persistence and enrichment
The system MUST trigger the orchestrator notification after raw persistence, translation, translated-ticket persistence, and attachment enrichment have been attempted.
The HTTP response MUST NOT wait for the orchestrator to finish.
The system MUST record attachment and orchestrator errors in `executions`.

#### Scenario: Orchestrator sees enriched translated ticket
- **WHEN** a valid ticket with a supported attachment is processed
- **THEN** the translated ticket already contains `content.attachedDocuments` before the orchestrator is notified

#### Scenario: Attachment processing error is traced
- **WHEN** attachment processing fails after the ticket was translated
- **THEN** the execution records the attachment error
- **AND** the translated ticket remains available
- **AND** the HTTP response is not blocked by the attachment or orchestrator result
