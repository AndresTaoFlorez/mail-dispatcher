# Agent instructions — Mail Dispatcher

## Read first

1. Read `README.md` for product scope and current status.
2. Read the shared `docs/PLAN.md` checkbox queue from bottom to top, preserving heading ancestry, indentation, dependencies, and explicit blockers.
3. Inspect existing code and tests before proposing deletion, copying, or restructuring.

**Current runtime:** `backend/mail-api/` is the read-only Microsoft Graph mailbox API. `backend/graph-scrap/` is an optional isolated authentication/token service, not a mailbox collector. These are the only two directories under `backend/`. `frontend/` is reserved with no application. `database/migrations/` defines the current schema; historical root migrations were removed. The legacy root Python API has been removed at the maintainer's request; `backend/mail-api/` is the only mailbox API. `wdd/` remains a behavioral reference, not an active assignment implementation. Do not claim live tenant validation, assignment parity, or production readiness.

Use Node.js 24 and the root npm workspace/lockfile. Run `npm ci`, `npm run check`, and explicit PostgreSQL tests against a disposable database. Run the preserved WDD tests separately. The repository intentionally contains no GitHub automation directory; validation and deployment are explicit local operations.

`docs/PLAN.md` is jointly edited by the maintainer and agent. Preserve human text, task IDs, title hierarchy, and unchecked work. Mark tasks only after real execution and append concise evidence. Do not regenerate the file on each turn or treat a checkbox as permission for production access, credential rotation, paid services, merge, or security-policy changes.

## Source of truth and working method

- Write user-facing documentation and code comments in clear, concise English. Define terms before introducing acronyms.
- Prefer small PRs that each deliver a verifiable capability. Do not reformat, move, or delete unrelated files.
- Identify the current implementation, intended replacement, risks, and tests before modifying a subsystem.
- Treat references from other repositories as design input; do not copy private source, configuration, data, or undocumented behavior into this public repository.
- Never invent endpoint semantics, permissions, migration readiness, test results, or deployed capabilities.
- Keep `README.md` accurate about what is **planned** versus **implemented**.

## Target repository boundaries

The monorepo must have exactly these top-level responsibility areas (supporting `docs/` and tool configuration may also exist):

- `backend/mail-api/` — HTTP interface, application workflows, pure domain logic, mailbox/provider adapters, background synchronization, and tests.
- `backend/graph-scrap/` — self-contained optional authentication service with its own Docker image and synthetic browser tests.
- `frontend/` — empty reservation; do not claim a frontend is implemented.
- `database/` — PostgreSQL schema, migrations, seeds with synthetic data, and schema documentation.

Keep the business rules independent of Fastify, React, Microsoft Graph, PostgreSQL, and transport schemas. Clean Architecture is mandatory for every change in `backend/mail-api/`, not a future migration option. Organize source by layer and then capability; use `domain/`, `application/`, `infrastructure/`, `presentation/`, and the outer `composition/` root. Define application ports and adapt external systems through infrastructure. Composition is the only place that selects and wires concrete adapters. HTTP delivery imports supported application entries only, never Domain or Infrastructure. Application owns required ports, operation contracts, and operational errors; Domain owns only mail meaning and invariants. Cross-capability consumers use explicit `index.ts` public entries, not private deep imports. Do not put SQL columns, Graph DTOs, framework types, or authentication failures in Domain.

Do not introduce another `apps/backend` / `apps/frontend` root alongside these directories. Port business behavior deliberately into the existing layers rather than maintaining another application runtime.

## Microsoft Graph integration rules

- Use Microsoft Graph's documented mail endpoints through `backend/mail-api/src/infrastructure/mail/graph/`. Keep the provider behind application-owned ports; only bootstrap wires concrete adapters.
- Prefer supported Entra/MSAL application access. Optional delegated tokens can be obtained through `graph-scrap` only for authorized accounts/flows; stop at MFA, consent, or policy challenges. Never bypass those controls or assume a captured token grants extra permissions.
- Mailbox passwords may be forwarded transiently during explicit optional login only; never persist or log them. Keep browser automation out of `mail-api`, never use a host browser profile, and never reuse credentials for automatic renewal. A delegated access token has no assumed refresh token.
- A read-only synchronization phase must precede mailbox mutations. Write operations require a deliberate, separately reviewed scope and the necessary permissions.
- Use `@odata.nextLink` and `@odata.deltaLink` as opaque values; persist synchronization state per mailbox **and folder**, and recover safely after partial failure.
- Handle 429 responses using `Retry-After`, bounded retries and backoff. Do not use unbounded concurrent requests or continuous full-folder scans.
- Consider `Prefer: IdType="ImmutableId"` for message identity. Account for namespace (tenant/mailbox), moves, deletions, folder membership, and exceptions such as cross-mailbox/archive movement.
- Treat `conversationId` as grouping information, not a globally unique message key or an instruction to move a conversation in one request. Model mailbox moves as authorized, idempotent, auditable operations on actual messages.
- Never send credentials, tokens, raw message bodies, attachments, customer identifiers, or private tenant information to logs, fixtures, public issues, screenshots, or commits.

## Domain and persistence

- Preserve the semantics of Weighted Deficit Dispatch: availability windows, capacity weights, deficit accumulation, deterministic tie-breaking, escalations, and duplicate-assignment prevention.
- Use the existing `wdd/ALGORITHM.md` and `wdd/tests/` as a behavioral reference. If porting Python to TypeScript, produce parity tests before removing the old engine.
- Do not equate a Graph message with a business case. Define a normalized domain model with explicit relationships between mailboxes, messages, conversations, assignments, and external ticket references.
- Database changes require versioned PostgreSQL migrations, rollback or remediation guidance, and a documented data-retention policy. Do not assume old SQL artifacts are compatible without mapping.
- Acknowledge that a database transaction cannot atomically include a Microsoft Graph side effect: record operation intent/status and reconcile ambiguous outcomes.

## Implementation sequence for Hermes / Codex

1. Inventory legacy capabilities and tests, then record the replacement map and unresolved product decisions.
2. Maintain the existing backend/frontend/database workspace and tooling. Publish bounded changes to the current PR unless the user requests another delivery strategy.
3. Implement supported authentication with fake/test credentials and an isolated Graph adapter.
4. Add read-only mailbox discovery, paginated retrieval, delta checkpoints, error handling, and integration tests with fixtures.
5. Introduce normalized PostgreSQL storage, deduplication, assignment parity tests, and a read-only operational view.
6. Add explicitly authorized mutation workflows and a web interface, each with security and failure-recovery tests.
7. Plan controlled adoption and historical data migration where justified. Keep the WDD reference until TypeScript behavioral parity has been verified; removal of the old root API does not establish assignment parity.

Do not implement every stage in one PR. Stop and surface blockers when mailbox access, licensing, permissions, or expected behavior cannot be verified.

## Architectural verification

The mail-api test suite recursively resolves the complete TypeScript source dependency graph using its compiler configuration. It checks relative and alias imports, reexports, dynamic imports and type-only imports; rejects outward dependencies, private capability imports, cycles, ambient I/O in inner code, and computed module paths. Keep negative mutation fixtures proving each rule detects a real violation. Do not replace this with folder-name or regular-expression checks. HTTP mappers preserve the wire contract while persistence maps SQL rows into application-owned camelCase values.

## Validation and operational safety

- Use synthetic mailbox fixtures in automated tests. No live credentials or production mailbox changes without explicit authorization.
- Verify pagination, replay/idempotency, 429/retry behavior, expired credentials, delta recovery, partial moves, and concurrency before feature acceptance.
- No automatic production deployment, network changes, secret rotation, or database migration. An exposed historical credential requires an authorized operator to rotate it; deleting its current file does not erase Git history.
- Before claiming a phase is complete, identify the files changed and commands/tests actually run.
