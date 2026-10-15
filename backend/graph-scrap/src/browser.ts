import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import {
  CaptureError,
  type Credentials,
  type TokenCapture,
} from "./contracts.js";
import { capturedToken } from "./token.js";
const explorer = "https://developer.microsoft.com/en-us/graph/graph-explorer";
const trusted = new Set([
  "developer.microsoft.com",
  "login.microsoftonline.com",
  "login.live.com",
]);
type BrowserFactory = () => Promise<Browser>;
async function pause(page: Page) {
  try {
    await page.waitForTimeout(150);
  } catch {
    if (!page.isClosed()) throw new CaptureError("capture_unavailable");
  }
}
async function visible(page: Page, selector: string) {
  return (
    !page.isClosed() &&
    (await page
      .locator(selector)
      .first()
      .isVisible()
      .catch(() => false))
  );
}

export class ExplorerCapture implements TokenCapture {
  constructor(
    private readonly launch: BrowserFactory = () =>
      chromium.launch({ headless: true }),
    private readonly timeoutMs = 90000,
    private readonly prepare: (
      context: BrowserContext,
    ) => Promise<void> = async () => {},
  ) {}
  async capture(credentials: Credentials) {
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      browser = await this.launch();
      context = await browser.newContext({
        locale: "en-US",
        acceptDownloads: false,
        serviceWorkers: "block",
      });
      context.setDefaultTimeout(10000);
      await this.prepare(context);
      const page = await context.newPage();
      const attempt = this.signIn(page, credentials);
      const expired = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new CaptureError("capture_timeout")),
          this.timeoutMs,
        );
      });
      return await Promise.race([attempt, expired]);
    } catch (error) {
      if (error instanceof CaptureError) throw error;
      throw new CaptureError("capture_unavailable");
    } finally {
      if (timer) clearTimeout(timer);
      await context?.close().catch(() => {});
      await browser?.close().catch(() => {});
    }
  }
  private assertTrusted(page: Page) {
    const url = new URL(page.url());
    if (url.protocol !== "https:" || !trusted.has(url.hostname))
      throw new CaptureError("interactive_required");
  }
  private async signIn(page: Page, credentials: Credentials) {
    await page.goto(explorer, { waitUntil: "domcontentloaded" });
    const [login] = await Promise.all([
      page.waitForEvent("popup"),
      page
        .getByRole("button", { name: /^sign in$/i })
        .first()
        .click(),
    ]);
    await login.waitForURL(
      (url) => url.protocol === "https:" && trusted.has(url.hostname),
    );
    await login.waitForLoadState("domcontentloaded");
    let mailSent = false,
      passwordSent = false,
      persistenceDeclined = false;
    const until = Date.now() + this.timeoutMs;
    while (!login.isClosed()) {
      this.assertTrusted(login);
      if (
        await visible(
          login,
          "#idDiv_SAOTCS_Proofs,#idDiv_SAOTCC_Description,#idRichContext_DisplaySign,#idTxtBx_SAOTCC_OTC,input[autocomplete=one-time-code]",
        )
      )
        throw new CaptureError("interactive_required");
      if (await visible(login, "#idBtn_Accept"))
        throw new CaptureError("consent_required");
      if (await visible(login, "#passwordError,#usernameError"))
        throw new CaptureError("authentication_rejected");
      if (await visible(login, "input[name=loginfmt]")) {
        if (mailSent) {
          await pause(login);
        } else {
          await login.locator("input[name=loginfmt]").fill(credentials.mail);
          await login
            .locator("input[type=submit],button[type=submit]")
            .first()
            .click();
          mailSent = true;
        }
      } else if (await visible(login, "input[name=passwd]")) {
        if (passwordSent) {
          await pause(login);
        } else {
          await login.locator("input[name=passwd]").fill(credentials.password);
          await login
            .locator("input[type=submit],button[type=submit]")
            .first()
            .click();
          passwordSent = true;
        }
      } else if (
        (await visible(login, "#idBtn_Back")) &&
        !persistenceDeclined
      ) {
        await login.locator("#idBtn_Back").click();
        persistenceDeclined = true;
      } else {
        await pause(login);
      }
      if (Date.now() > until) throw new CaptureError("interactive_required");
    }
    this.assertTrusted(page);
    await page.getByRole("tab", { name: /^access token$/i }).click();
    const token = page.locator("#access-token");
    await token.waitFor({ state: "visible" });
    const untilToken = Date.now() + 10000;
    while (Date.now() < untilToken) {
      const raw = await token.innerText();
      if (raw.trim()) return capturedToken(raw);
      await page.waitForTimeout(100);
    }
    throw new CaptureError("capture_timeout");
  }
}
