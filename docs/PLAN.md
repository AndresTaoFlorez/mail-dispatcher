# Mail Dispatcher plan

## Shared workflow

Both the maintainer and agent edit this file. Read unchecked checkbox tasks **from bottom to top**; retain each task's full heading ancestry and indentation. Do not flatten tasks across headings or ignore explicit dependencies. Skip an externally blocked task and record its blocker rather than inventing completion. Preserve human edits and task IDs. After execution, mark only verified tasks complete and add concise evidence; do not regenerate this ledger on later turns.

A task here can request ordinary project work, but does not authorize production access, credential use/rotation, paid services, merges, or security-policy changes. Those still require explicit authorization. All developed changes stay in PR #1 unless the maintainer says otherwise.

## Security and remaining work

### External authorization gates

- [ ] SEC-03 — Obtain independent actual-candidate review. Blocked: no accepted specialist execution is available in this session.
- [ ] SEC-02 — Run an explicitly approved development-tenant smoke test and confirm scopes/consent/policy. Blocked: no real account or tenant authorization supplied. Synthetic browser tests are not live validation.
- [ ] SEC-01 — Have an authorized operator rotate/revoke historically exposed credentials. Deleting the old diagnostic script did not erase its Git history. No values belong in this plan.

## Delivery

- [x] PUB-02 — Read back PR #1 head/body, remote tree and branch state after publishing; no merge/deployment. Depends on PUB-01. Evidence: GitHub REST PR/body, remote branch, and recursive tree read back at `80ba896251cff5b4e686f0bf4c02d8099e466112`; requested layout confirmed and PR #1 retained as draft. No merge or deployment.
- [x] PUB-01 — Publish the current increment to the existing PR #1 branch, preserving commit history. Depends on VAL-02 and VAL-01.

## Validation boundary

- [x] VAL-02 — Build the self-contained runtime Docker image and exercise authenticated local readiness/error handling; verify that no live account was used. Depends on VAL-01. Evidence: runtime image built; authenticated health 200, missing key 401, invalid body 400. Main API started in delegated mode without Entra registration, returned login_required, and refused unauthenticated/invalid requests. Temporary servers stopped; no live account used.
- [x] VAL-01 — Pass workspace formatting/lint/typecheck/tests/build, disposable-PostgreSQL tests, unchanged WDD tests, Python integrity checks, and the Docker Chromium synthetic-login/MFA tests. Record skips and execution limits explicitly. Evidence (2026-10-15): `npm run check` passed; mail-api 46/46 including six real PostgreSQL tests; graph-scrap local 4 passed with two browser skips, then Docker 6/6 including both real-Chromium synthetic cases under runtime capability/memory restrictions. Python WDD 51/51; reference integrity 3/3; npm audit zero vulnerabilities. No live tenant credentials or mailbox calls.

## Assignment behavior retained for migration

- [ ] WDD-02 — Prove TypeScript parity for weights, work windows/timezones, accumulated deficits, exact ties, transfers and duplicate-assignment prevention before assignment activation. This remains a later milestone, not delivered by authentication restructuring.
- [x] WDD-01 — Preserve the pure-Python WDD implementation and characterize it with its existing tests during this increment.

## Implemented behavior

### Authentication services

- [x] AUTH-03 — Main API supports either approved Entra/MSAL client credentials or explicit delegated login through the isolated service; validate the returned token with Graph before selecting tenant/mailbox storage. Do not return Graph tokens from the main login route.
- [x] AUTH-02 — Optional token service accepts mail/password transiently, returns an access token without assuming refresh, runs in Docker, and refuses MFA/consent/policy challenges rather than bypassing them. No password/token logs or persistent credential profiles.
- [x] AUTH-01 — Keep mailbox operations in Graph infrastructure behind application ports; do not restore the retired mailbox collector or emit mailbox writes.

## Runtime and architecture

- [x] STR-04 — Convert the renamed `docs/PLAN.md` into this shared, hierarchical bottom-up checkbox ledger; update project instructions and links while preserving future human edits.
- [x] STR-03 — Remove the historical root `migrations/` directory, preserving `database/migrations/` for the current schema.
- [x] STR-02 — Reserve `frontend/` without an application; retain only `.gitkeep` so Git can represent the folder. Remove its workspace, dependencies and development commands.
- [x] STR-01 — Use one checkout named `mail-dispatcher` and exactly two backend service directories: `mail-api/` and `graph-scrap/`. Update all workspace/configuration/test paths.

### Legacy cleanup requested after the backend split

- [x] CLEAN-01 — Remove the obsolete root Python API and redundant migration-plan document; keep `backend/mail-api/` as the mailbox API, preserve WDD, remove obsolete documentation/test instructions, and verify the cleanup before publishing to PR #1. Previous validation evidence above is historical; the removed Python integrity suite is not a current validation command. Cleanup validation: `npm run check` passed (mail-api 40 passed / six PostgreSQL skips; graph-scrap four passed / two browser skips), WDD 51 passed, documentation formatting and diff checks passed. The skipped integrations were not rerun for this deletion-only change.

### Mandatory Clean Architecture in mail-api

- [x] ARCH-03 — Validate behavior with real disposable PostgreSQL and architectural mutation fixtures, inspect the actual diff, obtain independent candidate review if executable, and publish to the existing PR #1. Do not substitute a queued review task for an executed review.
- [x] ARCH-02 — Implement capability ownership inside every layer, narrow application ports/use cases, pure mail policy, explicit HTTP/SQL mappers, authentication/mail separation, and a single outer composition root. Remove superseded flat modules rather than leaving compatibility shims.
- [x] ARCH-01 — Make Clean Architecture a mandatory current project constraint in AGENTS and package documentation; use the local software-architecture Clean/backend guides as reference, not a future architectural option.

Evidence for ARCH-03: implementation `45c374bce6fa115607e71a9af44422c0a5690cc4` was published to PR #1 and its remote branch read back. Mail-api 65/65 passed, including seven real PostgreSQL tests; format/lint/typecheck/build and compiled-entry-point smoke passed; WDD 51 passed. API-design assessment completed at base `9396b5c`; independent editorial review of the exact implementation was non-blocking and reported no demonstrated runtime/wire/persistence regression. Its one P3 guard-coverage finding is tracked below. Live tenant access remains unverified.

- [ ] ARCH-04 — Extend ambient-I/O negative fixtures and enforcement to statically named global property access and logging; the current guard covers direct fetch/process identifiers, not every global form. Independent review found no such violating call in the implemented inner code. Non-blocking follow-up; mandatory no-I/O policy remains unchanged.
