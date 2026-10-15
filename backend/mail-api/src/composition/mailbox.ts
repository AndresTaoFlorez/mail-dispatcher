import type { Pool } from "pg";
import { PostgresMailboxStore } from "../infrastructure/mail/postgres/PostgresMailboxStore.js";
import { GraphProvider } from "../infrastructure/mail/graph/provider.js";
import type { AuthorizedMailbox } from "../application/authentication/index.js";
import {
  createMailOperations,
  type FolderSource,
  type FolderCatalog,
  type ConversationReader,
} from "../application/mail/index.js";
import {
  createSynchronization,
  type MessageChangeSource,
  type SyncQueue,
  type JobReader,
  type SyncCheckpointStore,
} from "../application/synchronization/index.js";
import type { MailboxSession } from "../application/authentication/index.js";
export type MailboxPersistence = FolderCatalog &
  ConversationReader &
  SyncQueue &
  JobReader &
  SyncCheckpointStore;
export type MailboxProvider = FolderSource & MessageChangeSource;
/** This aggregate is composition-only; each operation receives its own narrow port. */
export function composeMailbox(
  provider: MailboxProvider,
  store: MailboxPersistence,
) {
  return {
    ...createMailOperations(provider, store, store),
    ...createSynchronization(provider, store, store),
  };
}
export function sessionOperations(session: MailboxSession) {
  return {
    folders: () => session.workspace().folders(),
    discover: () => session.workspace().discover(),
    conversations: (limit: number, offset: number) =>
      session.workspace().conversations(limit, offset),
    enqueue: (folder: string) => session.workspace().enqueue(folder),
    jobs: () => session.workspace().jobs(),
    tick: () => session.optionalWorkspace()?.tick() ?? Promise.resolve(false),
  };
}

export async function openMailboxWorkspace(
  pool: Pool,
  identity: AuthorizedMailbox,
  request: typeof fetch = fetch,
) {
  const store = new PostgresMailboxStore(
    pool,
    `${identity.tenantId}:${identity.mailboxId}`,
  );
  await store.register(identity.tenantId, identity.mailboxId);
  return composeMailbox(
    new GraphProvider(identity.tokens, identity.mailboxId, request),
    store,
  );
}
