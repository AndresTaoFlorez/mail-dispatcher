import type {
  MessageChangeSource,
  JobReader,
  SyncQueue,
  SyncCheckpointStore,
} from "./ports.js";
import type { SynchronizationOperations } from "./contracts.js";
import { enqueueSync } from "./use-cases/enqueue-sync.js";
import { listJobs } from "./use-cases/list-jobs.js";
import { processPage } from "./use-cases/process-page.js";
export function createSynchronization(
  source: MessageChangeSource,
  jobs: JobReader & SyncQueue,
  checkpoints: SyncCheckpointStore,
): SynchronizationOperations {
  return {
    enqueue: (folder) => enqueueSync(jobs, folder),
    jobs: () => listJobs(jobs),
    tick: () => processPage(source, checkpoints),
  };
}
