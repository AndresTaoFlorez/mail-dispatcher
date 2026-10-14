# Backend (planned)

This directory reserves the backend boundary of the Mail Dispatcher monorepo. **There is no new backend implementation here yet.**

The proposed TypeScript/Fastify application will own HTTP routes, authentication coordination, mailbox synchronization jobs, application workflows, pure assignment domain logic, and provider adapters for Microsoft Graph and PostgreSQL.

Initial implementation must keep provider-neutral contracts separate from Graph request/response shapes and database schemas. See [migration phases](../docs/MIGRATION_PLAN.md) and [agent rules](../AGENTS.md).

Existing Python code under `../api/`, `../agent/`, and `../wdd/` is legacy reference material; it has not been moved or replaced.
