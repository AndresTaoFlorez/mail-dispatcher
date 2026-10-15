import test from "node:test";
import assert from "node:assert/strict";
import { messageMetadata } from "../src/domain/mail/index.js";
import {
  discoverFolders,
  listFolders,
  listConversations,
} from "../src/application/mail/index.js";
import {
  processPage,
  type SyncCheckpointStore,
} from "../src/application/synchronization/index.js";
import {
  MailboxSession,
  type MailboxWorkspace,
} from "../src/application/authentication/index.js";
const folder = { id: "inbox", name: "Inbox", parentId: null };
const workspace = (): MailboxWorkspace => ({
  folders: async () => [folder],
  discover: async () => [],
  conversations: async () => [],
  enqueue: async () => null,
  jobs: async () => [],
  tick: async () => false,
});
test("domain metadata preserves identity and owns null subject normalization", () => {
  const input = {
    id: " id ",
    conversationId: "thread",
    subject: null,
    receivedAt: null,
    isRead: false,
  };
  const model = messageMetadata(input);
  input.id = "changed";
  assert.equal(model.id, " id ");
  assert.equal(model.subject, "");
  assert.equal(Object.isFrozen(model), true);
  assert.throws(() => messageMetadata({ ...input, id: "" }));
});
test("query use cases work with only their reader ports and no framework/container", async () => {
  assert.deepEqual(await listFolders({ folders: async () => [folder] }), [
    folder,
  ]);
  assert.deepEqual(
    await listConversations(
      {
        conversations: async (limit, offset) => {
          assert.deepEqual([limit, offset], [10, 20]);
          return [];
        },
      },
      10,
      20,
    ),
    [],
  );
});
test("folder discovery awaits persistence before reporting the stored result", async () => {
  const events: string[] = [];
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = discoverFolders(
    {
      folders: async () => {
        events.push("source");
        return [folder];
      },
    },
    {
      discover: async (folders) => {
        assert.deepEqual(folders, [folder]);
        events.push("write");
        entered();
        await gate;
      },
      folders: async () => {
        events.push("read");
        return [folder];
      },
    },
  );
  await writing;
  assert.deepEqual(events, ["source", "write"]);
  release();
  assert.deepEqual(await pending, [folder]);
  assert.deepEqual(events, ["source", "write", "read"]);
});
test("sync processing requires only the change source and atomic checkpoint port", async () => {
  let committed = false;
  const job = {
    id: "job",
    folderId: "inbox",
    status: "running" as const,
    pages: 0,
    errorCode: null,
    lease: "lease",
  };
  const checkpoints: SyncCheckpointStore = {
    claim: async () => job,
    state: async () => ({
      cursor: null,
      generation: "generation",
      fullSync: true,
    }),
    reset: async () => {},
    savePage: async () => {
      committed = true;
    },
    fail: async () => {
      assert.fail("unexpected failure");
    },
  };
  assert.equal(
    await processPage(
      {
        changes: async (id, cursor) => {
          assert.equal(id, "inbox");
          assert.equal(cursor, null);
          return { changes: [], cursor: "delta", complete: true };
        },
      },
      checkpoints,
    ),
    true,
  );
  assert.equal(committed, true);
});
test("failed workspace activation cannot replace the last authorized mailbox", async () => {
  const first = workspace();
  let fail = false;
  const identity = {
    tenantId: "tenant",
    mailboxId: "mailbox",
    expiresAt: "2030-01-01T00:00:00Z",
    tokens: { token: async () => "synthetic" },
  };
  const session = new MailboxSession(
    "graph-scrap",
    async () => {
      if (fail) throw new Error("database unavailable");
      return first;
    },
    { authorize: async () => identity },
  );
  await session.login({
    mail: "synthetic@example.invalid",
    password: "synthetic",
  });
  fail = true;
  await assert.rejects(
    session.login({ mail: "synthetic@example.invalid", password: "synthetic" }),
  );
  assert.equal(session.workspace(), first);
});
test("session expiry uses an injected clock without retaining credentials", async () => {
  let now = 0;
  const session = new MailboxSession(
    "graph-scrap",
    async () => workspace(),
    undefined,
    () => now,
  );
  await session.configure({
    tenantId: "tenant",
    mailboxId: "mailbox",
    expiresAt: "1970-01-01T00:00:01Z",
    tokens: { token: async () => "synthetic" },
  });
  assert.equal(session.status().state, "authorized");
  now = 1001;
  assert.equal(session.status().state, "login_required");
  assert.equal("tokens" in session.status(), false);
});
