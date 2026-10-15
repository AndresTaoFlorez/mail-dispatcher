import type { MailOperations } from "../mail/index.js";
import type { SynchronizationOperations } from "../synchronization/index.js";
import type { AccessTokenSource } from "./token-source.js";
export interface LoginInput {
  mail: string;
  password: string;
}
export type AuthenticationMode = "entra" | "graph-scrap";
export interface AuthorizedMailbox {
  tenantId: string;
  mailboxId: string;
  expiresAt: string | null;
  tokens: AccessTokenSource;
}
export interface AuthorizationStatus {
  mode: AuthenticationMode;
  state: "configured" | "authorized" | "login_required";
  expiresAt: string | null;
}
export type MailboxWorkspace = MailOperations & SynchronizationOperations;
export interface AuthenticationOperations {
  login(input: LoginInput): Promise<AuthorizationStatus>;
  status(): AuthorizationStatus;
}
