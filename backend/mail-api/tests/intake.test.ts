import test from "node:test";
import assert from "node:assert/strict";
import { Intake } from "../src/application/intake.js";
import type { IntakeStore, ClaimedJob } from "../src/application/ports.js";
import { IntakeError } from "../src/domain/mail.js";
import { buildServer } from "../src/presentation/server.js";
const token = "synthetic-api-token-with-at-least-32-characters";
function store() {
  let claimed = false;
  const events: string[] = [];
  const job: ClaimedJob = {
    id: "job",
    folder_id: "inbox",
    status: "running",
    pages: 0,
    error_code: null,
    lease: "lease",
  };
  const port: IntakeStore = {
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
      full_sync: true,
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
  const intake = new Intake(
    {
      folders: async () => [],
      changes: async (_folder, cursor) => {
        calls++;
        if (cursor) throw new IntakeError("invalid_cursor");
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
  await new Intake(
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
    new Intake(
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
    new Intake(
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
    new Intake(
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
