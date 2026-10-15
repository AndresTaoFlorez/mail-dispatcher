import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  IntakeStore,
  Job,
  ClaimedJob,
  SyncState,
  Conversation,
} from "../../application/ports.js";
import {
  IntakeError,
  type Folder,
  type ChangePage,
} from "../../domain/mail.js";
export class PostgresStore implements IntakeStore {
  constructor(
    private readonly pool: Pool,
    private readonly mailbox: string,
  ) {}
  private async transaction<T>(
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async register(tenant: string, providerId: string) {
    await this.pool.query(
      "INSERT INTO intake.mailboxes(id,tenant_id,provider_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [this.mailbox, tenant, providerId],
    );
    const result = await this.pool.query(
      "SELECT 1 FROM intake.mailboxes WHERE id=$1 AND tenant_id=$2 AND provider_id=$3",
      [this.mailbox, tenant, providerId],
    );
    if (!result.rowCount) throw new Error("Mailbox identity mismatch");
  }
  async discover(folders: Folder[]) {
    await this.transaction(async (c) => {
      for (const f of folders)
        await c.query(
          "INSERT INTO intake.folders(mailbox_id,id,name,parent_id) VALUES($1,$2,$3,$4) ON CONFLICT(mailbox_id,id) DO UPDATE SET name=excluded.name,parent_id=excluded.parent_id",
          [this.mailbox, f.id, f.name, f.parentId],
        );
    });
  }
  async folders(): Promise<Folder[]> {
    return (
      await this.pool.query(
        'SELECT id,name,parent_id AS "parentId" FROM intake.folders WHERE mailbox_id=$1 ORDER BY name,id',
        [this.mailbox],
      )
    ).rows;
  }
  async enqueue(folder: string): Promise<Job | null> {
    return this.transaction(async (c) => {
      const found = await c.query(
        "SELECT 1 FROM intake.folders WHERE mailbox_id=$1 AND id=$2",
        [this.mailbox, folder],
      );
      if (!found.rowCount) return null;
      await c.query(
        "INSERT INTO intake.jobs(id,mailbox_id,folder_id,status) VALUES($1,$2,$3,'queued') ON CONFLICT DO NOTHING",
        [randomUUID(), this.mailbox, folder],
      );
      return (
        (
          await c.query(
            "SELECT id,folder_id,status,pages,error_code FROM intake.jobs WHERE mailbox_id=$1 AND folder_id=$2 AND status IN ('queued','running')",
            [this.mailbox, folder],
          )
        ).rows[0] ?? null
      );
    });
  }
  async jobs(): Promise<Job[]> {
    return (
      await this.pool.query(
        "SELECT id,folder_id,status,pages,error_code FROM intake.jobs WHERE mailbox_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100",
        [this.mailbox],
      )
    ).rows;
  }
  async conversations(limit: number, offset: number): Promise<Conversation[]> {
    return (
      await this.pool.query(
        `SELECT m.conversation_id AS id, (array_agg(m.subject ORDER BY m.received_at DESC NULLS LAST,m.id))[1] AS subject, count(*)::integer AS "messageCount"
   FROM intake.messages m WHERE m.mailbox_id=$1 AND EXISTS(SELECT 1 FROM intake.memberships f WHERE f.mailbox_id=m.mailbox_id AND f.message_id=m.id)
   GROUP BY m.conversation_id ORDER BY m.conversation_id LIMIT $2 OFFSET $3`,
        [this.mailbox, limit, offset],
      )
    ).rows;
  }
  async claim(): Promise<ClaimedJob | null> {
    return this.transaction(async (c) => {
      const result = await c.query(
        `SELECT id,folder_id,status,pages,error_code FROM intake.jobs WHERE mailbox_id=$1 AND (status='queued' OR (status='running' AND lease_until < now())) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`,
        [this.mailbox],
      );
      if (!result.rowCount) return null;
      const job = result.rows[0];
      const lease = randomUUID();
      await c.query(
        "UPDATE intake.jobs SET status='running',lease=$2,lease_until=now()+interval '180 seconds',updated_at=now() WHERE id=$1",
        [job.id, lease],
      );
      await c.query(
        "INSERT INTO intake.sync_state(mailbox_id,folder_id,generation) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [this.mailbox, job.folder_id, randomUUID()],
      );
      return { ...job, lease, status: "running" };
    });
  }
  private async owned(c: PoolClient, job: ClaimedJob) {
    const result = await c.query(
      "SELECT 1 FROM intake.jobs WHERE id=$1 AND mailbox_id=$2 AND lease=$3 AND status='running' FOR UPDATE",
      [job.id, this.mailbox, job.lease],
    );
    if (!result.rowCount) throw new IntakeError("lease_lost");
  }
  async state(job: ClaimedJob): Promise<SyncState> {
    return (
      await this.pool.query(
        "SELECT cursor,generation,full_sync FROM intake.sync_state WHERE mailbox_id=$1 AND folder_id=$2",
        [this.mailbox, job.folder_id],
      )
    ).rows[0];
  }
  async reset(job: ClaimedJob) {
    await this.transaction(async (c) => {
      await this.owned(c, job);
      await c.query(
        "UPDATE intake.sync_state SET cursor=NULL,generation=$3,full_sync=true WHERE mailbox_id=$1 AND folder_id=$2",
        [this.mailbox, job.folder_id, randomUUID()],
      );
    });
  }
  async savePage(job: ClaimedJob, state: SyncState, page: ChangePage) {
    await this.transaction(async (c) => {
      await this.owned(c, job);
      for (const m of page.changes) {
        if (m.removed) {
          await c.query(
            "DELETE FROM intake.memberships WHERE mailbox_id=$1 AND folder_id=$2 AND message_id=$3",
            [this.mailbox, job.folder_id, m.id],
          );
          continue;
        }
        await c.query(
          `INSERT INTO intake.messages(mailbox_id,id,conversation_id,subject,received_at,is_read) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(mailbox_id,id) DO UPDATE SET conversation_id=excluded.conversation_id,subject=excluded.subject,received_at=excluded.received_at,is_read=excluded.is_read`,
          [
            this.mailbox,
            m.id,
            m.conversationId,
            m.subject,
            m.receivedAt,
            m.isRead,
          ],
        );
        await c.query(
          "INSERT INTO intake.memberships(mailbox_id,folder_id,message_id,generation) VALUES($1,$2,$3,$4) ON CONFLICT(mailbox_id,folder_id,message_id) DO UPDATE SET generation=excluded.generation",
          [this.mailbox, job.folder_id, m.id, state.generation],
        );
      }
      if (page.complete && state.full_sync)
        await c.query(
          "DELETE FROM intake.memberships WHERE mailbox_id=$1 AND folder_id=$2 AND generation<>$3",
          [this.mailbox, job.folder_id, state.generation],
        );
      await c.query(
        "UPDATE intake.sync_state SET cursor=$3,full_sync=$4 WHERE mailbox_id=$1 AND folder_id=$2",
        [
          this.mailbox,
          job.folder_id,
          page.cursor,
          state.full_sync && !page.complete,
        ],
      );
      await c.query(
        "UPDATE intake.jobs SET pages=pages+1,status=$3,lease=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease=$2",
        [job.id, job.lease, page.complete ? "succeeded" : "queued"],
      );
    });
  }
  async fail(job: ClaimedJob, code: string) {
    await this.pool.query(
      "UPDATE intake.jobs SET status='failed',error_code=$3,lease=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease=$2 AND mailbox_id=$4",
      [job.id, job.lease, code, this.mailbox],
    );
  }
}
