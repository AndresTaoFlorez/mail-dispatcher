import type { ConversationReader } from "../ports.js";
export function listConversations(
  reader: ConversationReader,
  limit: number,
  offset: number,
) {
  return reader.conversations(limit, offset);
}
