# Mail Dispatcher

A read-only Microsoft Graph mailbox intake backend. The application is not production-ready and has not been tested against a live tenant.

## Repository

```text
backend/
  mail-api/       Main TypeScript/Fastify API and synchronization worker
  graph-scrap/    Optional isolated authentication/token service
frontend/         Reserved; no frontend application exists
database/         Current PostgreSQL schema, migrations, and scripts
docs/PLAN.md      Shared, bottom-up checkbox work queue
wdd/              Python WDD behavioral reference and characterization tests
```

There is one checkout at `D:\Projects\mail-dispatcher`. The former auxiliary worktree has been removed. Backend contains exactly the two service directories. The frontend contains only a Git reservation marker because Git cannot track an empty directory. Historical root `migrations/` were removed; `database/migrations/` remains required for the current database.

Read [AGENTS.md](AGENTS.md) and the shared [PLAN](docs/PLAN.md). Process unchecked tasks from bottom to top while retaining their heading context and dependencies. Both the maintainer and agent can edit the plan; completed tasks require execution evidence, not inferred approval.

## Local setup

Requires Node.js 24, npm, and PostgreSQL 18. Docker is required for the self-contained authentication service and its Chromium tests.

```sh
npm ci
```

Copy `database/.env.example` to `database/.env`, set consistent disposable-development credentials, then run:

```sh
docker compose --env-file database/.env -f database/compose.yml up -d
npm run migrate -w database
```

Copy `backend/mail-api/.env.example` to `backend/mail-api/.env`. Set its database URL and a random operator `API_TOKEN` of at least 32 characters. Choose an authentication mode:

- **`GRAPH_AUTH_MODE=entra`**: supported MSAL client credentials; configure the approved tenant, client, secret, and mailbox object ID. See [mail-api](backend/mail-api/README.md).
- **`GRAPH_AUTH_MODE=graph-scrap`**: explicitly log in through the isolated token service; no application-registration fields are needed in this mode. Configure a separate service key and its loopback URL. See [graph-scrap](backend/graph-scrap/README.md) for Docker setup, constraints, and credential handling.

```sh
npm run dev:mail-api
```

The main API binds to `127.0.0.1:3100`. All routes require the separate operator bearer token. `GET /api/auth/status` reports configuration/login state. In optional delegated mode, `POST /api/auth/login` receives credentials transiently, forwards them to the isolated service, validates the returned token with Graph, binds storage to the validated tenant/mailbox, and returns status **without** the Graph token. See package documentation before using real credentials. Do not paste passwords or tokens into chat or commit them.

All mailbox operations remain Graph GET requests. There are no mailbox writes, assignment activation, frontend, automatic recurring schedule, production deployment, or GitHub workflows in this milestone.

## Validation

```sh
npm run check
npm run test:postgres
python -m pytest wdd/tests -q
```

Database tests require an explicitly configured disposable `TEST_DATABASE_URL`; ordinary tests skip them when absent. The two Chromium tests run explicitly in the Docker verification image described in the service README, never against a real tenant. Tests with synthetic portals/tokens do not certify live Microsoft authentication or tenant consent.
