import type { MessageMetadata } from "../../domain/mail/index.js";
export type MessageChange =
  { id: string; removed: true } | (MessageMetadata & { removed: false });
export interface ChangePage {
  changes: MessageChange[];
  cursor: string;
  complete: boolean;
}
export interface SyncJob {
  id: string;
  folderId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  pages: number;
  errorCode: string | null;
}
export interface ClaimedJob extends SyncJob {
  lease: string;
}
export interface SyncState {
  cursor: string | null;
  generation: string;
  fullSync: boolean;
}
export interface SynchronizationOperations {
  enqueue(folderId: string): Promise<SyncJob | null>;
  jobs(): Promise<SyncJob[]>;
  tick(): Promise<boolean>;
}
