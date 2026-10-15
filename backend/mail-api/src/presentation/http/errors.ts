import type { FastifyInstance } from "fastify";
import { OperationError } from "../../application/index.js";
export function registerErrors(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof OperationError) {
      const status =
        error.code === "authentication_failed"
          ? 401
          : error.code === "provider_unavailable"
            ? 503
            : error.code === "invalid_response"
              ? 502
              : 409;
      if (status === 401) reply.header("WWW-Authenticate", "Bearer");
      return reply.code(status).send({ error: error.code });
    }
    const invalid =
      typeof error === "object" && error !== null && "validation" in error;
    return reply
      .code(invalid ? 400 : 500)
      .send({ error: invalid ? "invalid_request" : "request_failed" });
  });
}
