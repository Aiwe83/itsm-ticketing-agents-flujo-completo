## Why

The Jira Forge trigger prototype proved that issue events could be captured, but three gaps remained and none of them was described by any change:

1. **Nothing had ever been deployed.** The handler had only been invoked by hand from a local script. Whether Jira would call it at all was an assumption.
2. **The flow stopped before the network boundary.** Every real invocation reported `sent: false`. It was never demonstrated that a Jira event could produce an outbound HTTP request that a destination accepts.
3. **The demo depended on people.** Showing the behaviour required a Forge session, a Jira site and a reachable service. That made it impossible to run on a laptop, offline, in front of anyone.

This change closes all three, and does so **without connecting to `integration-service`**. That integration is separate work for a later effort. The client only needs a destination that satisfies the contract — `POST /api/v1/issues`, and a response confirming the ticket was stored. `integration-service` would be one implementation of that contract, not the contract itself.

## What Changes

- Deploy the app to a real Jira site and capture evidence of events fired by Jira itself, not by a script.
- Demonstrate the full flow end to end against a stand-in receiver: a Jira ticket produces an accepted outbound request, with the correlation identifier returning identical in the response.
- Add an offline demo runner with six scenarios that exercise the whole path with no Forge, no Jira, no network and no external service.
- Add `listen` and `send` scenarios that keep a receiver alive on a fixed port so the outgoing request can be inspected live. Deliberately excluded from the `all` registry: `listen` never terminates.
- Add `.forgeignore` so the deployment package excludes build output, tests, working documentation and backups.
- Scope the trigger to a single project with `filter.expression`, plus `onError: RECEIVE_AND_LOG` so a failed evaluation leaves a trace instead of dropping the event.
- Add a step-by-step manual test guide whose every expected output is a captured value, not an invented one.
- Add version control. The project was not a git repository; a baseline was committed before anything was touched.
- Do not modify `integration-service`.
- Do not modify `src/`. Verifiable: `git diff <baseline> -- src/` is empty.

## Capabilities

### New Capabilities

- `forge-trigger-flow-demo`: Demonstrates the complete Jira Forge trigger flow — event capture, allowlist sanitisation, contract construction and an accepted outbound request — verified against real Jira events and reproducible offline without any external service.

### Modified Capabilities

- None.

## Non-goals

- Connecting to `integration-service`. Separate work, later.
- Proving behaviour on the corporate Jira. The test site is personal: no corporate proxy, no admin-consent friction, a different field schema.
- Keeping data egress declared permanently. The tunnel URL is ephemeral by nature.
