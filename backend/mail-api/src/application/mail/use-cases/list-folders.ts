import type { FolderReader } from "../ports.js";
export function listFolders(reader: FolderReader) {
  return reader.folders();
}
