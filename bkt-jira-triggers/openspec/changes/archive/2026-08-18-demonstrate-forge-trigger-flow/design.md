## Context

The prototype was correct but unprovable: it had never run anywhere except a developer's machine, invoked by a script. Every claim about its behaviour rested on fixtures written by the same people who wrote the code.

The decisions below were all made against real observations, several of which contradicted what had been assumed.

## Decision: a stand-in receiver instead of the real service

The client validates the response, not the responder. It requires `POST /api/v1/issues` to return a body where `data.summary.successIntegration` and `data.tickets[0].success` are both `true`.

A twenty-line HTTP receiver satisfies that. `integration-service` is one implementation of the same contract.

**Consequence:** the full flow can be demonstrated today, without waiting for a service that belongs to a different effort, and without the demo depending on that service being up.

## Decision: `listen` and `send` stay out of the `all` registry

`scripts/demo-local.js` dispatches scenarios from an `ESCENARIOS` map that `all` iterates. `listen` runs until interrupted.

Including it would make `npm run demo -- all` hang forever. The two live-inspection scenarios are therefore dispatched separately in `main()`, with a comment explaining why.

## Decision: the project filter was written after observing a real event, not before

`filter.expression` assumes the payload carries `issue.fields.project.key`. If it did not, the expression would evaluate false forever: **the trigger would go silent and produce no error explaining it.** That failure mode is indistinguishable from a broken deployment.

So the app was deployed without a filter first, a real event was inspected to confirm `project` is present in `issueFieldKeys`, and only then was the condition written.

`onError: RECEIVE_AND_LOG` covers the other case: if the expression itself throws, the function is invoked anyway and the failure is recorded, rather than the event being dropped in silence.

## Decision: the filter is verified in both directions

Confirming that the trigger fires proves nothing about filtering — an expression that matched everything would also fire. Confirming silence proves nothing either — a filter that broke the trigger entirely would also be silent.

Both halves are required, and the negative half must run first so its result is not contaminated by traces from the positive one.

## Finding that changed a documented claim

A dead tunnel was expected to classify as `NETWORK` / `FETCH_FAILED`. It classifies as `HTTP` / `HTTP_503`.

The classification is correct and the expectation was wrong: the tunnel's domain still resolved, so the request left, connected over TCP, negotiated TLS and received an HTTP 503. That is not a network failure.

| Situation | Classification |
|---|---|
| Destination answers, badly | `HTTP` / `HTTP_5xx` |
| Destination does not resolve | `NETWORK` / `FETCH_FAILED` |
| Destination does not answer in time | `TIMEOUT` / `REQUEST_TIMEOUT` |
| Answers 201 but stored nothing | `APPLICATION` |

The distinction is operational, not cosmetic: it separates "I could not reach it" from "I reached it and got a bad answer", which changes who gets called when it happens.

## Findings that only a real deployment could surface

- **Event delivery is unordered.** The update event was logged before the creation event, despite occurring after it. Any logic assuming order will break.
- **One ticket produced four invocations**, not two. Without deduplication that is four sends of the same ticket.
- **Fields are not guaranteed.** `priorityName` arrived `null` because the test project has no priority field configured.
- **Jira does not deliver description, attachments or custom fields to a trigger.** `issueFieldKeys` is a reduced set. A ticket carrying a long description with an invented name, email, phone, IBAN and amount, plus an attached file, leaked none of it — because the text never arrived. Two barriers, not one.
- **`forge logs` serves entries with a delay.** A query run immediately after an action returned zero lines for an event that had fired. This nearly produced a false diagnosis that the filter had broken the trigger.
- **`forge register` requires a Developer Space** and does not say so until it fails.
- **A first deployment can already be a major version.** Declaring `read:jira-work` for the first time reached 2.0.0; declaring egress reached 3.0.0 and then 4.0.0.

## Decision: tunnel provider

`localtunnel` was tried first and discarded: it dropped twice in ten minutes and cannot reclaim a subdomain, which invalidates the deployed manifest each time.

Cloudflare quick tunnels proved stable. This is also what `forge tunnel` uses internally.

**The URL remains ephemeral either way.** Changing it requires updating the Forge variable, redeploying, and re-consenting the new egress destination — which the platform demands explicitly, and correctly.

## Alternatives considered

- **Wait for `integration-service`.** Rejected: it blocks a demonstrable result on work owned elsewhere, and the contract is all the client needs.
- **Mock the HTTP client in the demo.** Rejected: it would prove the mock works. The `wire` scenario sends a real request over a real socket.
- **Declare egress permanently.** Rejected: the destination is a demo receiver behind an ephemeral URL. The committed state carries no egress; it is added deliberately for a demonstration and reverted after.
