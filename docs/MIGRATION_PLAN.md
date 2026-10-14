# Microsoft Graph monorepo — migration proposal

**Status:** proposed, documentation-only. No Graph-backed Mail Dispatcher release, code migration, schema migration, or production cutover is included in this PR.

## Problem and intended outcome

The legacy collector relies on browser interaction with Outlook Web, including login state, HTML selectors, virtualized lists, and scroll-based extraction. This couples mailbox intake to changes in the web interface and complicates recovery and verification.

Replace that dependency with authorized Microsoft Graph mail operations, while preserving the separate business goal: turning incoming mailbox activity into consistent, auditable support assignments. Build a maintainable monorepo with independent backend, frontend, and database boundaries.

## Migration map

| Legacy concern | Direction | Important qualification |
| --- | --- | --- |
| `agent/` browser login, navigation, extraction | Replace with a Microsoft Graph adapter and sync worker under `backend/` | Establish supported authentication and allowed scopes first |
| `api/` HTTP endpoints and orchestration | Reconsider as TypeScript/Fastify application workflows | Design public contracts; do not mechanically port old endpoint names |
| `wdd/` and its tests | Preserve semantics through TypeScript characterization/parity tests | Retain existing Python implementation until parity is demonstrated |
| PostgreSQL models, SQL scripts, migrations | Reconcile into versioned schema under `database/` | Inventory actual data and avoid assuming migration compatibility |
| Runtime configuration and operations | Rebuild for new components after design review | Do not reuse browser passwords, sessions, or operational configuration |
| Historical project prototypes | Consult only for transferable patterns | No direct copying of private modules or environment details |

## Initial domain boundaries

- **Mailbox connection:** tenant, mailbox identity, authorization state, and allowed operations.
- **Mail synchronization:** folder discovery, messages, conversation grouping, change checkpoints, and errors.
- **Case intake:** application-defined case eligibility and duplicate prevention; not every message is automatically a new case.
- **Workload assignment:** specialist pool, work windows, weights, WDD deficit state, assignment decisions, and escalation adjustments.
- **Operations:** job state, retries, audit trail, and reconciliation of external side effects.

A single Graph `conversationId` can group multiple messages. Confirm how conversations span folders and how replies affect eligibility. Persist message identity and folder membership separately, scoped to its mailbox. Assess the `ImmutableId` preference and known exceptions before selecting unique keys.

## Proposed technical baseline

| Area | Starting point | Reason |
| --- | --- | --- |
| Backend | TypeScript + Fastify | Align with the more recent Graph-oriented service experience while retaining explicit application/domain/infrastructure boundaries |
| Graph | Typed provider adapter over documented Microsoft Graph v1.0 mail endpoints | Keep provider details out of business logic; evaluate official SDK versus a small HTTP client |
| Authentication | Microsoft Entra ID / OAuth with supported libraries (for example MSAL) | Token lifecycle, consent, and permissions must be first-class concerns |
| Data | PostgreSQL and versioned migrations | Durable assignment and synchronization state |
| Frontend | React + TypeScript | Dedicated user interface consuming only the backend |
| Testing | Unit, contract, fake-Graph integration, and migration parity tests | Validate behavior without accessing real mailboxes |

These selections are architectural proposals; package/tooling details require a separate implementation decision.

## Sync and failure model

1. Resolve mailbox identity and authorized folders.
2. Perform initial read-only synchronization, honoring Graph paging.
3. Save normalized message state and checkpoints transactionally when possible; checkpoint only after corresponding changes are safely persisted.
4. Follow each folder's `@odata.deltaLink` for subsequent updates and removals. Treat returned links as opaque and support invalid/expired state with a controlled resynchronization path.
5. Respect throttling and transient errors. Track job progress, failures, and bounded retries.
6. Add change notifications later only if the operating environment can support secure webhooks, subscription renewal, and missed-event recovery.
7. Treat message moves and other writes as a separate command flow. Persist intent, result, and reconciliation state; make retries safe in the presence of ambiguous upstream outcomes.

For any move, Graph operates on messages, not whole conversation aggregates. The mailbox permission required to move messages is broader than read-only access. Plan the first milestone without write permissions.

## Phases and acceptance checks

### Phase A — decisions and inventory
- [ ] Map every active legacy capability to keep, replace, redesign, or retire.
- [ ] Confirm tenant/mailbox types, Graph access eligibility, admin consent requirements, and retention constraints.
- [ ] Decide identity scope, sync model, and whether ticket creation is in MVP.
- [ ] Describe public-domain behavior with synthetic examples only.

### Phase B — foundational monorepo
- [ ] Introduce independently buildable `backend/` and `frontend/` projects and `database/` migrations.
- [ ] Establish formatting, lint, typechecking, and automated tests.
- [ ] Implement ports/adapters and dependency composition without mailbox access.

### Phase C — read-only Graph intake
- [ ] Supported login/token lifecycle and minimal read scopes, with test fakes.
- [ ] Folder/message discovery and pagination; typed normalization and conversation grouping.
- [ ] Delta synchronization, durable cursors, failure recovery, and 429 handling.
- [ ] Persist state and expose read-only API/UI with no real-message fixtures in the repository.

### Phase D — assignment and controlled operations
- [ ] Prove WDD parity against legacy scenarios, including windows, weighted load, and escalations.
- [ ] Prevent repeat case/assignment creation when Graph pages or jobs are replayed.
- [ ] Add controlled mailbox changes only with explicit approval, least necessary write scope, auditing, and recovery.
- [ ] Verify concurrency, permissions, idempotency, and partial success.

### Phase E — cutover and retirement
- [ ] Prepare database migration/backfill strategy, measured acceptance criteria, and rollback.
- [ ] Reconcile sample counts and assignment decisions in an authorized test environment.
- [ ] Cut over deliberately; remove browser automation and outdated deployment instructions only after verification.

## Decisions deliberately left open

- Delegated user access versus application access for the intended mailbox ownership and tenant policy.
- Whether read/write operations on shared mailboxes are available and approved.
- Exact Graph paging/filter combinations, attachment retention, and message-body data minimization.
- How to reconcile a conversation when its messages belong to several folders.
- Whether external ticketing belongs to the first release.
- Workspace tooling and deployment packaging.

Do not present any of these as implemented facts.

## Authoritative references

- [Microsoft Graph mail overview](https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview)
- [Delegated authorization flow](https://learn.microsoft.com/en-us/graph/auth-v2-user)
- [Message delta query](https://learn.microsoft.com/en-us/graph/delta-query-messages)
- [Message move endpoint and permissions](https://learn.microsoft.com/en-us/graph/api/message-move)
- [Outlook immutable IDs](https://learn.microsoft.com/en-us/graph/outlook-immutable-id)
- [Throttling and Retry-After](https://learn.microsoft.com/en-us/graph/throttling)
- [Lifecycle notifications](https://learn.microsoft.com/en-us/graph/change-notifications-lifecycle-events)
