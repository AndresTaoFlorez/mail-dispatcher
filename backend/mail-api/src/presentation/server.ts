import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
import type { Intake } from "../application/intake.js";
import type { MailboxSession } from "../application/session.js";
import { IntakeError } from "../domain/mail.js";
type IntakeAPI = Pick<
  Intake,
  "folders" | "jobs" | "conversations" | "enqueue" | "discover"
>;
export function buildServer(
  intake: IntakeAPI,
  token: string,
  authorization?: Pick<MailboxSession, "login" | "status">,
) {
  if (token.length < 32)
    throw new Error("API_TOKEN must contain at least 32 characters");
  const app = Fastify({
    logger: false,
    bodyLimit: 4096,
    ajv: { customOptions: { removeAdditional: false } },
  });
  app.addHook("onRequest", async (request, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff");
    const origin = request.headers.origin;
    if (origin) return reply.code(403).send({ error: "origin_not_allowed" });
    const supplied = Buffer.from(request.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return reply
        .header("WWW-Authenticate", "Bearer")
        .code(401)
        .send({ error: "unauthorized" });
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof IntakeError) {
      const status =
        error.code === "authentication_failed"
          ? 401
          : error.code === "provider_unavailable"
            ? 503
            : error.code === "invalid_response"
              ? 502
              : 409;
      return reply.code(status).send({ error: error.code });
    }
    const invalid =
      typeof error === "object" && error !== null && "validation" in error;
    return reply
      .code(invalid ? 400 : 500)
      .send({ error: invalid ? "invalid_request" : "request_failed" });
  });
  app.get(
    "/api/auth/status",
    () =>
      authorization?.status() ?? {
        mode: "entra",
        state: "configured",
        expiresAt: null,
      },
  );
  app.post<{ Body: { mail: string; password: string } }>(
    "/api/auth/login",
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
    async (request) => {
      if (!authorization) throw new IntakeError("login_not_supported");
      return authorization.login(request.body);
    },
  );
  app.get("/api/folders", () => intake.folders());
  app.post("/api/folders/discover", () => intake.discover());
  app.post<{ Params: { id: string } }>(
    "/api/folders/:id/sync",
    async (req, reply) => {
      const job = await intake.enqueue(req.params.id);
      return job
        ? reply.code(202).send(job)
        : reply.code(404).send({ error: "folder_not_found" });
    },
  );
  app.get("/api/jobs", () => intake.jobs());
  app.get<{ Querystring: { limit?: number; offset?: number } }>(
    "/api/conversations",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            offset: {
              type: "integer",
              minimum: 0,
              maximum: 100000,
              default: 0,
            },
          },
        },
      },
    },
    (req) => intake.conversations(req.query.limit ?? 50, req.query.offset ?? 0),
  );
  return app;
}
