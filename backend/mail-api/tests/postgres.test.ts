import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresMailboxStore } from "../src/infrastructure/mail/postgres/PostgresMailboxStore.js";
import { GraphProvider } from "../src/infrastructure/mail/graph/provider.js";
import {
  composeMailbox,
  openMailboxWorkspace,
  sessionOperations,
} from "../src/composition/mailbox.js";
import { MailboxSession } from "../src/application/authentication/index.js";
import { buildServer } from "../src/presentation/http/index.js";
import type { MessageChange } from "../src/application/synchronization/index.js";
const database = process.env.TEST_DATABASE_URL;
const m = (id: string, conversationId = "thread"): MessageChange => ({
  id,
  removed: false,
  conversationId,
  subject: "Synthetic subject",
  receivedAt: "2026-01-01T00:00:00Z",
  isRead: false,
});
// Each test uses its own mailbox namespace; never truncate an existing schema or read real data.
async function fixture() {
  const pool = new pg.Pool({ connectionString: database, max: 5 });
  const namespace = "test-" + randomUUID();
  const store = new PostgresMailboxStore(pool, namespace);
  await store.register("synthetic-tenant", namespace);
  await store.discover([
    { id: "inbox", name: "Inbox", parentId: null },
    { id: "archive", name: "Archive", parentId: null },
  ]);
  return {
    pool,
    store,
    namespace,
    async close() {
      await pool.query("DELETE FROM intake.mailboxes WHERE id=$1", [namespace]);
      await pool.end();
    },
  };
}
test(
  "PostgreSQL: duplicate requests, replay and mailbox-scoped identity",
  { skip: !database },
  async () => {
    const f = await fixture();
    const other = await fixture();
    try {
      const jobs = await Promise.all(
        Array.from({ length: 8 }, () => f.store.enqueue("inbox")),
      );
      assert.equal(new Set(jobs.map((j) => j?.id)).size, 1);
      const job = (await f.store.claim())!;
      assert.equal(await f.store.claim(), null);
      const state = await f.store.state(job);
      await f.store.savePage(job, state, {
        changes: [m("m1"), m("m1"), m("m2")],
        cursor: "opaque-delta",
        complete: true,
      });
      assert.deepEqual(await f.store.conversations(10, 0), [
        { id: "thread", subject: "Synthetic subject", messageCount: 2 },
      ]);
      assert.equal((await f.store.jobs())[0].status, "succeeded");
      await assert.rejects(
        f.store.savePage(job, state, {
          changes: [m("m3")],
          cursor: "bad",
          complete: true,
        }),
        { message: "lease_lost" },
      );
      await other.store.enqueue("inbox");
      const j2 = (await other.store.claim())!;
      await other.store.savePage(j2, await other.store.state(j2), {
        changes: [m("m1", "other-thread")],
        cursor: "other",
        complete: true,
      });
      assert.equal((await f.store.conversations(10, 0))[0].id, "thread");
    } finally {
      await f.close();
      await other.close();
    }
  },
);
test(
  "PostgreSQL: page transaction rollback and resume after failed job",
  { skip: !database },
  async () => {
    const f = await fixture();
    try {
      await f.store.enqueue("inbox");
      let job = (await f.store.claim())!;
      let state = await f.store.state(job);
      await f.store.savePage(job, state, {
        changes: [m("m1")],
        cursor: "page-2",
        complete: false,
      });
      job = (await f.store.claim())!;
      state = await f.store.state(job);
      assert.equal(state.cursor, "page-2");
      await assert.rejects(
        f.store.savePage(job, state, {
          changes: [
            m("m2"),
            { ...m("broken"), subject: null } as unknown as MessageChange,
          ],
          cursor: "must-not-save",
          complete: true,
        }),
      );
      assert.equal((await f.store.state(job)).cursor, "page-2");
      assert.equal((await f.store.conversations(10, 0))[0].messageCount, 1);
      await f.store.fail(job, "provider_unavailable");
      await f.store.enqueue("inbox");
      job = (await f.store.claim())!;
      await f.store.savePage(job, await f.store.state(job), {
        changes: [m("m2")],
        cursor: "delta",
        complete: true,
      });
      assert.equal((await f.store.conversations(10, 0))[0].messageCount, 2);
    } finally {
      await f.close();
    }
  },
);
test(
  "PostgreSQL: expired lease is recovered; old worker is fenced",
  { skip: !database },
  async () => {
    const f = await fixture();
    try {
      await f.store.enqueue("inbox");
      const old = (await f.store.claim())!;
      await f.pool.query(
        "UPDATE intake.jobs SET lease_until=now()-interval '1 second' WHERE id=$1",
        [old.id],
      );
      const replacement = (await f.store.claim())!;
      assert.equal(old.id, replacement.id);
      assert.notEqual(old.lease, replacement.lease);
      await assert.rejects(
        f.store.savePage(old, await f.store.state(old), {
          changes: [m("lost")],
          cursor: "bad",
          complete: true,
        }),
        { message: "lease_lost" },
      );
      await f.store.fail(old, "stale");
      assert.equal((await f.store.jobs())[0].status, "running");
      await f.store.savePage(replacement, await f.store.state(replacement), {
        changes: [m("good")],
        cursor: "good",
        complete: true,
      });
      assert.equal((await f.store.conversations(10, 0))[0].messageCount, 1);
    } finally {
      await f.close();
    }
  },
);
test(
  "PostgreSQL: full resync prunes stale membership only at terminal page; moves preserve other folders",
  { skip: !database },
  async () => {
    const f = await fixture();
    try {
      for (const folder of ["inbox", "archive"]) {
        await f.store.enqueue(folder);
        const job = (await f.store.claim())!;
        await f.store.savePage(job, await f.store.state(job), {
          changes: [m("keep"), m("stale")],
          cursor: "delta",
          complete: true,
        });
      }
      await f.store.enqueue("inbox");
      let job = (await f.store.claim())!;
      await f.store.reset(job);
      await f.store.savePage(job, await f.store.state(job), {
        changes: [m("keep")],
        cursor: "next",
        complete: false,
      });
      assert.equal((await f.store.conversations(10, 0))[0].messageCount, 2);
      job = (await f.store.claim())!;
      await f.store.savePage(job, await f.store.state(job), {
        changes: [],
        cursor: "new-delta",
        complete: true,
      });
      assert.equal((await f.store.conversations(10, 0))[0].messageCount, 2);
      await f.store.enqueue("archive");
      job = (await f.store.claim())!;
      await f.store.savePage(job, await f.store.state(job), {
        changes: [{ id: "stale", removed: true }],
        cursor: "archive-delta",
        complete: true,
      });
      assert.equal((await f.store.conversations(10, 0))[0].messageCount, 1);
    } finally {
      await f.close();
    }
  },
);
test(
  "PostgreSQL: concurrent claims have one owner",
  { skip: !database },
  async () => {
    const f = await fixture();
    try {
      await f.store.enqueue("inbox");
      const claims = await Promise.all(
        Array.from({ length: 5 }, () => f.store.claim()),
      );
      assert.equal(claims.filter(Boolean).length, 1);
    } finally {
      await f.close();
    }
  },
);
test(
  "end-to-end: HTTP job -> fake Graph pages -> PostgreSQL -> HTTP conversations",
  { skip: !database },
  async () => {
    const f = await fixture();
    const prefix = "https://graph.microsoft.com/v1.0/users/synthetic/";
    const page2 =
      prefix + "mailFolders/inbox/messages/delta?$skiptoken=synthetic";
    let calls = 0;
    const provider = new GraphProvider(
      { token: async () => "synthetic-token" },
      "synthetic",
      async () => {
        calls++;
        return new Response(
          JSON.stringify(
            calls === 1
              ? {
                  value: [
                    {
                      id: "m1",
                      conversationId: "c1",
                      subject: "Synthetic",
                      isRead: false,
                    },
                  ],
                  "@odata.nextLink": page2,
                }
              : {
                  value: [
                    {
                      id: "m2",
                      conversationId: "c1",
                      subject: "Synthetic",
                      isRead: false,
                    },
                  ],
                  "@odata.deltaLink":
                    prefix +
                    "mailFolders/inbox/messages/delta?$deltatoken=synthetic",
                },
          ),
        );
      },
    );
    const intake = composeMailbox(provider, f.store);
    const token = "synthetic-local-api-token-32-characters";
    const app = buildServer(intake, token);
    const headers = { authorization: `Bearer ${token}` };
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/folders/inbox/sync",
        headers,
      });
      assert.equal(response.statusCode, 202);
      await intake.tick();
      await intake.tick();
      assert.equal(calls, 2);
      const conversations = await app.inject({
        url: "/api/conversations",
        headers,
      });
      assert.deepEqual(conversations.json(), [
        { id: "c1", subject: "Synthetic", messageCount: 2 },
      ]);
      const jobs = (await app.inject({ url: "/api/jobs", headers })).json();
      assert.equal(jobs[0].status, "succeeded");
      assert.equal(jobs[0].pages, 2);
    } finally {
      await app.close();
      await f.close();
    }
  },
);

test(
  "PostgreSQL: the real composition switches A -> B -> A without losing or crossing sync state",
  { skip: !database },
  async () => {
    const pool = new pg.Pool({ connectionString: database, max: 5 });
    const tenant = randomUUID();
    const a = randomUUID(),
      b = randomUUID();
    let pageCalls = 0;
    const request: typeof fetch = async (url) => {
      const parsed = new URL(String(url));
      const mailbox = parsed.pathname.split("/")[3];
      assert.ok(mailbox === a || mailbox === b);
      if (parsed.pathname.endsWith("/mailFolders"))
        return new Response(
          JSON.stringify({
            value: [{ id: "inbox", displayName: "Inbox", childFolderCount: 0 }],
          }),
        );
      pageCalls++;
      return new Response(
        JSON.stringify({
          value: [
            {
              id: "same-message",
              conversationId: mailbox,
              subject: "Synthetic",
              isRead: false,
            },
          ],
          "@odata.deltaLink": `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders/inbox/messages/delta?$deltatoken=synthetic`,
        }),
      );
    };
    const session = new MailboxSession(
      "graph-scrap",
      (identity) => openMailboxWorkspace(pool, identity, request),
      {
        authorize: async (input) => ({
          tenantId: tenant,
          mailboxId: input.mail.startsWith("a@") ? a : b,
          expiresAt: "2030-01-01T00:00:00Z",
          tokens: { token: async () => "synthetic" },
        }),
      },
    );
    const operations = sessionOperations(session);
    try {
      await session.login({ mail: "a@example.invalid", password: "synthetic" });
      await operations.discover();
      await operations.enqueue("inbox");
      await operations.tick();
      const saved = await operations.conversations(10, 0);
      assert.equal(saved[0].id, a);
      await session.login({ mail: "b@example.invalid", password: "synthetic" });
      assert.deepEqual(await operations.conversations(10, 0), []);
      await operations.discover();
      await operations.enqueue("inbox");
      await operations.tick();
      assert.equal((await operations.conversations(10, 0))[0].id, b);
      await session.login({ mail: "a@example.invalid", password: "synthetic" });
      assert.deepEqual(await operations.conversations(10, 0), saved);
      assert.equal((await operations.jobs())[0].status, "succeeded");
      assert.equal(await operations.tick(), false);
      assert.equal(pageCalls, 2);
      const state = await pool.query(
        "SELECT cursor FROM intake.sync_state WHERE mailbox_id=$1 AND folder_id=$2",
        [`${tenant}:${a}`, "inbox"],
      );
      assert.ok(state.rows[0].cursor.includes(a));
    } finally {
      await pool.query(
        "DELETE FROM intake.mailboxes WHERE id=ANY($1::text[])",
        [[`${tenant}:${a}`, `${tenant}:${b}`]],
      );
      await pool.end();
    }
  },
);
