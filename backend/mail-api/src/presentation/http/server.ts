import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
import type { MailOperations } from "../../application/mail/index.js";
import type { SynchronizationOperations } from "../../application/synchronization/index.js";
import type { AuthenticationOperations } from "../../application/authentication/index.js";
import { registerErrors } from "./errors.js";
import { registerMailRoutes } from "./mail/routes.js";
import { registerSyncRoutes } from "./synchronization/routes.js";
import { registerAuthRoutes } from "./authentication/routes.js";
export type MailboxHttpApi = MailOperations &
  Pick<SynchronizationOperations, "enqueue" | "jobs">;
export function buildServer(
  intake: MailboxHttpApi,
  token: string,
  authorization?: AuthenticationOperations,
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

  registerErrors(app);
  registerMailRoutes(app, intake);
  registerSyncRoutes(app, intake);
  registerAuthRoutes(app, authorization);
  return app;
}
