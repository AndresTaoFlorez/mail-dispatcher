import test from "node:test";
import assert from "node:assert/strict";
import { MailboxSession } from "../src/application/authentication/index.js";
import {
  composeMailbox,
  sessionOperations,
} from "../src/composition/mailbox.js";
import type { AuthorizedMailbox } from "../src/application/authentication/index.js";
import type { MailboxPersistence } from "../src/composition/mailbox.js";
import { buildServer } from "../src/presentation/http/index.js";
const store: MailboxPersistence = {
  discover: async () => {},
  folders: async () => [],
  enqueue: async () => null,
  jobs: async () => [],
  conversations: async () => [],
  claim: async () => null,
  state: async () => {
    throw Error();
  },
  reset: async () => {},
  savePage: async () => {},
  fail: async () => {},
};
const mailbox = (id = "synthetic"): AuthorizedMailbox => ({
  tenantId: "tenant",
  mailboxId: id,
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  tokens: { token: async () => "synthetic-token" },
});
const workspace = () =>
  composeMailbox(
    {
      folders: async () => [],
      changes: async () => ({ changes: [], cursor: "delta", complete: true }),
    },
    store,
  );
const credentials = {
  mail: "synthetic@example.invalid",
  password: "synthetic-only",
};
test("delegated mode waits for explicit login and activates only authorized identity", async () => {
  const identities: string[] = [];
  const runtime = new MailboxSession(
    "graph-scrap",
    async (m) => {
      identities.push(m.mailboxId);
      return workspace();
    },
    {
      authorize: async (input) => {
        assert.deepEqual(input, credentials);
        return mailbox();
      },
    },
  );
  assert.equal(runtime.status().state, "login_required");
  assert.equal(await sessionOperations(runtime).tick(), false);
  assert.throws(() => runtime.workspace().folders(), {
    message: "login_required",
  });
  const status = await runtime.login(credentials);
  assert.equal(status.state, "authorized");
  assert.deepEqual(identities, ["synthetic"]);
  assert.deepEqual(await runtime.workspace().folders(), []);
  assert.equal("accessToken" in status, false);
});
test("official mode does not accept password login", async () => {
  const runtime = new MailboxSession("entra", async () => workspace());
  await runtime.configure({ ...mailbox(), expiresAt: null });
  assert.equal(runtime.status().state, "configured");
  await assert.rejects(runtime.login(credentials), {
    message: "login_not_supported",
  });
});
test("concurrent login is bounded and failed login preserves previous namespace", async () => {
  let reject!: () => void;
  let failing = false;
  const gate = new Promise<void>((r) => {
    reject = r;
  });
  const runtime = new MailboxSession("graph-scrap", async () => workspace(), {
    authorize: async () => {
      if (failing) {
        await gate;
        throw Error("failure");
      }
      return mailbox();
    },
  });
  await runtime.login(credentials);
  failing = true;
  const pending = runtime.login(credentials);
  await assert.rejects(runtime.login(credentials), {
    message: "authentication_busy",
  });
  reject();
  await assert.rejects(pending);
  assert.equal(runtime.status().state, "authorized");
});
test("HTTP password login is protected and returns status, never Graph tokens", async () => {
  const runtime = new MailboxSession("graph-scrap", async () => workspace(), {
    authorize: async () => mailbox(),
  });
  const token = "synthetic-operator-key-at-least-32-characters";
  const app = buildServer(sessionOperations(runtime), token, runtime);
  const headers = { authorization: `Bearer ${token}` };
  try {
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: credentials,
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (await app.inject({ url: "/api/folders", headers })).statusCode,
      409,
    );
    const result = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers,
      payload: credentials,
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.json().state, "authorized");
    assert.equal("accessToken" in result.json(), false);
    assert.equal(
      (await app.inject({ url: "/api/folders", headers })).statusCode,
      200,
    );
  } finally {
    await app.close();
  }
});
