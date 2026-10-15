import type { FastifyInstance } from "fastify";
import type {
  AuthenticationOperations,
  LoginInput,
  AuthorizationStatus,
} from "../../../application/authentication/index.js";
import { OperationError } from "../../../application/index.js";
function statusResponse(result: AuthorizationStatus) {
  return {
    mode: result.mode,
    state: result.state,
    expiresAt: result.expiresAt,
  };
}
export function registerAuthRoutes(
  app: FastifyInstance,
  authorization?: AuthenticationOperations,
) {
  app.get("/api/auth/status", () =>
    statusResponse(
      authorization?.status() ?? {
        mode: "entra",
        state: "configured",
        expiresAt: null,
      },
    ),
  );
  app.post<{ Body: LoginInput }>(
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
      if (!authorization) throw new OperationError("login_not_supported");
      const result = await authorization.login({
        mail: request.body.mail,
        password: request.body.password,
      });
      return statusResponse(result);
    },
  );
}
