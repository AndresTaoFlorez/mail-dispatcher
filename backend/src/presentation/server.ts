import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
import type { Intake } from "../application/intake.js";
export function buildServer(intake: Intake, token: string) {
  if (token.length < 32)
    throw new Error("API_TOKEN must contain at least 32 characters");
  const app = Fastify({
    logger: false,
    bodyLimit: 4096,
  });
  app.addHook("onRequest", async (request, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff");
    const origin = request.headers.origin;
    if (origin && origin !== "http://127.0.0.1:5173")
      return reply.code(403).send({ error: "origin_not_allowed" });
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
    const invalid =
      typeof error === "object" && error !== null && "validation" in error;
    return reply
      .code(invalid ? 400 : 500)
      .send({ error: invalid ? "invalid_request" : "request_failed" });
  });
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
