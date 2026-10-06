# Tasks

All tasks are complete. This change documents work that was implemented and verified before the specification was written, which is the inverse of the usual order and is stated plainly rather than hidden.

## 1. Version control

- [x] 1.1 Initialise git. The project was not a repository; a baseline was committed before anything was touched.
- [x] 1.2 Exclude internal working files via `.git/info/exclude`, not `.gitignore`, so they stay on disk and out of history.
- [x] 1.3 Verify nothing internal is tracked. `git ls-files` shows no working-notes directories and no local tool configuration.

## 2. Deployment packaging

- [x] 2.1 Add `.forgeignore` excluding build output, coverage, tests, docs, scripts and backups.
- [x] 2.2 Verify by pattern simulation that the files Forge needs are included and everything else is not.
- [x] 2.3 Confirm excluding `src/__tests__/` also avoids the packaging step requiring `@types/jest`, a dev dependency.

## 3. Real deployment

- [x] 3.1 Authenticate non-interactively. The interactive prompt requires a real TTY and fails in integrated terminals.
- [x] 3.2 Obtain a Developer Space id with `forge developer-spaces list`; `forge register` requires it and does not say so until it fails.
- [x] 3.3 Register the app and commit `manifest.yml` immediately, so the generated `app.id` cannot be lost by restoring an earlier copy.
- [x] 3.4 `forge lint` clean: `No issues found.`
- [x] 3.5 Deploy and install. `forge install list` reports `Up-to-date`.

## 4. Offline demo runner

- [x] 4.1 Add `scripts/demo-local.js` consuming the compiled output, so the demo runs the real code and not a mock.
- [x] 4.2 Six scenarios: `created`, `updated`, `pii`, `invalid`, `errors`, `wire`.
- [x] 4.3 `pii` exits non-zero if any planted marker reaches the trace.
- [x] 4.4 `wire` sends a real HTTP request over a real socket to an ephemeral local receiver.
- [x] 4.5 Add `listen` and `send` for live inspection, dispatched outside the `all` registry because `listen` never terminates.
- [x] 4.6 Verify error paths: port busy, invalid port, no receiver running.

## 5. Project scoping

- [x] 5.1 Deploy without a filter first and inspect a real event to confirm `project` is present in `issueFieldKeys`.
- [x] 5.2 Add `filter.expression` scoped to one project, plus `onError: RECEIVE_AND_LOG`.
- [x] 5.3 Verify the negative half first: a ticket in another project produces zero trace lines.
- [x] 5.4 Verify the positive half: the target project still fires. Both halves are required; either alone is inconclusive.

## 6. End-to-end flow

- [x] 6.1 Stand up a receiver satisfying the contract and expose it over public HTTPS.
- [x] 6.2 Declare `remotes` and `permissions.external.fetch`, accepting the major version upgrade and admin re-consent this forces.
- [x] 6.3 Configure the destination through Forge environment variables, the API key encrypted.
- [x] 6.4 Verify the accepted path: `sent: true`, `success: true`, status 201, correlation identifier returning identical.
- [x] 6.5 Verify the failure path: destination unavailable yields a classified result and no exception.
- [x] 6.6 Correct the documented expectation for the failure path. `HTTP_503`, not `NETWORK` / `FETCH_FAILED`, because the domain still resolved.

## 7. Data protection verified against reality

- [x] 7.1 Confirm the title never appears in the trace, only as `[redacted:N]`.
- [x] 7.2 Confirm the actor appears only as a truncated hash.
- [x] 7.3 Confirm the changelog retains field names but never values: zero occurrences of `from`, `to`, `fromString`, `toString`.
- [x] 7.4 Confirm a ticket with a long description and an attachment leaks nothing. Ten planted markers, zero occurrences.
- [x] 7.5 Record why: Jira does not deliver description, attachments or custom fields to a trigger. Two barriers, not one.

## 8. Evidence and documentation

- [x] 8.1 Capture four evidence files under `docs/evidence/`, indexed with what each proves and how to re-verify it.
- [x] 8.2 Write a manual test guide where every expected output is a captured value, not an invented one.
- [x] 8.3 Structure the guide by narrative order rather than installation order, so the test that proves the point comes first.
- [x] 8.4 Mark the commands that must never be run live: registration is irreversible and already done; login would expose a token on screen.

## 9. Verification gates

- [x] 9.1 `npm run build`, `typecheck`, `lint`, `test`: 28 tests across 4 suites.
- [x] 9.2 `npm run demo -- all`: six scenarios, exit code 0.
- [x] 9.3 `forge lint`: clean.
- [x] 9.4 `git diff <baseline> -- src/` empty. Not one line of application code was changed.
