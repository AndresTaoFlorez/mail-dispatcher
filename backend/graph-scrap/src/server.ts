import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
import {
  CaptureError,
  type TokenCapture,
  type Credentials,
} from "./contracts.js";
export function buildTokenServer(capture: TokenCapture, key: string) {
  if (key.length < 32)
    throw new Error("GRAPH_SCRAP_API_KEY requires at least 32 characters");
  const app = Fastify({
    logger: false,
    bodyLimit: 4096,
    ajv: { customOptions: { removeAdditional: false } },
  });
  let busy = false;
  app.addHook("onRequest", async (request, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff");
    if (request.headers.origin)
      return reply.code(403).send({ error: "origin_not_allowed" });
    const actual = Buffer.from(request.headers.authorization ?? ""),
      expected = Buffer.from(`Bearer ${key}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return reply
        .header("WWW-Authenticate", "Bearer")
        .code(401)
        .send({ error: "unauthorized" });
  });
  app.setErrorHandler((error, _request, reply) => {
    const invalid =
      typeof error === "object" && error !== null && "validation" in error;
    return reply
      .code(invalid ? 400 : 500)
      .send({ error: invalid ? "invalid_request" : "capture_unavailable" });
  });
  app.get("/health", () => ({ status: "ready", mode: "graph-scrap" }));
  app.post<{ Body: Credentials }>(
    "/token",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["mail", "password"],
          properties: {
            mail: { type: "string", format: "email", maxLength: 254 },
            password: { type: "string", minLength: 1, maxLength: 1024 },
          },
        },
      },
    },
    async (request, reply) => {
      if (busy) return reply.code(409).send({ error: "capture_busy" });
      busy = true;
      try {
        return await capture.capture(request.body);
      } catch (error) {
        const code =
          error instanceof CaptureError ? error.code : "capture_unavailable";
        return reply
          .code(
            code === "authentication_rejected"
              ? 401
              : code === "interactive_required" || code === "consent_required"
                ? 409
                : 502,
          )
          .send({ error: code });
      } finally {
        busy = false;
      }
    },
  );
  return app;
}
