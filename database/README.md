# Database

PostgreSQL 18 owns the new `intake` schema. Use a fresh disposable database, not the legacy database. Root SQL and `../migrations/` are untouched and must not be run for this setup.

Copy `.env.example` to `.env`, replace the development password, and keep URLs consistent. From the root:

```sh
docker compose --env-file database/.env -f database/compose.yml up -d
npm run migrate -w database
npm run test:postgres
```

Compose starts only a local database on loopback port 55432. It does not deploy the application or replace existing containers. The backend never applies migrations automatically.

## Migration and recovery

`scripts/migrate.js` applies `migrations/001_intake.sql` and its checksum atomically under an advisory lock. Re-running verifies its checksum. Applied migrations are immutable; add another version instead of changing a deployed checksum. The initial runner knows version 1 only; extend its explicit ordered list when adding version 2. SQL uses LF line endings for stable cross-platform hashes.

No legacy data migration or backfill is attempted. Rollback means stopping the new backend and returning to the unchanged legacy application. For disposable local data, remove only this Compose project's volume after confirming it is unneeded. For retained data, take an authorized backup and restore it rather than dropping schemas. No destructive rollback runs automatically.

## Identity, consistency, retention

- Mailbox identity includes tenant and mailbox directory object ID. Message keys and conversation groups are mailbox-scoped. Immutable Graph IDs are requested; cross-mailbox/archive movement is not treated as the same identity.
- `messages` stores metadata only. `memberships` models per-folder presence. A tombstone removes only that folder membership, not another folder's copy.
- Conversation read models group messages with observed memberships; they are not cases or assignments.
- `sync_state` holds opaque cursors, full-sync flag, and generation. Page changes and checkpoint commit together. Full reset prunes unobserved memberships only at a terminal page, avoiding wholesale removal during an interrupted resync.
- `jobs` permits one active job per mailbox/folder. Row locks and lease tokens fence stale workers. Jobs survive restarts; expired running jobs can be reclaimed.
- Development retention: keep metadata, orphaned message metadata, cursors, and job history until the operator purges the development mailbox/database. No automatic period is guessed. Production needs an agreed retention policy, archival, and authorized purge interface first. Removing membership does not erase subjects.

URLs, cursors, mailbox IDs, subjects, and backups are sensitive; never post them publicly. The API exposes no cursors. Database TLS, least-privilege runtime roles, secret storage, and backups are environment responsibilities, not configured by this migration.
