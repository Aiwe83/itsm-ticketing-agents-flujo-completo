## Context

TICK-17 is not a request to merge repositories. It asks for a real functional connection between the existing Forge trigger and the existing `integration-service`.

The Forge project already captures Jira issue-created and issue-updated events, builds a local single-issue `IssuesRequest`, sanitizes logs, and contains an HTTP client path for `integration-service`. The remaining closure work is activation, deployment, manual validation, and new sanitized evidence.

`integration-service` is treated as the destination service. Its relevant contract is `POST /api/v1/issues`, protected by an API key header and correlated with `X-Request-Id`. A `201` response is only transport acceptance; application success must be read from `data.summary.successIntegration` and `data.tickets[0].success`.

## Decisions

### 1. Keep both repositories separate

The implementation remains centered on `triggers`. `integration-service` is only started, exposed, called, and observed. Its code is not changed unless a real contract incompatibility blocks the demo.

Rationale:

- Forge and `integration-service` have different lifecycles and deployment models.
- The HTTP contract is the correct boundary between systems.
- A repository fusion would add risk and does not help prove the flow Francisco requested.

### 2. Use direct HTTPS POST for the demo

Forge sends a direct authenticated `POST /api/v1/issues` after the contract builder returns `ok:true`.

Rationale:

- The demo must be short, visible, and easy to explain.
- A queue or proxy can be considered later but is unnecessary for TICK-17.
- The current service already exposes the correct endpoint.

### 3. Treat public HTTPS reachability as a gate

Forge cannot call `localhost`. The chosen target must be reachable from Atlassian over HTTPS.

Preferred order:

1. Approved dev/staging URL for `integration-service`.
2. Approved corporate gateway or DMZ route.
3. Temporary HTTPS tunnel.

Cloudflare Tunnel may be preferred if already validated in this project. `ngrok` remains a valid alternative if approved or available. The tool is not the requirement; public HTTPS reachability is.

### 4. Keep secrets out of files and logs

Service URL and API key are configured through Forge variables. API key material must never appear in code, documentation, committed files, logs, or evidence.

### 5. Preserve response truth

The integration is considered successful only when:

- the request reaches `integration-service`;
- the response status is successful, expected `201`;
- `data.summary.successIntegration === true`;
- `data.tickets[0].success === true`;
- a `storedTicketId` or equivalent service identifier is present when available.

## Interfaces

### Outbound request

```text
POST <INTEGRATION_SERVICE_BASE_URL>/api/v1/issues
Content-Type: application/json
X-Request-Id: <correlationId>
X-API-KEY: <encrypted Forge variable value>
```

Minimal body:

```json
{
  "initiatedBy": "forge-trigger-demo",
  "issues": [
    {
      "key": "DTJF-XX",
      "fields": {
        "summary": "full ticket summary travels only in the HTTP body"
      }
    }
  ]
}
```

Rules:

- exactly one issue per request;
- `key` is required;
- `fields.summary` is required;
- optional fields may be sent when present but must not be logged as free text.

### Forge variables

```text
INTEGRATION_SERVICE_BASE_URL
INTEGRATION_SERVICE_API_KEY
INTEGRATION_SERVICE_API_KEY_HEADER
```

`INTEGRATION_SERVICE_API_KEY` must be encrypted. The header defaults to `X-API-KEY` if not overridden.

### Manifest egress

During an active demo, `manifest.yml` may declare one remote and backend fetch permission for the selected HTTPS destination. Outside the demo, the repository returns to the at-rest state with no egress declared.

## Flow

1. A Jira issue is created or updated in the configured development project.
2. Forge receives `avi:jira:created:issue` or `avi:jira:updated:issue`.
3. The handler generates one `correlationId`.
4. The handler sanitizes log metadata.
5. `buildIssuesRequest()` validates and builds the request.
6. If valid, Forge sends `POST /api/v1/issues` with `X-Request-Id=<correlationId>`.
7. `integration-service` validates the API key and payload.
8. Forge records sanitized response metadata.
9. Evidence links the Forge `correlationId` and service `X-Request-Id`.

## Failure Handling

- Missing runtime config: fail closed; no outbound request.
- Invalid payload: fail closed; no outbound request.
- Network or timeout failure: record classified failure; handler does not crash.
- HTTP failure: record status and sanitized summary.
- Invalid response shape: record parse/classification failure.
- `201` with failed application body: record application failure, not success.

## Security and Evidence

Logs and evidence must not contain:

- API keys or tokens;
- emails or display names;
- raw account/user data;
- ticket description;
- raw ticket title;
- attachment data;
- unapproved internal URLs or sensitive hostnames.

Evidence must contain only the operational proof needed for review: issue key, timestamps, event type, correlation IDs, status, application success flags, stored ticket identifier, and conclusion.

## Rollback

After capturing evidence, restore the demo to its at-rest state:

```powershell
git checkout -- manifest.yml
forge variables unset INTEGRATION_SERVICE_BASE_URL
forge variables unset INTEGRATION_SERVICE_API_KEY
forge deploy -e development --non-interactive
```

Then verify:

```powershell
forge variables list
```

Expected result: no active integration variables remain.

## Risks

- The URL in `manifest.yml` and `INTEGRATION_SERVICE_BASE_URL` can drift, causing Forge egress failures.
- A temporary tunnel can expire or drop during the demo.
- A `201` response can be misread as full success if the response body is ignored.
- `integration-service` may echo the raw issue payload in its response; Forge must not re-log it.
- Evidence can leak sensitive information if copied directly from raw logs.
- Changing `integration-service` without a proven incompatibility would expand the scope.

## Verification Strategy

- Validate OpenSpec after proposal updates.
- Run local gates before any deployment: `npm run typecheck`, `npm run lint`, `npm test`, `forge lint`.
- Smoke-test `integration-service` locally and through the chosen HTTPS URL.
- Execute one created-ticket and one updated-ticket Jira flow.
- Confirm response truth: HTTP `201`, `successIntegration=true`, `tickets[0].success=true`.
- Confirm correlation: Forge `correlationId` equals service `X-Request-Id`.
- Confirm logs/evidence are sanitized.

## Follow-up Outside TICK-17 Minimum Closure

Add a hardening regression test proving Forge never logs `data.tickets[0].issue` if `integration-service` echoes the original payload. This is recommended quality work, but it is not required to prove the manual end-to-end flow requested by TICK-17.
