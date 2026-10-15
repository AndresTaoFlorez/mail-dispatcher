import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(170021001)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS public.intake_migrations(version integer PRIMARY KEY, sha256 text NOT NULL)",
  );
  const sql = await readFile(
    new URL("../migrations/001_intake.sql", import.meta.url),
    "utf8",
  );
  const hash = createHash("sha256").update(sql).digest("hex");
  const prior = await client.query(
    "SELECT sha256 FROM public.intake_migrations WHERE version=1",
  );
  if (prior.rowCount && prior.rows[0].sha256 !== hash)
    throw new Error("Applied migration checksum mismatch");
  if (!prior.rowCount) {
    await client.query(sql);
    await client.query("INSERT INTO public.intake_migrations VALUES(1,$1)", [
      hash,
    ]);
  }
  await client.query("COMMIT");
  console.log("Intake migration 1 verified");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
