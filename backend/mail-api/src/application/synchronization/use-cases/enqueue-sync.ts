import type { SyncQueue } from "../ports.js";
export function enqueueSync(queue: SyncQueue, folderId: string) {
  return queue.enqueue(folderId);
}
