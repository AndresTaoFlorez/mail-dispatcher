import type {
  FolderSource,
  FolderCatalog,
  ConversationReader,
} from "./ports.js";
import type { MailOperations } from "./contracts.js";
import { listFolders } from "./use-cases/list-folders.js";
import { discoverFolders } from "./use-cases/discover-folders.js";
import { listConversations } from "./use-cases/list-conversations.js";
export function createMailOperations(
  source: FolderSource,
  folders: FolderCatalog,
  conversations: ConversationReader,
): MailOperations {
  return {
    folders: () => listFolders(folders),
    discover: () => discoverFolders(source, folders),
    conversations: (limit, offset) =>
      listConversations(conversations, limit, offset),
  };
}
