import test from "node:test";
import assert from "node:assert/strict";
import { buildTokenServer } from "../src/server.js";
import { CaptureError } from "../src/contracts.js";
import { capturedToken } from "../src/token.js";
const key = "synthetic-service-key-at-least-32-characters";
const headers = { authorization: `Bearer ${key}` };
const credentials = {
  mail: "synthetic@example.invalid",
  password: "synthetic-only",
};
const token = () =>
  [
    "synthetic",
    Buffer.from(
      JSON.stringify({
        aud: "https://graph.microsoft.com",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "signature",
  ].join(".");
test("token API authenticates, validates credentials and has no cacheable response", async () => {
  const app = buildTokenServer(
    {
      capture: async (input) => {
        assert.deepEqual(input, credentials);
        return capturedToken(token());
      },
    },
    key,
  );
  try {
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/token",
          payload: credentials,
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/token",
          headers,
          payload: { ...credentials, url: "https://attacker.invalid" },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/token",
          headers: { ...headers, origin: "https://attacker.invalid" },
          payload: credentials,
        })
      ).statusCode,
      403,
    );
    const result = await app.inject({
      method: "POST",
      url: "/token",
      headers,
      payload: credentials,
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.headers["cache-control"], "no-store");
    assert.equal(result.json().tokenType, "Bearer");
    assert.equal("refreshToken" in result.json(), false);
  } finally {
    await app.close();
  }
});
test("one capture at a time; no password retry or raw error disclosure", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let calls = 0;
  const app = buildTokenServer(
    {
      capture: async () => {
        calls++;
        await gate;
        throw new Error("PRIVATE password/provider error");
      },
    },
    key,
  );
  try {
    const first = app.inject({
      method: "POST",
      url: "/token",
      headers,
      payload: credentials,
    });
    await new Promise((r) => setTimeout(r, 20));
    const second = await app.inject({
      method: "POST",
      url: "/token",
      headers,
      payload: credentials,
    });
    assert.equal(second.statusCode, 409);
    release();
    const result = await first;
    assert.equal(result.statusCode, 502);
    assert.deepEqual(result.json(), { error: "capture_unavailable" });
    assert.equal(calls, 1);
  } finally {
    release();
    await app.close();
  }
});
test("MFA/consent cannot be bypassed and fail with safe codes", async () => {
  for (const code of [
    "interactive_required",
    "consent_required",
    "authentication_rejected",
  ] as const) {
    const app = buildTokenServer(
      {
        capture: async () => {
          throw new CaptureError(code);
        },
      },
      key,
    );
    try {
      const result = await app.inject({
        method: "POST",
        url: "/token",
        headers,
        payload: credentials,
      });
      assert.equal(
        result.statusCode,
        code === "authentication_rejected" ? 401 : 409,
      );
      assert.deepEqual(result.json(), { error: code });
    } finally {
      await app.close();
    }
  }
});
test("token screening rejects malformed, expired and wrong-audience values", () => {
  for (const claims of [
    { aud: "https://attacker.invalid", exp: 9999999999 },
    { aud: "https://graph.microsoft.com", exp: 1 },
  ])
    assert.throws(
      () =>
        capturedToken(
          [
            "header",
            Buffer.from(JSON.stringify(claims)).toString("base64url"),
            "signature",
          ].join("."),
        ),
      { message: "unsupported_token" },
    );
  assert.throws(() => capturedToken("not-a-token"), {
    message: "unsupported_token",
  });
});
