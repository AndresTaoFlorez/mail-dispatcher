export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
}
export type MessageChange =
  | { id: string; removed: true }
  | {
      id: string;
      removed: false;
      conversationId: string;
      subject: string;
      receivedAt: string | null;
      isRead: boolean;
    };
export interface ChangePage {
  changes: MessageChange[];
  cursor: string;
  complete: boolean;
}
export class IntakeError extends Error {
  constructor(
    public readonly code:
      | "provider_unavailable"
      | "authorization_required"
      | "invalid_cursor"
      | "invalid_response"
      | "lease_lost"
      | "login_required"
      | "login_not_supported"
      | "authentication_busy"
      | "authentication_failed"
      | "interactive_required",
  ) {
    super(code);
  }
}
