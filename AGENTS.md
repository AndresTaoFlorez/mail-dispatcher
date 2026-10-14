# Agent instructions — Mail Dispatcher

## Read first

1. Read `README.md` for product scope and current status.
2. Read `docs/MIGRATION_PLAN.md` for migration order, evidence requirements, and open decisions.
3. Inspect existing code and tests before proposing deletion, copying, or restructuring.

**This is a documentation-only transition branch.** Do not infer that the proposed services, Graph authentication, or new database schema already exist. A future implementation task requires its own explicitly scoped change. The current `api/`, `agent/`, `wdd/`, and legacy SQL files are preserved for analysis, not silently retired.

## Source of truth and working method

- Write user-facing documentation and code comments in clear, concise English. Define terms before introducing acronyms.
- Prefer small PRs that each deliver a verifiable capability. Do not reformat, move, or delete unrelated files.
- Identify the current implementation, intended replacement, risks, and tests before modifying a subsystem.
- Treat references from other repositories as design input; do not copy private source, configuration, data, or undocumented behavior into this public repository.
- Never invent endpoint semantics, permissions, migration readiness, test results, or deployed capabilities.
- Keep `README.md` accurate about what is **planned** versus **implemented**.

## Target repository boundaries

The monorepo must have exactly these top-level responsibility areas (supporting `docs/` and tool configuration may also exist):

- `backend/` — HTTP interface, application workflows, pure domain logic, mailbox/provider adapters, background synchronization, and tests.
- `frontend/` — web presentation and interaction through the backend API.
- `database/` — PostgreSQL schema, migrations, seeds with synthetic data, and schema documentation.

Keep the business rules independent of Fastify, React, Microsoft Graph, PostgreSQL, and transport schemas. Organize code by layer, then capability where useful. Define application ports and adapt external systems through infrastructure. Composition/bootstrap is the only place that wires concrete adapters.

Do not introduce another `apps/backend` / `apps/frontend` root alongside these directories. Do not move legacy code to the target directories in a documentation PR.

## Microsoft Graph integration rules

- Use Microsoft Graph's documented mail endpoints; **no Outlook Web scraping, Playwright mail automation, or browser-session token extraction** in the target system.
- Decide the supported mailbox and permission model first: delegated versus application access, consent, tenant restrictions, token lifecycle, and least privilege. Favor supported OAuth/MSAL flows; do not collect account passwords.
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
2. Create minimal backend/frontend/database tooling in a **separate PR**; select workspace and package-management conventions once.
3. Implement supported authentication with fake/test credentials and an isolated Graph adapter.
4. Add read-only mailbox discovery, paginated retrieval, delta checkpoints, error handling, and integration tests with fixtures.
5. Introduce normalized PostgreSQL storage, deduplication, assignment parity tests, and a read-only operational view.
6. Add explicitly authorized mutation workflows and a web interface, each with security and failure-recovery tests.
7. Plan a controlled cutover, migration of historical data where justified, and retirement of obsolete automation.

Do not implement every stage in one PR. Stop and surface blockers when mailbox access, licensing, permissions, or expected behavior cannot be verified.

## Validation and operational safety

- Use synthetic mailbox fixtures in automated tests. No live credentials or production mailbox changes without explicit authorization.
- Verify pagination, replay/idempotency, 429/retry behavior, expired credentials, delta recovery, partial moves, and concurrency before feature acceptance.
- No automatic production deployment, network changes, secret rotation, or database migration as a side effect of a documentation task.
- Before claiming a phase is complete, identify the files changed and commands/tests actually run.
