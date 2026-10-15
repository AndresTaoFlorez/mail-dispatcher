import test from "node:test";
import assert from "node:assert/strict";
import { composeMailbox } from "../src/composition/mailbox.js";
import type { MailboxPersistence } from "../src/composition/mailbox.js";
import type { ClaimedJob } from "../src/application/synchronization/index.js";
import { OperationError } from "../src/application/index.js";
import { buildServer } from "../src/presentation/http/index.js";
const token = "synthetic-api-token-with-at-least-32-characters";
function store() {
  let claimed = false;
  const events: string[] = [];
  const job: ClaimedJob = {
    id: "job",
    folderId: "inbox",
    status: "running",
    pages: 0,
    errorCode: null,
    lease: "lease",
  };
  const port: MailboxPersistence = {
    discover: async () => {},
    folders: async () => [],
    enqueue: async () => job,
    jobs: async () => [],
    conversations: async () => [],
    claim: async () => {
      if (claimed) return null;
      claimed = true;
      return job;
    },
    state: async () => ({
      cursor: events.includes("reset") ? null : "expired",
      generation: "generation",
      fullSync: true,
    }),
    reset: async () => {
      events.push("reset");
    },
    savePage: async () => {
      events.push("commit");
    },
    fail: async (_job, code) => {
      events.push(code);
    },
  };
  return { port, events };
}
test("invalid delta resets once and commits only replacement page", async () => {
  const s = store();
  let calls = 0;
  const intake = composeMailbox(
    {
      folders: async () => [],
      changes: async (_folder, cursor) => {
        calls++;
        if (cursor) throw new OperationError("invalid_cursor");
        return { changes: [], cursor: "new", complete: true };
      },
    },
    s.port,
  );
  assert.equal(await intake.tick(), true);
  assert.equal(await intake.tick(), false);
  assert.equal(calls, 2);
  assert.deepEqual(s.events, ["reset", "commit"]);
});
test("failure is durable and sanitized, checkpoint is not committed", async () => {
  const s = store();
  await composeMailbox(
    {
      folders: async () => [],
      changes: async () => {
        throw Error("secret");
      },
    },
    s.port,
  ).tick();
  assert.deepEqual(s.events, ["internal_failure"]);
});
test("HTTP requires bearer token; rejects cross-origin writes; no mailbox mutation route", async () => {
  const s = store();
  const app = buildServer(
    composeMailbox(
      {
        folders: async () => [],
        changes: async () => {
          throw Error();
        },
      },
      s.port,
    ),
    token,
  );
  try {
    assert.equal((await app.inject("/api/jobs")).statusCode, 401);
    const auth = { authorization: `Bearer ${token}` };
    assert.equal(
      (await app.inject({ url: "/api/jobs", headers: auth })).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/folders/discover",
          headers: { ...auth, origin: "https://attacker.example" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/messages/m1/move",
          headers: auth,
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          url: "/api/conversations?limit=100000",
          headers: auth,
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await app.inject({ url: "/api/jobs", headers: auth })).headers[
        "cache-control"
      ],
      "no-store",
    );
  } finally {
    await app.close();
  }
});
test("HTTP never reflects upstream secrets", async () => {
  const s = store();
  s.port.folders = async () => {
    throw Error("PRIVATE credentials and mailbox content");
  };
  const app = buildServer(
    composeMailbox(
      {
        folders: async () => [],
        changes: async () => {
          throw Error();
        },
      },
      s.port,
    ),
    token,
  );
  try {
    const response = await app.inject({
      url: "/api/folders",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), { error: "request_failed" });
  } finally {
    await app.close();
  }
});
test("sync is asynchronous and only accepts discovered folders", async () => {
  const s = store();
  s.port.enqueue = async () => null;
  const app = buildServer(
    composeMailbox(
      {
        folders: async () => [],
        changes: async () => {
          throw Error();
        },
      },
      s.port,
    ),
    token,
  );
  try {
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/folders/unknown/sync",
          headers: { authorization: `Bearer ${token}` },
        })
      ).statusCode,
      404,
    );
  } finally {
    await app.close();
  }
});

test("HTTP job mapper preserves snake_case wire fields without leaking persistence leases", async () => {
  const s = store();
  const job = {
    id: "job",
    folderId: "inbox",
    status: "queued" as const,
    pages: 0,
    errorCode: null,
    lease: "synthetic-private-lease",
  };
  s.port.jobs = async () => [job];
  s.port.enqueue = async () => job;
  const app = buildServer(
    composeMailbox(
      {
        folders: async () => [],
        changes: async () => ({ changes: [], cursor: "delta", complete: true }),
      },
      s.port,
    ),
    token,
  );
  const headers = { authorization: `Bearer ${token}` };
  const expected = {
    id: "job",
    folder_id: "inbox",
    status: "queued",
    pages: 0,
    error_code: null,
  };
  try {
    const list = await app.inject({ url: "/api/jobs", headers });
    assert.deepEqual(list.json(), [expected]);
    const queued = await app.inject({
      method: "POST",
      url: "/api/folders/inbox/sync",
      headers,
    });
    assert.equal(queued.statusCode, 202);
    assert.deepEqual(queued.json(), expected);
  } finally {
    await app.close();
  }
});

test("HTTP keeps folder/conversation/status casing and only maps supported auth fields", async () => {
  const s = store();
  const folder = { id: "inbox", name: "Inbox", parentId: "root" };
  const conversation = { id: "thread", subject: "Synthetic", messageCount: 2 };
  s.port.folders = async () => [folder];
  s.port.conversations = async () => [conversation];
  const status = {
    mode: "graph-scrap" as const,
    state: "authorized" as const,
    expiresAt: "2030-01-01T00:00:00Z",
    accessToken: "synthetic-must-not-leak",
  };
  const app = buildServer(
    composeMailbox(
      {
        folders: async () => [folder],
        changes: async () => ({ changes: [], cursor: "delta", complete: true }),
      },
      s.port,
    ),
    token,
    { status: () => status, login: async () => status },
  );
  const headers = { authorization: `Bearer ${token}` };
  try {
    assert.deepEqual(
      (await app.inject({ url: "/api/folders", headers })).json(),
      [folder],
    );
    assert.deepEqual(
      (
        await app.inject({
          method: "POST",
          url: "/api/folders/discover",
          headers,
        })
      ).json(),
      [folder],
    );
    assert.deepEqual(
      (await app.inject({ url: "/api/conversations", headers })).json(),
      [conversation],
    );
    const safeStatus = {
      mode: "graph-scrap",
      state: "authorized",
      expiresAt: "2030-01-01T00:00:00Z",
    };
    assert.deepEqual(
      (await app.inject({ url: "/api/auth/status", headers })).json(),
      safeStatus,
    );
    const loggedIn = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers,
      payload: { mail: "synthetic@example.invalid", password: "synthetic" },
    });
    assert.deepEqual(loggedIn.json(), safeStatus);
  } finally {
    await app.close();
  }
});
