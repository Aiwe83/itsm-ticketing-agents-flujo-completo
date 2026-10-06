## 1. Explore and Preflight

- [x] 1.1 Read the TICK-17 task document and confirm the real objective: Jira issue -> Forge trigger -> `integration-service` -> sanitized evidence.
- [x] 1.2 Confirm the implementation should stay in `triggers` and `integration-service` should remain an external destination unless a real incompatibility is found.
- [x] 1.3 Confirm the expected service contract: `POST /api/v1/issues`, one issue, `key`, `fields.summary`, `X-API-KEY`, `X-Request-Id`, `successIntegration`, and `tickets[0].success`.
- [x] 1.4 Confirm the live HTTPS transport for the demo: approved dev/staging URL, corporate gateway, Cloudflare Tunnel, or ngrok.
- [x] 1.5 Confirm Forge manual prerequisites: `forge whoami`, target Jira development site, project key, app installation permissions, and `forge lint`.

## 2. Existing Forge Implementation Baseline

- [x] 2.1 Keep Jira trigger capture for `avi:jira:created:issue` and `avi:jira:updated:issue`.
- [x] 2.2 Keep `buildIssuesRequest()` as the single send gate for outbound payloads.
- [x] 2.3 Keep runtime configuration through Forge variables.
- [x] 2.4 Keep the integration HTTP client path for `POST /api/v1/issues`.
- [x] 2.5 Keep response classification based on both HTTP transport and application result fields.
- [x] 2.6 Keep sanitized structured logs and avoid logging raw ticket free text or secrets.

## 3. Demo Configuration

- [x] 3.1 Start from an at-rest manifest before the demo. Do not reuse stale tunnel URLs already present in a local uncommitted `manifest.yml`.
- [x] 3.2 Add one temporary `remotes` entry in `manifest.yml` for the chosen HTTPS destination.
- [x] 3.3 Add `permissions.external.fetch.backend` pointing only to that remote.
- [x] 3.4 Set `INTEGRATION_SERVICE_BASE_URL` to the exact same HTTPS base URL used in `manifest.yml`.
- [x] 3.5 Set encrypted `INTEGRATION_SERVICE_API_KEY`.
- [x] 3.6 Set `INTEGRATION_SERVICE_API_KEY_HEADER` only if the service does not use the default `X-API-KEY`.

## 4. Service Readiness

- [x] 4.1 Start `integration-service` locally or confirm the approved dev/staging service is available.
- [x] 4.2 Confirm `GET /health` returns HTTP `200` locally.
- [x] 4.3 Expose the service over the selected HTTPS transport if local.
- [x] 4.4 Confirm `GET https://<selected-url>/health` returns HTTP `200`.
- [x] 4.5 Smoke-test `POST /api/v1/issues` through the selected HTTPS URL with a single test issue and required headers.

## 5. Local Gates Before Deploy

- [x] 5.1 Run `npm run typecheck`.
- [x] 5.2 Run `npm run lint`.
- [x] 5.3 Run `npm test`.
- [x] 5.4 Run `forge lint`.

## 6. Forge Deploy and Real Jira Demo

- [x] 6.1 Deploy the Forge app to development with the temporary egress configuration.
- [x] 6.2 Install or upgrade the app on the selected Jira development site and accept the expected egress consent if prompted.
- [x] 6.3 Create one real ticket in the configured Jira project.
- [x] 6.4 Confirm Forge logs show the created-event invocation and integration response.
- [x] 6.5 Confirm `integration-service` received the request and returned HTTP `201`.
- [x] 6.6 Confirm the response body reports `successIntegration=true` and `tickets[0].success=true`.
- [x] 6.7 Update the same ticket and repeat the created-flow checks for the updated-event invocation.
- [x] 6.8 Confirm Forge `correlationId` and service `X-Request-Id` match for each invocation.

## 7. Evidence and Cleanup

- [x] 7.1 Save new sanitized evidence under `docs/evidence/forge-to-integration-service-<YYYY-MM-DD>.txt`.
- [x] 7.2 Include issue key, timestamps, event type, correlation IDs, HTTP status, `successIntegration`, `tickets[0].success`, stored ticket identifier, and conclusion.
- [x] 7.3 Confirm evidence contains no API keys, tokens, emails, display names, raw title, description, attachments, or sensitive URLs.
- [x] 7.4 Close the temporary tunnel if one was used.
- [x] 7.5 Restore `manifest.yml` to the at-rest no-egress state after evidence capture.
- [x] 7.6 Unset Forge runtime variables for the integration.
- [x] 7.7 Redeploy the at-rest Forge app.
- [x] 7.8 Confirm `forge variables list` shows no active integration variables.

## 8. OpenSpec and Handoff

- [x] 8.1 Convert the cleaned implementation plan into OpenSpec proposal/design/tasks/spec deltas.
- [x] 8.2 Add the `jira-forge-trigger-demo` modified spec delta so the prior no-egress requirement is reconciled with the new controlled integration-service capability.
- [x] 8.3 Run `openspec validate connect-forge-trigger-to-integration-service --strict`.
- [x] 8.4 Do not run `/opsx-apply`, `/opsx-verify`, or `/opsx-archive` until explicitly authorized.
