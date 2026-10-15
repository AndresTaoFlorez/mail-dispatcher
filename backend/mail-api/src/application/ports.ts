import type { Folder, ChangePage } from "../domain/mail.js";
export interface MailProvider {
  folders(): Promise<Folder[]>;
  changes(folderId: string, cursor: string | null): Promise<ChangePage>;
}
export interface Job {
  id: string;
  folder_id: string;
  status: string;
  pages: number;
  error_code: string | null;
}
export interface ClaimedJob extends Job {
  lease: string;
}
export interface SyncState {
  cursor: string | null;
  generation: string;
  full_sync: boolean;
}
export interface Conversation {
  id: string;
  subject: string;
  messageCount: number;
}
export interface IntakeStore {
  discover(folders: Folder[]): Promise<void>;
  folders(): Promise<Folder[]>;
  enqueue(folderId: string): Promise<Job | null>;
  jobs(): Promise<Job[]>;
  conversations(limit: number, offset: number): Promise<Conversation[]>;
  claim(): Promise<ClaimedJob | null>;
  state(job: ClaimedJob): Promise<SyncState>;
  reset(job: ClaimedJob): Promise<void>;
  savePage(job: ClaimedJob, state: SyncState, page: ChangePage): Promise<void>;
  fail(job: ClaimedJob, code: string): Promise<void>;
}
