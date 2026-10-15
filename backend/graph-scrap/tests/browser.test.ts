import test from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { ExplorerCapture } from "../src/browser.js";
const enabled = process.env.GRAPH_SCRAP_BROWSER_TESTS === "1";
const credentials = {
  mail: "synthetic@example.invalid",
  password: "synthetic-only",
};
const synthetic = [
  "fixture",
  Buffer.from(
    JSON.stringify({
      aud: "https://graph.microsoft.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url"),
  "synthetic-signature",
].join(".");
async function fixture(
  context: BrowserContext,
  challenge: boolean,
  submits: { mail: number; password: number },
) {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    let body: string;
    if (url.hostname === "developer.microsoft.com")
      body = `<button aria-label="Sign in" onclick="window.open('https://login.microsoftonline.com/synthetic/login')">Sign in</button><button role="tab" onclick="document.getElementById('access-token').hidden=false">Access token</button><div id="access-token" hidden></div><script>addEventListener('message',e=>{if(e.origin==='https://login.microsoftonline.com')document.getElementById('access-token').textContent=e.data.token})</script>`;
    else if (url.pathname === "/synthetic/login")
      body =
        '<form action="/synthetic/password" method="post"><input name="loginfmt"><input type="submit"></form>';
    else if (url.pathname === "/synthetic/password") {
      submits.mail++;
      assert.equal(
        new URLSearchParams(route.request().postData() ?? "").get("loginfmt"),
        credentials.mail,
      );
      body = challenge
        ? '<div id="idDiv_SAOTCC_Description">Interactive approval required</div>'
        : '<form action="/synthetic/complete" method="post"><input name="passwd" type="password"><input type="submit"></form>';
    } else if (url.pathname === "/synthetic/complete") {
      submits.password++;
      assert.equal(
        new URLSearchParams(route.request().postData() ?? "").get("passwd"),
        credentials.password,
      );
      body = `<script>window.opener.postMessage({token:${JSON.stringify(synthetic)}},'https://developer.microsoft.com');window.close()</script>`;
    } else {
      await route.abort();
      return;
    }
    await route.fulfill({ contentType: "text/html", body });
  });
}
test(
  "real Chromium authenticates a synthetic portal and closes its isolated browser",
  { skip: !enabled },
  async () => {
    let browser: Browser | undefined;
    const submits = { mail: 0, password: 0 };
    const capture = new ExplorerCapture(
      async () => {
        browser = await chromium.launch({ headless: true });
        return browser;
      },
      15000,
      (c) => fixture(c, false, submits),
    );
    const result = await capture.capture(credentials);
    assert.equal(result.accessToken, synthetic);
    assert.deepEqual(submits, { mail: 1, password: 1 });
    assert.equal(browser?.isConnected(), false);
  },
);
test(
  "real Chromium stops on a synthetic MFA challenge without submitting a password",
  { skip: !enabled },
  async () => {
    let browser: Browser | undefined;
    const submits = { mail: 0, password: 0 };
    const capture = new ExplorerCapture(
      async () => {
        browser = await chromium.launch({ headless: true });
        return browser;
      },
      15000,
      (c) => fixture(c, true, submits),
    );
    await assert.rejects(capture.capture(credentials), {
      message: "interactive_required",
    });
    assert.deepEqual(submits, { mail: 1, password: 0 });
    assert.equal(browser?.isConnected(), false);
  },
);
