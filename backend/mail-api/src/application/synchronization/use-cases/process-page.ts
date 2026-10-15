import { OperationError } from "../../index.js";
import type { MessageChangeSource, SyncCheckpointStore } from "../ports.js";
export async function processPage(
  source: MessageChangeSource,
  checkpoints: SyncCheckpointStore,
): Promise<boolean> {
  const job = await checkpoints.claim();
  if (!job) return false;
  try {
    if (job.pages >= 10000) throw new OperationError("invalid_response");
    let state = await checkpoints.state(job);
    let page;
    try {
      page = await source.changes(job.folderId, state.cursor);
    } catch (error) {
      if (
        !(error instanceof OperationError) ||
        error.code !== "invalid_cursor" ||
        state.cursor === null
      )
        throw error;
      await checkpoints.reset(job);
      state = await checkpoints.state(job);
      page = await source.changes(job.folderId, null);
    }
    await checkpoints.savePage(job, state, page);
  } catch (error) {
    await checkpoints.fail(
      job,
      error instanceof OperationError ? error.code : "internal_failure",
    );
  }
  return true;
}
