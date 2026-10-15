export { createMailOperations } from "./operations.js";
export { listFolders } from "./use-cases/list-folders.js";
export { discoverFolders } from "./use-cases/discover-folders.js";
export { listConversations } from "./use-cases/list-conversations.js";
export type {
  MailOperations,
  FolderView,
  ConversationView,
} from "./contracts.js";
export type {
  FolderSource,
  FolderReader,
  FolderWriter,
  FolderCatalog,
  ConversationReader,
} from "./ports.js";
