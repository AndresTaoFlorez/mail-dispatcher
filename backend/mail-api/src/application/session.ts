import { Intake } from "./intake.js";
import type { IntakeStore, MailProvider } from "./ports.js";
import { IntakeError } from "../domain/mail.js";
export interface LoginInput {
  mail: string;
  password: string;
}
export interface AuthorizedMailbox {
  tenantId: string;
  mailboxId: string;
  expiresAt: string | null;
  provider: MailProvider;
}
export interface MailboxLogin {
  authorize(input: LoginInput): Promise<AuthorizedMailbox>;
}
export interface AuthorizationStatus {
  mode: "entra" | "graph-scrap";
  state: "configured" | "authorized" | "login_required";
  expiresAt: string | null;
}
export class MailboxSession {
  private intake: Intake | null = null;
  private expiresAt: string | null = null;
  private busy = false;
  constructor(
    private readonly mode: "entra" | "graph-scrap",
    private readonly storeFor: (
      identity: AuthorizedMailbox,
    ) => Promise<IntakeStore>,
    private readonly loginProvider?: MailboxLogin,
  ) {}
  async configure(mailbox: AuthorizedMailbox) {
    const store = await this.storeFor(mailbox);
    this.intake = new Intake(mailbox.provider, store);
    this.expiresAt = mailbox.expiresAt;
  }
  status(): AuthorizationStatus {
    return {
      mode: this.mode,
      state:
        this.mode === "entra"
          ? "configured"
          : this.intake &&
              this.expiresAt &&
              Date.parse(this.expiresAt) > Date.now()
            ? "authorized"
            : "login_required",
      expiresAt: this.expiresAt,
    };
  }
  async login(input: LoginInput) {
    if (this.mode !== "graph-scrap" || !this.loginProvider)
      throw new IntakeError("login_not_supported");
    if (this.busy) throw new IntakeError("authentication_busy");
    this.busy = true;
    try {
      await this.configure(await this.loginProvider.authorize(input));
      return this.status();
    } finally {
      this.busy = false;
    }
  }
  private current() {
    if (!this.intake) throw new IntakeError("login_required");
    return this.intake;
  }
  folders() {
    return this.current().folders();
  }
  jobs() {
    return this.current().jobs();
  }
  conversations(limit: number, offset: number) {
    return this.current().conversations(limit, offset);
  }
  enqueue(folder: string) {
    return this.current().enqueue(folder);
  }
  discover() {
    return this.current().discover();
  }
  tick() {
    return this.intake ? this.intake.tick() : Promise.resolve(false);
  }
}
