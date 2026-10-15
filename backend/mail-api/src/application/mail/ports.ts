import type { Folder } from "../../domain/mail/index.js";
import type { ConversationView, FolderView } from "./contracts.js";
export interface FolderSource {
  folders(): Promise<Folder[]>;
}
export interface FolderReader {
  folders(): Promise<FolderView[]>;
}
export interface FolderWriter {
  discover(folders: readonly Folder[]): Promise<void>;
}
export interface FolderCatalog extends FolderReader, FolderWriter {}
export interface ConversationReader {
  conversations(limit: number, offset: number): Promise<ConversationView[]>;
}
