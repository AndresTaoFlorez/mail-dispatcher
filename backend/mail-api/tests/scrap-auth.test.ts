import test from "node:test";
import assert from "node:assert/strict";
import {
  CapturedTokenSource,
  ScrapMailboxLogin,
} from "../src/infrastructure/graph/scrap-auth.js";
const tenant = "00000000-0000-4000-8000-000000000001",
  id = "00000000-0000-4000-8000-000000000002",
  key = "synthetic-service-key-with-at-least-32-characters";
const jwt = (overrides = {}) =>
  [
    "fixture",
    Buffer.from(
      JSON.stringify({
        aud: "https://graph.microsoft.com",
        tid: tenant,
        oid: id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        scp: "User.Read Mail.ReadBasic",
        ...overrides,
      }),
    ).toString("base64url"),
    "synthetic-signature",
  ].join(".");
const response = (token: string) =>
  new Response(
    JSON.stringify({
      accessToken: token,
      tokenType: "Bearer",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }),
  );
const credentials = {
  mail: "synthetic@example.invalid",
  password: "synthetic-only",
};
test("captured tokens are isolated, expire, and never auto-refresh credentials", async () => {
  const source = new CapturedTokenSource("synthetic", Date.now() + 10000);
  assert.equal(await source.token(), "synthetic");
  await assert.rejects(source.token(true), {
    message: "authorization_required",
  });
  await assert.rejects(new CapturedTokenSource("synthetic", 0).token(), {
    message: "authorization_required",
  });
});
test("delegated identity is bound only after Graph accepts the token", async () => {
  const calls: string[] = [];
  const login = new ScrapMailboxLogin(
    "http://127.0.0.1:3101",
    key,
    async (url, init) => {
      calls.push(String(url));
      assert.equal(init?.redirect, "error");
      if (calls.length === 1) {
        assert.equal(init?.method, "POST");
        assert.deepEqual(JSON.parse(String(init?.body)), credentials);
        return response(jwt());
      }
      return new Response(JSON.stringify({ id }));
    },
  );
  const result = await login.authorize(credentials);
  assert.equal(result.mailboxId, id);
  assert.equal(result.tenantId, tenant);
  assert.equal(calls.length, 2);
  assert.equal("accessToken" in result, false);
});
test("wrong identity, missing mail consent or Graph refusal cannot activate a session", async () => {
  for (const mode of ["identity", "scope", "graph"]) {
    let calls = 0;
    const login = new ScrapMailboxLogin(
      "http://127.0.0.1:3101",
      key,
      async () => {
        calls++;
        if (calls === 1)
          return response(jwt(mode === "scope" ? { scp: "User.Read" } : {}));
        return mode === "graph"
          ? new Response("{}", { status: 403 })
          : new Response(
              JSON.stringify({ id: mode === "identity" ? tenant : id }),
            );
      },
    );
    await assert.rejects(login.authorize(credentials), {
      message: "authorization_required",
    });
  }
});
test("service errors stay sanitized and insecure remote credential transport is refused", async () => {
  assert.throws(() => new ScrapMailboxLogin("http://attacker.invalid", key));
  const denied = new ScrapMailboxLogin(
    "http://127.0.0.1:3101",
    key,
    async () => new Response("PRIVATE upstream error", { status: 401 }),
  );
  await assert.rejects(denied.authorize(credentials), {
    message: "authentication_failed",
  });
  const challenge = new ScrapMailboxLogin(
    "http://127.0.0.1:3101",
    key,
    async () => new Response("{}", { status: 409 }),
  );
  await assert.rejects(challenge.authorize(credentials), {
    message: "interactive_required",
  });
});
