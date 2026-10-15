export interface FolderView {
  id: string;
  name: string;
  parentId: string | null;
}
export interface ConversationView {
  id: string;
  subject: string;
  messageCount: number;
}
export interface MailOperations {
  folders(): Promise<FolderView[]>;
  discover(): Promise<FolderView[]>;
  conversations(limit: number, offset: number): Promise<ConversationView[]>;
}
