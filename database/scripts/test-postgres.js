import { spawnSync } from "node:child_process";
if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL must name an explicitly configured disposable database",
  );
}
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", "backend/mail-api/tests/postgres.test.ts"],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
