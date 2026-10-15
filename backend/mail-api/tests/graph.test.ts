import test from "node:test";
import assert from "node:assert/strict";
import { GraphProvider } from "../src/infrastructure/graph/provider.js";
import { msalTokens } from "../src/infrastructure/graph/auth.js";
const prefix = "https://graph.microsoft.com/v1.0/users/synthetic-mailbox/";
const delta = prefix + "mailFolders/inbox/messages/delta?$deltatoken=synthetic";
const full = {
  id: "m1",
  conversationId: "c1",
  subject: "Synthetic subject",
  isRead: false,
  receivedDateTime: "2026-01-01T00:00:00Z",
};
const json = (body: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers });
function fake(responses: Response[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const request: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const response = responses.shift();
    if (!response) throw Error("Unexpected call");
    return response;
  };
  const delays: number[] = [];
  const refreshes: boolean[] = [];
  const provider = new GraphProvider(
    {
      token: async (force = false) => {
        refreshes.push(force);
        return "synthetic-token";
      },
    },
    "synthetic-mailbox",
    request,
    async (ms) => {
      delays.push(ms);
    },
  );
  return { provider, calls, delays, refreshes };
}
test("normalizes delta, tombstones and immutable identity without bodies", async () => {
  const { provider, calls } = fake([
    json({
      value: [full, { id: "m2", "@removed": { reason: "deleted" } }],
      "@odata.deltaLink": delta,
    }),
  ]);
  const page = await provider.changes("inbox", null);
  assert.equal(page.complete, true);
  assert.equal(page.changes.length, 2);
  assert.deepEqual(page.changes[1], { id: "m2", removed: true });
  assert.equal(calls[0].init?.method, "GET");
  assert.equal(
    (calls[0].init?.headers as Record<string, string>).Prefer,
    'IdType="ImmutableId"',
  );
  assert.equal(
    new URL(calls[0].url).searchParams.get("$select")?.includes("body"),
    false,
  );
});
test("opaque continuation is followed without reconstructing query", async () => {
  const cursor =
    prefix + "mailFolders/inbox/messages/delta?$skiptoken=A%2FB%3D";
  const { provider, calls } = fake([
    json({ value: [], "@odata.nextLink": cursor }),
    json({ value: [full], "@odata.deltaLink": delta }),
  ]);
  const first = await provider.changes("inbox", null);
  assert.equal(first.complete, false);
  await provider.changes("inbox", first.cursor);
  assert.equal(calls[1].url, cursor);
});
test("discovers nested folders and all collection pages", async () => {
  const next = prefix + "mailFolders?$skiptoken=synthetic";
  const { provider } = fake([
    json({
      value: [{ id: "parent", displayName: "Parent", childFolderCount: 1 }],
      "@odata.nextLink": next,
    }),
    json({
      value: [
        {
          id: "child",
          displayName: "Child",
          parentFolderId: "parent",
          childFolderCount: 0,
        },
      ],
    }),
    json({
      value: [{ id: "other", displayName: "Other", childFolderCount: 0 }],
    }),
  ]);
  assert.deepEqual(
    (await provider.folders()).map((f) => f.id),
    ["parent", "child", "other"],
  );
});
test("partial delta records are hydrated", async () => {
  const { provider, calls } = fake([
    json({ value: [{ id: "m1", isRead: true }], "@odata.deltaLink": delta }),
    json({ ...full, isRead: true }),
  ]);
  assert.equal(
    (await provider.changes("inbox", delta)).changes[0].removed,
    false,
  );
  assert.equal(calls.length, 2);
});
for (const link of [
  "https://attacker.example/v1.0/users/synthetic-mailbox/messages",
  "https://graph.microsoft.com/v1.0/users/another-mailbox/messages",
  "https://graph.microsoft.com@attacker.example/path",
  "http://graph.microsoft.com/v1.0/users/synthetic-mailbox/messages",
]) {
  test("rejects untrusted cursor " + new URL(link).origin, async () => {
    const { provider, calls } = fake([]);
    await assert.rejects(provider.changes("inbox", link), {
      message: "invalid_response",
    });
    assert.equal(calls.length, 0);
  });
}
test("rejects malicious returned continuation before checkpointing", async () => {
  const { provider } = fake([
    json({
      value: [full],
      "@odata.nextLink": "https://attacker.example/steal",
    }),
  ]);
  await assert.rejects(provider.changes("inbox", null), {
    message: "invalid_response",
  });
});
test("respects Retry-After seconds", async () => {
  const { provider, delays, calls } = fake([
    json({}, 429, { "retry-after": "2" }),
    json({ value: [], "@odata.deltaLink": delta }),
  ]);
  await provider.changes("inbox", null);
  assert.deepEqual(delays, [2000]);
  assert.equal(calls.length, 2);
});
test("long Retry-After fails without early retry", async () => {
  const { provider, delays, calls } = fake([
    json({}, 429, { "retry-after": "3600" }),
  ]);
  await assert.rejects(provider.changes("inbox", null), {
    message: "provider_unavailable",
  });
  assert.equal(calls.length, 1);
  assert.equal(delays.length, 0);
});
test("HTTP-date Retry-After is honored", async () => {
  const { provider, delays } = fake([
    json({}, 503, { "retry-after": new Date(Date.now() + 5000).toUTCString() }),
    json({ value: [], "@odata.deltaLink": delta }),
  ]);
  await provider.changes("inbox", null);
  assert.ok(delays[0] > 3000 && delays[0] <= 5000);
});
test("transient retries are bounded", async () => {
  const { provider, calls } = fake(
    Array.from({ length: 4 }, () => json({}, 503)),
  );
  await assert.rejects(provider.changes("inbox", null), {
    message: "provider_unavailable",
  });
  assert.equal(calls.length, 4);
});
test("network failures retry with timeout and no redirects", async () => {
  let calls = 0;
  const provider = new GraphProvider(
    { token: async () => "synthetic" },
    "synthetic-mailbox",
    async (_url, init) => {
      calls++;
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal);
      throw new Error("PRIVATE upstream text");
    },
    async () => {},
  );
  await assert.rejects(provider.changes("inbox", null), {
    message: "provider_unavailable",
  });
  assert.equal(calls, 4);
});
test("401 refreshes then succeeds; 403 never retries", async () => {
  const first = fake([
    json({}, 401),
    json({ value: [], "@odata.deltaLink": delta }),
  ]);
  await first.provider.changes("inbox", null);
  assert.deepEqual(first.refreshes, [false, true]);
  const denied = fake([json({ error: { message: "sensitive" } }, 403)]);
  await assert.rejects(denied.provider.changes("inbox", null), {
    message: "authorization_required",
  });
  assert.equal(denied.calls.length, 1);
});
test("token errors do not leak or cause repeated requests", async () => {
  const p = new GraphProvider(
    {
      token: async () => {
        throw new Error("PRIVATE MSAL failure");
      },
    },
    "synthetic-mailbox",
    fetch,
    async () => {},
  );
  await assert.rejects(p.changes("inbox", null), {
    message: "provider_unavailable",
  });
});
test("expired delta signals controlled resync", async () => {
  const { provider } = fake([json({}, 410)]);
  await assert.rejects(provider.changes("inbox", delta), {
    message: "invalid_cursor",
  });
});
test("malformed and ambiguous pages cannot advance state", async () => {
  for (const value of [
    { value: [] },
    { value: [], "@odata.nextLink": delta, "@odata.deltaLink": delta },
    { value: [{ unknown: "x" }], "@odata.deltaLink": delta },
  ]) {
    await assert.rejects(fake([json(value)]).provider.changes("inbox", null), {
      message: "invalid_response",
    });
  }
});
test("MSAL construction exposes only token source, not login/password handlers", () => {
  const source = msalTokens(
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "synthetic-not-used",
  );
  assert.deepEqual(Object.keys(source), ["token"]);
});

test("message removed before hydration becomes a folder tombstone, not a stuck cursor", async () => {
  const { provider } = fake([
    json({ value: [{ id: "m1" }], "@odata.deltaLink": delta }),
    json({}, 404),
  ]);
  assert.deepEqual((await provider.changes("inbox", null)).changes, [
    { id: "m1", removed: true },
  ]);
});

test("malformed hydration or a different message ID cannot erase or corrupt membership", async () => {
  for (const response of [null, { ...full, id: "different" }]) {
    const { provider } = fake([
      json({ value: [{ id: "m1" }], "@odata.deltaLink": delta }),
      json(response),
    ]);
    await assert.rejects(provider.changes("inbox", null), {
      message: "invalid_response",
    });
  }
});

test("empty subject is normalized without fetching content", async () => {
  const { provider, calls } = fake([
    json({ value: [{ ...full, subject: null }], "@odata.deltaLink": delta }),
  ]);
  assert.equal(
    (await provider.changes("inbox", null)).changes[0].removed,
    false,
  );
  assert.equal(calls.length, 1);
});
