import test from "node:test";
import assert from "node:assert/strict";
import { api } from "./api.js";
test("frontend calls backend only and forwards token in header", async () => {
  const request = api("synthetic", async (url, init) => {
    assert.equal(url, "/api/jobs");
    assert.deepEqual(init?.headers, { Authorization: "Bearer synthetic" });
    return new Response("[]");
  });
  assert.deepEqual(await request("jobs"), []);
});
test("frontend reports safe error, never renders upstream response body", async () => {
  const request = api(
    "synthetic",
    async () => new Response("PRIVATE provider body", { status: 503 }),
  );
  await assert.rejects(request("jobs"), {
    message: "Request failed (503). Check backend access and job status.",
  });
});
