import type { FolderSource, FolderCatalog } from "../ports.js";
export async function discoverFolders(
  source: FolderSource,
  catalog: FolderCatalog,
) {
  await catalog.discover(await source.folders());
  return catalog.folders();
}
