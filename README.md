# Mail Dispatcher

A mailbox intake and workload assignment project migrating from Python/Playwright to Microsoft Graph.

**Implemented:** a local read-only TypeScript/Fastify backend, React console, and PostgreSQL intake schema. Tests exercise fake Graph responses against real PostgreSQL. **Not yet verified against a live Microsoft tenant.** Python remains unchanged; there has been no production cutover.

## Repository

- `backend/` — presentation → application → domain; Graph/MSAL and PostgreSQL adapters wired at bootstrap.
- `frontend/` — React/TypeScript console consuming the backend only.
- `database/` — transactional versioned migrations and local database setup.
- `docs/` — [migration plan](docs/MIGRATION_PLAN.md) and [assessment and limits](docs/IMPLEMENTATION.md).
- `api/`, `agent/`, `wdd/`, `migrations/` — preserved legacy implementation, not the new runtime.

## Local development

Requires Node.js 24, npm, and PostgreSQL 18 (or Docker for the development database). Use a disposable database, never the legacy or production database.

```sh
npm ci
```

1. Copy `database/.env.example` to `database/.env`; set its password and connection URLs consistently.
2. Run `docker compose --env-file database/.env -f database/compose.yml up -d`.
3. Run `npm run migrate -w database`. Re-running verifies the applied checksum without reapplying the migration.
4. Copy `backend/.env.example` to `backend/.env`, configure the same database, and generate a separate random `API_TOKEN` of at least 32 characters. Example: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
5. Configure an approved development Entra application and mailbox as described in [backend/README.md](backend/README.md). Automated tests require no Microsoft credentials.
6. In separate terminals, run `npm run dev:backend` and `npm run dev:frontend`.
7. Open `http://127.0.0.1:5173`, enter the local API token, discover folders, and queue an explicit read-only sync. Use **Refresh persisted state** to observe jobs and conversations.

The backend binds only to `127.0.0.1:3100`. The frontend development proxy uses that address. These form one combined application, not independently deployed microservices. The static frontend build is not automatically served by the backend; shared hosting and end-user authentication are later work. Do not expose this local console publicly.

Sync reads metadata only: subjects, IDs, timestamps, and read status. It never fetches bodies or attachments, moves mail, marks messages read, creates cases, or assigns specialists. Server startup resumes previously queued jobs; a fresh database has no jobs until the operator queues one.

## Validation

```sh
npm run check
npm run test:postgres
```

`check` runs formatting, lint, typechecking, tests, and both builds. Database tests skip unless `TEST_DATABASE_URL` is present. `test:postgres` loads the explicitly configured disposable database from `database/.env` and requires that URL. CI provides PostgreSQL, applies the migration twice, and runs database tests without skips.

Preserved WDD tests, in a separate Python environment with pytest installed:

```sh
python -m pytest wdd/tests -q
```

Read [AGENTS.md](AGENTS.md) before editing. Legacy deployment and browser-automation instructions are not instructions for the new application. No deployment is part of this milestone.

Root `AGENTS.md` and `CLAUDE.md` still contain proposal-only status wording. Their protected updates were blocked by the local approval gate; correcting those entry points is a draft-PR blocker. The implementation status and commands above describe this branch, not an approved production replacement.
