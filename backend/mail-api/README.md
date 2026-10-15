# Mail API

The main TypeScript/Fastify API, read-only Microsoft Graph adapter, PostgreSQL persistence, and durable worker. The frontend is not implemented.

From the repository root:

```sh
npm run dev:mail-api
npm run typecheck -w @mail-dispatcher/mail-api
npm run test -w @mail-dispatcher/mail-api
npm run build -w @mail-dispatcher/mail-api
```

Build output is `backend/mail-api/dist/`. Only bootstrap wires infrastructure adapters; domain/application code has no framework, PostgreSQL, or browser dependencies.

## Authentication options

`GRAPH_AUTH_MODE=entra` is the default. Configure `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, and `GRAPH_MAILBOX_ID`. MSAL uses client credentials with `https://graph.microsoft.com/.default`; token caching/renewal belongs to MSAL. Grant only the required approved permissions (metadata endpoints support application `Mail.ReadBasic.All`) and restrict allowed mailboxes using supported tenant controls. Status `configured` is not proof of successful live authorization.

`GRAPH_AUTH_MODE=graph-scrap` uses the separate [token service](../graph-scrap/README.md). Configure `GRAPH_SCRAP_URL` and a separate `GRAPH_SCRAP_API_KEY`; application-registration variables are not required. On startup this mode waits for an explicit operator login and does not process jobs yet.

`POST /api/auth/login` accepts `{mail,password}` transiently and calls the service. The API sends the access token to Graph `/me` before accepting identity metadata, checks the tenant/mailbox/expiry and delegated mail-read scope, then selects mailbox-scoped persistence. The delegated token must already have `User.Read` and appropriate mail-read consent. No permission grant or consent bypass is performed. The Graph token stays in memory and is never returned by the main API. Passwords are not retained for renewal. Expiry or a 401 requires a new explicit login; no refresh token is assumed. Re-authenticating the same mailbox resumes its persisted sync state. Previously queued jobs for another mailbox wait until that mailbox is authorized again.

The separate operator `API_TOKEN` protects all HTTP routes. It is not a Microsoft token or production user-session system. Origin-bearing requests are refused while no frontend exists. Use HTTPS for a non-loopback service transport; do not expose credential endpoints publicly.

## HTTP surface

| Method | Path                                   | Behavior                                            |
| ------ | -------------------------------------- | --------------------------------------------------- |
| GET    | `/api/auth/status`                     | Safe mode/configuration/expiry status               |
| POST   | `/api/auth/login`                      | Optional delegated-mode login; status only          |
| GET    | `/api/folders`                         | Persisted discovered folders                        |
| POST   | `/api/folders/discover`                | Read visible folder descendants/pages via Graph     |
| POST   | `/api/folders/:id/sync`                | Queue or return the active durable folder job (202) |
| GET    | `/api/jobs`                            | Latest 100 jobs with safe status/errors             |
| GET    | `/api/conversations?limit=50&offset=0` | Persisted groups; limit 1–100                       |

All responses are `no-store`. Error messages never include provider bodies, credentials, or tokens.

The worker commits one delta page per claim, handles opaque cursors/tombstones, and resumes partial failures transactionally. Short Retry-After values are honored; values over 30 seconds fail rather than retry early. Jobs have bounded requests and a 10,000-page limit. Leases expire after 180 seconds and fence stale commits. Long partial pages can require future heartbeat support with multiple workers; this is a local single-worker milestone.

No live Microsoft or tenant-policy success is claimed. Assignment parity, production hosting/authentication/retention, and independent review remain pending in [PLAN](../../docs/PLAN.md).
