import { z } from "zod";
import { CaptureError, type CapturedToken } from "./contracts.js";
const claims = z.object({
  aud: z.union([
    z.literal("https://graph.microsoft.com"),
    z.literal("00000003-0000-0000-c000-000000000000"),
  ]),
  exp: z.number().int().positive(),
});
// This is format/expiry screening, not cryptographic token verification. Graph validates access.
export function capturedToken(raw: string, now = Date.now()): CapturedToken {
  try {
    const token = raw.trim();
    if (token.length > 32768 || token.split(".").length !== 3)
      throw new Error();
    const parsed = claims.parse(
      JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
      ),
    );
    if (parsed.exp * 1000 <= now + 30000) throw new Error();
    return {
      accessToken: token,
      tokenType: "Bearer",
      expiresAt: new Date(parsed.exp * 1000).toISOString(),
    };
  } catch {
    throw new CaptureError("unsupported_token");
  }
}
