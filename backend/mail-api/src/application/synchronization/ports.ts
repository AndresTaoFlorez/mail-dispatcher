import type {
  ChangePage,
  SyncJob,
  ClaimedJob,
  SyncState,
} from "./contracts.js";
export interface MessageChangeSource {
  changes(folderId: string, cursor: string | null): Promise<ChangePage>;
}
export interface JobReader {
  jobs(): Promise<SyncJob[]>;
}
export interface SyncQueue {
  enqueue(folderId: string): Promise<SyncJob | null>;
}
/** One page, checkpoint and job transition must commit atomically under the same lease. */
export interface SyncCheckpointStore {
  claim(): Promise<ClaimedJob | null>;
  state(job: ClaimedJob): Promise<SyncState>;
  reset(job: ClaimedJob): Promise<void>;
  savePage(job: ClaimedJob, state: SyncState, page: ChangePage): Promise<void>;
  fail(job: ClaimedJob, code: string): Promise<void>;
}
