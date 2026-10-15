import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("the TypeScript backend is the only application runtime", () => {
  for (const path of [
    "agent",
    "api/presentation",
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
    existsSync(join(root, "backend/src/infrastructure/graph/provider.ts")),
    true,
  );
  assert.equal(existsSync(join(root, "wdd/engine.py")), true);
});

test("domain and application imports do not depend on concrete adapters", () => {
  for (const layer of ["domain", "application"]) {
    for (const name of readdirSync(join(root, "backend/src", layer))) {
      if (!name.endsWith(".ts")) continue;
      const source = readFileSync(
        join(root, "backend/src", layer, name),
        "utf8",
      );
      assert.doesNotMatch(
        source,
        /from\s+["'][^"']*(?:infrastructure|presentation|@azure|fastify|\bpg\b)/,
      );
    }
  }
});

test("validation commands do not require deleted automation files", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const command of Object.values(manifest.scripts)) {
    assert.doesNotMatch(String(command), /\.github|api\.presentation|litestar/);
  }
});
