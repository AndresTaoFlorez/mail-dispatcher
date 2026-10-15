import type { MailProvider, IntakeStore } from "./ports.js";
import { IntakeError } from "../domain/mail.js";
export class Intake {
  constructor(
    private readonly provider: MailProvider,
    private readonly store: IntakeStore,
  ) {}
  folders() {
    return this.store.folders();
  }
  jobs() {
    return this.store.jobs();
  }
  conversations(limit: number, offset: number) {
    return this.store.conversations(limit, offset);
  }
  enqueue(folderId: string) {
    return this.store.enqueue(folderId);
  }
  async discover() {
    await this.store.discover(await this.provider.folders());
    return this.store.folders();
  }
  async tick(): Promise<boolean> {
    const job = await this.store.claim();
    if (!job) return false;
    try {
      // One committed page per tick bounds work; the next tick resumes the same cursor.
      if (job.pages >= 10000) throw new IntakeError("invalid_response");
      let state = await this.store.state(job);
      let page;
      try {
        page = await this.provider.changes(job.folder_id, state.cursor);
      } catch (error) {
        if (
          !(error instanceof IntakeError) ||
          error.code !== "invalid_cursor" ||
          state.cursor === null
        )
          throw error;
        await this.store.reset(job);
        state = await this.store.state(job);
        page = await this.provider.changes(job.folder_id, null);
      }
      await this.store.savePage(job, state, page);
    } catch (error) {
      await this.store.fail(
        job,
        error instanceof IntakeError ? error.code : "internal_failure",
      );
    }
    return true;
  }
}
