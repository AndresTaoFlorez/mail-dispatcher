# Frontend (planned)

This directory reserves the web application boundary of the Mail Dispatcher monorepo. **There is no frontend implementation here yet.**

The proposed React/TypeScript interface will display synchronized work, assignment results, specialists, work windows, and job/error status. It must communicate with the backend API instead of accessing Graph tokens, Graph mail endpoints, or PostgreSQL directly.

Define the first views only after read-only API contracts and privacy requirements are agreed. See [migration plan](../docs/MIGRATION_PLAN.md).
