# Microsoft Graph migration plan

## Current direction

Use Microsoft Graph as the only mailbox integration through backend infrastructure. The runtime monorepo is `backend/mail-api/`, `backend/graph-scrap/`, and `database/`. Application/domain code owns provider-neutral contracts; bootstrap injects Graph/MSAL and PostgreSQL adapters. PR #1 contains the proposal and implementation together.

A local read-only intake milestone is implemented and tested with synthetic Graph data and real disposable PostgreSQL. Live tenant access, assignment migration, historical backfill, and production adoption remain pending. See the shared [PLAN](PLAN.md) for decisions, remaining tasks, and validation limits.

The frontend is reserved without an application. The historical root migration directory was removed; current schema migrations remain under `database/`. Concrete shared tasks and completion evidence live in [PLAN](PLAN.md); process those tasks bottom-up without flattening their headings.

## Delivered foundation

- TypeScript/Fastify mailbox API, isolated optional token service, and PostgreSQL migration project in one npm workspace.
- MSAL application-token boundary with fakes; no live authentication success claimed.
- Folder discovery, paginated delta retrieval, response normalization, and mailbox-scoped message identity.
- Durable messages, folder membership, conversation grouping, transactional checkpoints, and full-reset recovery.
- Durable asynchronous job status, deduplication, bounded retries, rate-limit handling, and stale-worker fencing.
- Read-only local API and formatting, lint, typecheck, tests, and build commands.
- Retire the former Python HTTP runtime and its collection-specific configuration/entry points; preserve assignment/domain/persistence references and WDD behavior.
- Remove the GitHub automation directory at the maintainer's request; run validation explicitly instead.

## Next milestones

1. **Approved tenant validation:** confirm mailbox type, registration grants, consent, mailbox restrictions and retention policy; exercise read-only access in an authorized development tenant.
2. **Case and assignment migration:** define case eligibility independently of messages/conversations, preserve external ticket references, and prove WDD parity for weights, windows/timezones, accumulated deficits, exact ties, escalations and transfers. Add transactional duplicate-assignment prevention before activation.
3. **Operational readiness:** production user authentication/hosting, retention and purge, recurring sync, deleted-folder reconciliation, worker heartbeat and recovery evidence, and a richer specialist/assignment interface.
4. **Historical adoption:** map retained SQL and business references to the target schema, validate representative counts and decisions, define backfill/remediation, and only then retire remaining Python references.

Mailbox writes are not part of these completed steps. Any future command must be explicitly authorized, least-privileged, idempotent, auditable, and recoverable. A conversation groups messages; it is neither an atomic Graph move object nor automatically a business case. Keep synchronization state per mailbox and folder; never checkpoint before its changes commit.

## Primary references

- [Microsoft Graph mail overview](https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview)
- [Message delta](https://learn.microsoft.com/en-us/graph/delta-query-messages)
- [MSAL Node token acquisition](https://learn.microsoft.com/en-us/entra/msal/javascript/node/acquire-token-requests)
- [Immutable message identifiers](https://learn.microsoft.com/en-us/graph/outlook-immutable-id)
- [Throttling and Retry-After](https://learn.microsoft.com/en-us/graph/throttling)
