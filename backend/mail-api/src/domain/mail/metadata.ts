export interface Folder {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}
export interface MessageMetadata {
  readonly id: string;
  readonly conversationId: string;
  readonly subject: string;
  readonly receivedAt: string | null;
  readonly isRead: boolean;
}
export class InvalidMessageIdentity extends Error {}
export function isMailIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
/** Preserve provider identities exactly. Missing subject means an empty subject, not missing mail. */
export function messageMetadata(
  input: Omit<MessageMetadata, "subject"> & { subject: string | null },
): MessageMetadata {
  if (!isMailIdentifier(input.id) || !isMailIdentifier(input.conversationId))
    throw new InvalidMessageIdentity();
  return Object.freeze({
    id: input.id,
    conversationId: input.conversationId,
    subject: input.subject ?? "",
    receivedAt: input.receivedAt,
    isRead: input.isRead,
  });
}
