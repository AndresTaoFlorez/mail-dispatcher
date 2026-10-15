import { z } from "zod";
import type {
  LoginInput,
  MailboxLogin,
  AccessTokenSource,
} from "../../../application/authentication/index.js";
import { OperationError } from "../../../application/index.js";
const responseSchema = z.object({
  accessToken: z.string().min(1).max(32768),
  tokenType: z.literal("Bearer"),
  expiresAt: z.iso.datetime(),
});
const claimsSchema = z.object({
  tid: z.uuid(),
  oid: z.uuid(),
  exp: z.number().int().positive(),
  aud: z.union([
    z.literal("https://graph.microsoft.com"),
    z.literal("00000003-0000-0000-c000-000000000000"),
  ]),
  scp: z.string(),
});
export class CapturedTokenSource implements AccessTokenSource {
  constructor(
    private readonly accessToken: string,
    private readonly expiresAt: number,
  ) {}
  async token(forceRefresh = false) {
    if (forceRefresh || this.expiresAt <= Date.now() + 5000)
      throw new OperationError("authorization_required");
    return this.accessToken;
  }
}
export class ScrapMailboxLogin implements MailboxLogin {
  private readonly endpoint: string;
  constructor(
    baseUrl: string,
    private readonly serviceKey: string,
    private readonly request: typeof fetch = fetch,
  ) {
    const url = new URL(baseUrl);
    if (
      url.username ||
      url.password ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
        ))
    )
      throw new Error("Use HTTPS or loopback for graph-scrap");
    if (serviceKey.length < 32)
      throw new Error("A separate graph-scrap service key is required");
    this.endpoint = new URL("/token", url).href;
  }
  async authorize(input: LoginInput) {
    try {
      const captured = await this.request(this.endpoint, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(110000),
        headers: {
          Authorization: `Bearer ${this.serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      if (!captured.ok) {
        if (captured.status === 409)
          throw new OperationError("interactive_required");
        throw new OperationError("authentication_failed");
      }
      const token = responseSchema.parse(await captured.json());
      // Accept identity metadata only after Microsoft Graph accepts this token.
      const verified = await this.request(
        "https://graph.microsoft.com/v1.0/me?$select=id",
        {
          method: "GET",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${token.accessToken}` },
        },
      );
      if (!verified.ok) throw new OperationError("authorization_required");
      const identity = z.object({ id: z.uuid() }).parse(await verified.json());
      const claims = claimsSchema.parse(
        JSON.parse(
          Buffer.from(token.accessToken.split(".")[1], "base64url").toString(
            "utf8",
          ),
        ),
      );
      const expiry = Math.min(Date.parse(token.expiresAt), claims.exp * 1000);
      if (
        identity.id !== claims.oid ||
        expiry <= Date.now() + 5000 ||
        !claims.scp
          .split(" ")
          .some((s) =>
            ["Mail.ReadBasic", "Mail.Read", "Mail.ReadWrite"].includes(s),
          )
      )
        throw new OperationError("authorization_required");
      const source = new CapturedTokenSource(token.accessToken, expiry);
      return {
        tenantId: claims.tid,
        mailboxId: identity.id,
        expiresAt: new Date(expiry).toISOString(),
        tokens: source,
      };
    } catch (error) {
      if (error instanceof OperationError) throw error;
      throw new OperationError("authentication_failed");
    }
  }
}
