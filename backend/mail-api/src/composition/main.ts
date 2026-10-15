import pg from "pg";
import { z } from "zod";
import { msalTokens } from "../infrastructure/authentication/entra/auth.js";
import { ScrapMailboxLogin } from "../infrastructure/authentication/graph-scrap/login.js";
import { MailboxSession } from "../application/authentication/index.js";
import { buildServer } from "../presentation/http/index.js";
import { openMailboxWorkspace, sessionOperations } from "./mailbox.js";
const common = {
  DATABASE_URL: z.string().min(1),
  API_TOKEN: z.string().min(32),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3100),
};
const input = {
  ...process.env,
  GRAPH_AUTH_MODE: process.env.GRAPH_AUTH_MODE ?? "entra",
};
const config = z
  .discriminatedUnion("GRAPH_AUTH_MODE", [
    z.object({
      ...common,
      GRAPH_AUTH_MODE: z.literal("entra"),
      ENTRA_TENANT_ID: z.uuid(),
      ENTRA_CLIENT_ID: z.uuid(),
      ENTRA_CLIENT_SECRET: z.string().min(1),
      GRAPH_MAILBOX_ID: z.uuid(),
    }),
    z.object({
      ...common,
      GRAPH_AUTH_MODE: z.literal("graph-scrap"),
      GRAPH_SCRAP_URL: z.url(),
      GRAPH_SCRAP_API_KEY: z.string().min(32),
    }),
  ])
  .safeParse(input);
if (!config.success) {
  console.error("invalid_mail_api_configuration");
  process.exit(1);
}
async function main() {
  if (!config.success) return;
  const env = config.data;
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  });
  pool.on("error", () => console.error("database_connection_failed"));
  try {
    const login =
      env.GRAPH_AUTH_MODE === "graph-scrap"
        ? new ScrapMailboxLogin(env.GRAPH_SCRAP_URL, env.GRAPH_SCRAP_API_KEY)
        : undefined;
    const runtime = new MailboxSession(
      env.GRAPH_AUTH_MODE,
      (identity) => openMailboxWorkspace(pool, identity),
      login,
    );
    if (env.GRAPH_AUTH_MODE === "entra")
      await runtime.configure({
        tenantId: env.ENTRA_TENANT_ID,
        mailboxId: env.GRAPH_MAILBOX_ID,
        expiresAt: null,
        tokens: msalTokens(
          env.ENTRA_TENANT_ID,
          env.ENTRA_CLIENT_ID,
          env.ENTRA_CLIENT_SECRET,
        ),
      });
    const operations = sessionOperations(runtime);
    const app = buildServer(operations, env.API_TOKEN, runtime);
    await app.listen({ host: "127.0.0.1", port: env.PORT });
    let stopped = false;
    const worker = (async () => {
      while (!stopped) {
        try {
          if (await operations.tick()) continue;
        } catch {
          console.error("sync_worker_failed");
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    })();
    for (const signal of ["SIGTERM", "SIGINT"] as const)
      process.once(signal, () => {
        void (async () => {
          stopped = true;
          await app.close();
          await worker;
          await pool.end();
        })();
      });
    console.log("mail_api_ready");
  } catch {
    await pool.end();
    throw new Error("mail_api_start_failed");
  }
}
void main().catch(() => {
  console.error("mail_api_start_failed");
  process.exitCode = 1;
});
