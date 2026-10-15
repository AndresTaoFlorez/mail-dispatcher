import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  checkArchitecture,
  sourceFiles,
  projectOptions,
} from "./support/architecture.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));

test("the mailbox backend is isolated from the retired runtime", () => {
  for (const path of [
    "agent",
    "api",
    "main.py",
    "litestar.toml",
    "Dockerfile.agent",
    "Dockerfile.api",
    "docker-compose.yml",
    ".github",
  ]) {
    assert.equal(existsSync(join(root, path)), false, path);
  }
  assert.equal(
    existsSync(
      join(root, "backend/mail-api/src/infrastructure/mail/graph/provider.ts"),
    ),
    true,
  );
  assert.equal(existsSync(join(root, "wdd/engine.py")), true);
  assert.deepEqual(readdirSync(join(root, "backend")).sort(), [
    "graph-scrap",
    "mail-api",
  ]);
  assert.deepEqual(readdirSync(join(root, "frontend")), [".gitkeep"]);
  assert.equal(existsSync(join(root, "migrations")), false);
  assert.equal(
    existsSync(join(root, "database/migrations/001_intake.sql")),
    true,
  );
  assert.equal(existsSync(join(root, "docs/PLAN.md")), true);
  const dependencies = JSON.parse(
    readFileSync(join(root, "backend/mail-api/package.json"), "utf8"),
  ).dependencies;
  assert.equal("playwright" in dependencies, false);
});

test("the complete resolved source graph obeys mandatory Clean boundaries", () => {
  const src = join(root, "backend/mail-api/src");
  assert.deepEqual(
    checkArchitecture(
      src,
      sourceFiles(src),
      projectOptions(join(root, "backend/mail-api/tsconfig.json")),
    ),
    [],
  );
});

test("validation commands do not require deleted automation files", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const command of Object.values(manifest.scripts)) {
    assert.doesNotMatch(String(command), /\.github|api\.presentation|litestar/);
  }
});
