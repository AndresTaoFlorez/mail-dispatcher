import type { FastifyInstance } from "fastify";
import type {
  SynchronizationOperations,
  SyncJob,
} from "../../../application/synchronization/index.js";
/** Preserve the existing wire contract; database column spelling stays out of Application. */
function jobResponse(job: SyncJob) {
  return {
    id: job.id,
    folder_id: job.folderId,
    status: job.status,
    pages: job.pages,
    error_code: job.errorCode,
  };
}
export function registerSyncRoutes(
  app: FastifyInstance,
  operations: Pick<SynchronizationOperations, "enqueue" | "jobs">,
) {
  app.get("/api/jobs", async () => (await operations.jobs()).map(jobResponse));
  app.post<{ Params: { id: string } }>(
    "/api/folders/:id/sync",
    async (request, reply) => {
      const job = await operations.enqueue(request.params.id);
      return job
        ? reply.code(202).send(jobResponse(job))
        : reply.code(404).send({ error: "folder_not_found" });
    },
  );
}
