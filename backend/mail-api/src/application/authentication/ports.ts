import type {
  LoginInput,
  AuthorizedMailbox,
  MailboxWorkspace,
} from "./contracts.js";
export interface MailboxLogin {
  authorize(input: LoginInput): Promise<AuthorizedMailbox>;
}
/** Prepare a mailbox workspace before atomically replacing an active session. */
export type ActivateMailbox = (
  identity: AuthorizedMailbox,
) => Promise<MailboxWorkspace>;
