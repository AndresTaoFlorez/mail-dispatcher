# Database (planned)

This directory reserves PostgreSQL schema and versioned migration ownership. **No new schema or migrations have been applied.**

Future schema work must explicitly model mailbox-scoped message identities, conversation grouping, folder membership, sync checkpoints, specialist availability, assignment history, operation status, and retention rules.

The existing root SQL script and `../migrations/` are legacy inputs, **not** a target schema that has been migrated. A separate change must inventory and map existing data before adding or running migrations. See [migration plan](../docs/MIGRATION_PLAN.md).
