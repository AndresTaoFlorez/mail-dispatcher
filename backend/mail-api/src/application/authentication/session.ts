import { OperationError } from "../index.js";
import type {
  AuthenticationMode,
  AuthorizedMailbox,
  AuthorizationStatus,
  AuthenticationOperations,
  MailboxWorkspace,
  LoginInput,
} from "./contracts.js";
import type { ActivateMailbox, MailboxLogin } from "./ports.js";
export class MailboxSession implements AuthenticationOperations {
  private active: {
    workspace: MailboxWorkspace;
    expiresAt: string | null;
  } | null = null;
  private busy = false;
  constructor(
    private readonly mode: AuthenticationMode,
    private readonly activate: ActivateMailbox,
    private readonly loginProvider?: MailboxLogin,
    private readonly now: () => number = Date.now,
  ) {}
  async configure(mailbox: AuthorizedMailbox) {
    const workspace = await this.activate(mailbox);
    this.active = { workspace, expiresAt: mailbox.expiresAt };
  }
  status(): AuthorizationStatus {
    return {
      mode: this.mode,
      state:
        this.mode === "entra"
          ? "configured"
          : this.active?.expiresAt &&
              Date.parse(this.active.expiresAt) > this.now()
            ? "authorized"
            : "login_required",
      expiresAt: this.active?.expiresAt ?? null,
    };
  }
  async login(input: LoginInput) {
    if (this.mode !== "graph-scrap" || !this.loginProvider)
      throw new OperationError("login_not_supported");
    if (this.busy) throw new OperationError("authentication_busy");
    this.busy = true;
    try {
      await this.configure(await this.loginProvider.authorize(input));
      return this.status();
    } finally {
      this.busy = false;
    }
  }
  workspace(): MailboxWorkspace {
    if (!this.active) throw new OperationError("login_required");
    return this.active.workspace;
  }
  optionalWorkspace(): MailboxWorkspace | null {
    return this.active?.workspace ?? null;
  }
}
