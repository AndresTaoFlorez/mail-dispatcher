import type { FastifyInstance } from "fastify";
import type {
  MailOperations,
  FolderView,
} from "../../../application/mail/index.js";
const folderResponse = (folder: FolderView) => ({
  id: folder.id,
  name: folder.name,
  parentId: folder.parentId,
});
export function registerMailRoutes(
  app: FastifyInstance,
  operations: MailOperations,
) {
  app.get("/api/folders", async () =>
    (await operations.folders()).map(folderResponse),
  );
  app.post("/api/folders/discover", async () =>
    (await operations.discover()).map(folderResponse),
  );
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
    async (request) =>
      (
        await operations.conversations(
          request.query.limit ?? 50,
          request.query.offset ?? 0,
        )
      ).map((item) => ({
        id: item.id,
        subject: item.subject,
        messageCount: item.messageCount,
      })),
  );
}
