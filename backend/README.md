# Backend

TypeScript/Fastify API with one in-process sync worker. Workspace commands from the root: `npm run dev -w backend`, `npm run typecheck -w backend`, `npm run test -w backend`, `npm run build -w backend`. Build output: `backend/dist/`.

## Boundaries

- `src/domain/`: provider-neutral models and safe errors.
- `src/application/`: ports and intake workflow; no framework, database, or Graph dependencies.
- `src/infrastructure/graph/`: MSAL, read-only HTTP, validation, paging, retries, immutable IDs.
- `src/infrastructure/postgres/`: durable jobs, fenced leases, normalized storage, transactional checkpoints.
- `src/presentation/`: authenticated local HTTP.
- `src/bootstrap/`: configuration, composition, worker, shutdown.

## Authorization

The worker supports **single-tenant Microsoft 365 application access**, not interactive user login, personal accounts, or a multi-user dashboard. Use an administrator-approved development application. The selected metadata endpoints support application permission `Mail.ReadBasic.All`; grant only required read permission and restrict allowed mailboxes using tenant-supported Exchange application-access controls. Do not grant write or send permission for this milestone. Verify consent and mailbox policy before live testing.

Configure `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, and the mailbox directory object ID in `GRAPH_MAILBOX_ID`. MSAL requests `https://graph.microsoft.com/.default`, caches app tokens in process, and refreshes once after a 401. Registration grants determine effective access: environment variables do not narrow an overprivileged registration. Keep secrets outside Git. Certificate credentials and delegated authorization-code/PKCE login are future options, not implemented features.

Authentication uses supported MSAL token acquisition; there is no user-password endpoint or external authentication microservice. The local operator presents a separate bearer `API_TOKEN`, not a Graph token. This is not production end-user authentication.

## HTTP surface

All routes require `Authorization: Bearer <API_TOKEN>` and return `Cache-Control: no-store`.

| Method | Path                                   | Behavior                                                                          |
| ------ | -------------------------------------- | --------------------------------------------------------------------------------- |
| GET    | `/api/folders`                         | Persisted discovered folders                                                      |
| POST   | `/api/folders/discover`                | Read visible folders and descendants from Graph; persist after complete discovery |
| POST   | `/api/folders/:id/sync`                | 202 with a durable job; duplicate active requests return the same job             |
| GET    | `/api/jobs`                            | Latest 100 jobs: status, committed pages, safe error code                         |
| GET    | `/api/conversations?limit=50&offset=0` | Persisted groups; limit 1–100, offset 0–100000                                    |

The worker commits one delta page per claim and polls once per second when idle. Jobs transition queued/running → succeeded/failed. Failed jobs retain the last committed folder cursor; queue the folder again after resolving the error. Success means a delta round finished, not that future changes are captured. There is no recurring mailbox schedule.

Short `Retry-After` values are honored. Values over 30 seconds fail the job rather than retrying early; wait the upstream interval before manual retry. Each network read has a 15-second timeout and at most four attempts. A job has a 10,000-page safety limit. Expired 180-second leases can be reclaimed; replaced workers cannot commit. Large partially populated pages can outlive that lease and may need smaller upstream pages or future heartbeat support with multiple workers. This milestone targets one local worker process.

See [decisions and limits](../docs/IMPLEMENTATION.md). Synthetic tests are not proof of live tenant access.
