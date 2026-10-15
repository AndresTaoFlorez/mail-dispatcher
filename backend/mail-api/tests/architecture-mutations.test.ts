import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkArchitecture } from "./support/architecture.js";
const root = fileURLToPath(new URL("./support/virtual-src/", import.meta.url));
const options: ts.CompilerOptions = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  baseUrl: root,
  paths: { "@/*": ["*"] },
};
function check(entries: Record<string, string>) {
  return checkArchitecture(
    root,
    Object.fromEntries(
      Object.entries(entries).map(([path, text]) => [
        resolve(root, path),
        text,
      ]),
    ),
    options,
  );
}
const cases = [
  [
    "type-only outward relative import",
    'import type { Driver } from "../../infrastructure/db/driver.js";',
  ],
  [
    "outward re-export",
    'export { Driver } from "../../infrastructure/db/driver.js";',
  ],
  [
    "outward literal dynamic import",
    'void import("../../infrastructure/db/driver.js");',
  ],
  [
    "outward path alias",
    'import type { Driver } from "@/infrastructure/db/driver.js";',
  ],
  [
    "outward import type expression",
    'type Driver = import("../../infrastructure/db/driver.js").Driver;',
  ],
] as const;
for (const [label, source] of cases)
  test(`architecture guard rejects ${label}`, () => {
    const issues = check({
      "application/mail/operation.ts": source,
      "infrastructure/db/driver.ts": "export interface Driver {}",
    });
    assert.ok(
      issues.some((issue) => issue.startsWith("Outward dependency")),
      issues.join("\n"),
    );
  });
test("architecture guard permits alias imports through supported application entries", () => {
  assert.deepEqual(
    check({
      "presentation/http/handler.ts":
        'import type { Result } from "@/application/mail/index.js";',
      "application/mail/index.ts":
        'export type { Result } from "./contracts.js";',
      "application/mail/contracts.ts": "export interface Result {}",
    }),
    [],
  );
});
test("architecture guard rejects private cross-capability imports", () => {
  assert.ok(
    check({
      "application/authentication/session.ts":
        'import type { Secret } from "../mail/private.js";',
      "application/mail/private.ts": "export interface Secret {}",
    }).some((issue) => issue.startsWith("Private capability import")),
  );
});
test("architecture guard rejects direct Domain imports from HTTP delivery", () => {
  assert.ok(
    check({
      "presentation/http/routes.ts":
        'import type { Message } from "../../domain/mail/index.js";',
      "domain/mail/index.ts": "export interface Message {}",
    }).some((issue) => issue.startsWith("Outward dependency")),
  );
});
test("architecture guard rejects computed loading, cycles and ambient I/O", () => {
  assert.ok(
    check({
      "application/mail/computed.ts": 'const path = "x"; void import(path);',
    }).some((issue) => issue.startsWith("Computed dependency")),
  );
  assert.ok(
    check({
      "domain/mail/a.ts": 'export * from "./b.js";',
      "domain/mail/b.ts": 'export * from "./a.js";',
    }).some((issue) => issue.startsWith("Dependency cycle")),
  );
  assert.ok(
    check({
      "application/mail/network.ts": 'void fetch("https://example.invalid");',
    }).some((issue) => issue.startsWith("Ambient infrastructure access")),
  );
});
test("architecture guard rejects framework and unresolved relative dependencies", () => {
  assert.ok(
    check({ "domain/mail/model.ts": 'import "pg";' }).some((issue) =>
      issue.startsWith("External dependency"),
    ),
  );
  assert.ok(
    check({ "application/mail/query.ts": 'import "./missing.js";' }).some(
      (issue) => issue.startsWith("Unresolved local dependency"),
    ),
  );
});
