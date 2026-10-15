# Microsoft Graph intake: decisions and limits

## Runtime and architecture

The TypeScript backend under `backend/` is the only running backend. Microsoft Graph v1.0 is the mailbox provider, implemented in `backend/src/infrastructure/graph/` and injected through application-owned ports. MSAL acquires application tokens using a tenant-approved development registration. Presentation and application code do not instantiate provider adapters; bootstrap composes the system.

The React frontend calls the backend only. PostgreSQL stores mailbox-scoped messages, folder membership, synchronization state, and jobs. One npm workspace and lockfile maintain these projects without separate authentication or queue services.

The original proposal and implementation are consolidated in PR #1 at the maintainer's request. The previous Python HTTP runtime, its startup entry points, and its orchestration/configuration have been retired under the new Graph-only direction. The repository intentionally has no GitHub workflow/configuration directory. Checks are local commands, not automatic CI or deployment.

## Implemented behavior

- Visible folder discovery walks descendants and collection pages. Hidden/search/archive semantics are not yet verified.
- Read-only message delta follows opaque continuation links, requests immutable IDs, validates response shapes, hydrates partial records, and handles folder tombstones.
- Continuations are constrained to the trusted Graph origin and configured mailbox. Redirects are disabled. The adapter issues GET requests only.
- Each page and its checkpoint commit in one PostgreSQL transaction. Replay upserts message keys and memberships. Invalid cursors start a new full-sync generation; stale membership is pruned only on its terminal page.
- Conversation groups are derived from stored messages with observed folder membership. They are not business cases or complete mailbox-wide threads unless all relevant folders have been synchronized.
- Jobs are durable, with one active job per mailbox/folder, leased claims, stale-worker fencing, bounded retries, and safe error codes. Failed jobs resume from the last committed cursor when explicitly queued again.
- The loopback-only console can discover folders, queue synchronization, and display persisted jobs/conversations. Starting a server resumes existing queued jobs but does not create a recurring mailbox schedule.

## Assignment behavior retained for migration

`wdd/` and its existing tests remain unchanged. The Python `api/application/`, `api/domain/`, and `api/infrastructure/` modules retain assignment, specialist, work-window, ticket-reference, and historical persistence behavior for comparison. They are not registered in the TypeScript runtime and do not provide a second HTTP service. Collection-only DTOs and write paths have been removed. Historical SQL statements are retained; obsolete collection comments were made provider-neutral.

The WDD engine assumes an eligible pool and already-unassigned case list. Availability and database deduplication are outside it. It sorts by deficit and `last_updated`; exact ties retain input order, and that timestamp is not updated during a batch. Escalation increments source deficit/decrements source assigned count, with inverse target adjustments. Some older comments describe the opposite sign. A TypeScript port still needs parity tests for these details, weights, accumulated state, work windows, and transfers before assignment activation.

## Validation boundary

Graph tests use synthetic responses, never tenant credentials. Tests cover pagination, nested folders, partial records, removals, cursor trust, 401 refresh, 403 refusal, rate limiting, transient retries, MSAL request/error boundaries, and HTTP access control. Real disposable-PostgreSQL tests exercise rollback, replay, concurrent claims, lease fencing, full-reset reconciliation, and HTTP-to-storage retrieval. Frontend adapter tests and a separately executed isolated-headless-browser smoke test cover local presentation integration, not live Graph access.

Architecture and Python-reference tests check that retired entry points are absent, layer boundaries remain intact, and retained Python imports resolve without the removed HTTP layer. WDD behavioral tests remain the reference. See package READMEs for actual validation commands. No automated GitHub checks or deployment workflow are supplied.

## Security and remaining work

A removed legacy diagnostic script contained embedded credentials. Treat those historical credentials as exposed: deleting the current file does not erase Git history or invalidate a credential. An authorized operator must rotate/revoke them. This change neither attempts that rotation nor rewrites repository history; no credential values or infrastructure endpoints are reproduced here.

Independent candidate review and an authorized development-tenant smoke test remain pending. Verify admin consent, mailbox restrictions, token privileges and tenant policy before live reads. No production data or mailbox was accessed.

The current console is not production end-user authentication or hosting. Production retention/purge, recurring synchronization, deleted-folder reconciliation, long-page worker heartbeats, delegated user login if needed, persisted case eligibility, WDD parity, specialist configuration, and historical backfill remain future work. Mailbox mutations require separate authorization and safe tests. No assignment is emitted by this read-only milestone.
