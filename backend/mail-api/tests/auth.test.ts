import test from "node:test";
import assert from "node:assert/strict";
import { tokenSource } from "../src/infrastructure/authentication/entra/auth.js";

test("MSAL adapter requests application scope and force-refresh only when required", async () => {
  const requests: unknown[] = [];
  const source = tokenSource({
    async acquireTokenByClientCredential(request) {
      requests.push(request);
      return { accessToken: "synthetic-access-token" };
    },
  });
  assert.equal(await source.token(), "synthetic-access-token");
  await source.token(true);
  assert.deepEqual(requests, [
    { scopes: ["https://graph.microsoft.com/.default"], skipCache: false },
    { scopes: ["https://graph.microsoft.com/.default"], skipCache: true },
  ]);
});

test("MSAL adapter sanitizes rejected credentials and missing tokens", async () => {
  const denied = tokenSource({
    async acquireTokenByClientCredential() {
      throw new Error("PRIVATE identity provider response");
    },
  });
  await assert.rejects(denied.token(), { message: "authorization_required" });
  const missing = tokenSource({
    async acquireTokenByClientCredential() {
      return null;
    },
  });
  await assert.rejects(missing.token(), { message: "authorization_required" });
});
