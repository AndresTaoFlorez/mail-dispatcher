import pg from "pg";
import { z } from "zod";
import { msalTokens } from "../infrastructure/graph/auth.js";
import { GraphProvider } from "../infrastructure/graph/provider.js";
import { PostgresStore } from "../infrastructure/postgres/store.js";
import { Intake } from "../application/intake.js";
import { buildServer } from "../presentation/server.js";
const config = z
  .object({
    DATABASE_URL: z.string().min(1),
    ENTRA_TENANT_ID: z.uuid(),
    ENTRA_CLIENT_ID: z.uuid(),
    ENTRA_CLIENT_SECRET: z.string().min(1),
    GRAPH_MAILBOX_ID: z.uuid(),
    API_TOKEN: z.string().min(32),
    PORT: z.coerce.number().int().min(1024).max(65535).default(3100),
  })
  .safeParse(process.env);
if (!config.success) {
  console.error(
    "Invalid environment configuration; consult backend/.env.example",
  );
  process.exit(1);
}
const env = config.data;
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
});
pool.on("error", () => console.error("database_connection_failed"));
const store = new PostgresStore(
  pool,
  `${env.ENTRA_TENANT_ID}:${env.GRAPH_MAILBOX_ID}`,
);
await store.register(env.ENTRA_TENANT_ID, env.GRAPH_MAILBOX_ID);
const intake = new Intake(
  new GraphProvider(
    msalTokens(
      env.ENTRA_TENANT_ID,
      env.ENTRA_CLIENT_ID,
      env.ENTRA_CLIENT_SECRET,
    ),
    env.GRAPH_MAILBOX_ID,
  ),
  store,
);
const app = buildServer(intake, env.API_TOKEN);
let stopped = false;
const worker = (async () => {
  while (!stopped) {
    try {
      if (await intake.tick()) continue;
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
await app.listen({ host: "127.0.0.1", port: env.PORT });
console.log(
  "Mail Dispatcher listening on loopback; no discovery or sync starts until requested",
);
