# Read-only milestone: assessment and decisions

## Proposal review

The seven files in proposal PR #1 were reviewed against the legacy collector, API, WDD engine, SQL, and tests. Its separation of messages, conversations, and assignments is sound. No material proposal correction was necessary. Implementation belongs in a stacked PR; a documentation proposal is not proof of a working replacement. This is coordinator assessment, not an independent specialist approval.

## Capability inventory

| Existing area                                                                                    | Decision                                | First milestone / later work                                                                                                          |
| ------------------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Browser sessions, login, folder navigation, virtual scrolling, unread filtering, HTML extraction | Replace                                 | Graph reads replace the collection mechanism; browser source remains untouched                                                        |
| Conversation persistence and paginated queries                                                   | Redesign                                | Mailbox-scoped message keys, independent folder membership, and grouped persisted read model implemented                              |
| Application/mailbox registry                                                                     | Redesign                                | One explicitly configured tenant/mailbox connection; dynamic multi-mailbox configuration later                                        |
| Folder-to-level and analyst-folder mapping                                                       | Preserve business intent                | Discovery implemented; eligibility/routing policies and configuration later                                                           |
| Specialists and availability/work windows                                                        | Preserve                                | Later configuration migration; maintain active flags, schedule timezone, half-open time slots, and empty-schedule always-on semantics |
| WDD weights, deficits, ties, transfers                                                           | Preserve with characterization          | Existing Python specification, engine, and 51 tests retained; no TypeScript assignment port or parity claim yet                       |
| Assignment deduplication, reassignments, and tagged new cases                                    | Redesign transaction boundary           | No new assignments emitted; later case eligibility, unique constraints, locking, and event history required                           |
| Ticket creation and assignment/ticket references                                                 | Preserve separately                     | Not required for read-only intake; migrate external references only after contract review                                             |
| Watcher, background collection, operational status                                               | Replace progressively                   | Durable explicitly queued sync jobs implemented; recurring scheduling later                                                           |
| Browser move operations, analyst redirects                                                       | Retire only after authorized equivalent | No mailbox mutations in this milestone; future commands operate on messages, not atomic conversations                                 |
| Runtime scraping settings, screenshots, HTML artifacts, legacy deployment                        | Eventually retire                       | Not used by the new runtime; keep existing files until controlled cutover                                                             |
| Legacy SQL migrations and historical data                                                        | Map, do not replay                      | New isolated schema; no legacy database access, migration, or backfill                                                                |

The WDD engine assumes an already eligible pool and already unassigned case list. Availability and database deduplication are outside it. It sorts by deficit, then `last_updated`; exact ties retain input order, and it does not update that timestamp during a batch. Escalation implementation increments source deficit/decrements source assigned count, with inverse target changes. Some legacy comments describe the opposite sign. Future parity must characterize implementation as well as the specification, including exact ties, duplicate inputs, and schedule boundaries, rather than silently "correcting" behavior during translation.

## Decisions that affect maintenance

- One npm workspace and lockfile; independent backend, frontend, database commands. Node 24. No queue broker, auth microservice, or premature shared package.
- Provider-neutral application ports with infrastructure wired only at bootstrap. Frontend has a small HTTP adapter rather than speculative layers without business rules.
- Supported MSAL application authentication for one approved development Microsoft 365 mailbox. Read-basic metadata access, no user passwords or token extraction. Reference integrations informed ports, persisted-query separation, paging, and test strategy only; no private source, operational settings, or data were copied.
- Graph v1.0 via a small fetch adapter. It validates wire shapes, constrains continuation URLs to the configured mailbox and trusted origin, disallows redirects, and issues GET only.
- Folder discovery walks visible nested folders and all pages. Hidden/search/archive semantics beyond that scope remain unverified. Message delta tracks each folder independently, with immutable IDs requested on every request.
- A PostgreSQL transaction persists each page and checkpoint. Partial failures resume at the last committed page; replay upserts message keys and memberships. Invalid cursors trigger a controlled full-sync generation. Tombstones affect observed folder membership, not global message identity.
- Conversation groups are derived from persisted messages across observed folders. They are not complete mailbox-wide threads unless all relevant folders were synchronized, and they are not business cases.
- One active job per folder, leased claims, stale-worker fencing, safe status/error codes. No raw upstream errors, URLs, tokens, or message data in logs. No automatic discovery or periodic scheduling; previously queued jobs resume on startup.
- Development-only loopback console with a separate operator token. This is not production authentication or hosting. No automatic production migrations, deployment, or mailbox changes.

## Verified scope and limitations

Automated coverage includes fake Graph pagination and nested folders, partial-record hydration, tombstones, cursor validation, 401 refresh, 403 refusal, 429/transient retries, malformed responses, MSAL request/error boundaries, HTTP authorization and input bounds, real PostgreSQL rollback/replay/concurrent claims/lease fencing/full-resync reconciliation, and an HTTP → fake Graph → PostgreSQL → HTTP workflow. Frontend unit tests cover its HTTP adapter. A separate isolated-headless-Edge smoke test exercised the real built backend and Vite proxy: disabled unauthenticated controls, safely displayed 401 for a wrong local token, successful persisted-state refresh, no page errors, and no local/session storage credentials. The empty-state layout was visually inspected. No Graph request was made in that browser test.

No live tenant credentials were used. Administrator consent, mailbox restrictions, tenant policies, and live Graph behavior are external validation requirements. No production data was read. The public repository has no dependency on private reference services.

Independent specialist review is pending: canonical Bot Chat delivery was refused because that session is already owned by another window. No lock takeover, duplicate agent, or invented reviewer verdict was used. The implementation PR must stay draft until actual candidate review is obtained. Root `AGENTS.md` and `CLAUDE.md` status/command corrections are also blocked: the local protected-file approval timed out, so those files were not modified or bypassed. Their proposal-only wording is an outstanding consistency issue, not the implemented runtime status.

Next stages: delegated user login if needed; approved tenant smoke test; production session/hosting/retention design; recurring synchronization, folder deletion reconciliation and worker heartbeat; persisted case eligibility; WDD TypeScript parity including windows, deficits, exact ties and transfers; transactional assignment deduplication; specialist configuration and richer UI; historical backfill and controlled cutover. Mailbox writes require separate authorization and tests. Legacy removal remains prohibited until behavioral equivalence is verified.

## Primary technical references

- [Message delta and least-privilege permissions](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0)
- [Per-folder delta synchronization](https://learn.microsoft.com/en-us/graph/delta-query-messages)
- [MSAL Node token acquisition](https://learn.microsoft.com/en-us/entra/msal/javascript/node/acquire-token-requests)
- [Immutable Outlook identifiers](https://learn.microsoft.com/en-us/graph/outlook-immutable-id)
- [Throttling and Retry-After](https://learn.microsoft.com/en-us/graph/throttling)
