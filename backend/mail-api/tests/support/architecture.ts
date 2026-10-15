import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
const canonical = (file: string) =>
  resolve(file).split(String.fromCharCode(92)).join("/");
export function sourceFiles(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  function visit(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith(".ts"))
        result[canonical(path)] = readFileSync(path, "utf8");
    }
  }
  visit(root);
  return result;
}
/** Source dependencies, including type-only edges. Computed module paths are deliberately forbidden. */
export function checkArchitecture(
  root: string,
  input: Record<string, string>,
  options: ts.CompilerOptions,
): string[] {
  const files = new Map(
    Object.entries(input).map(([file, source]) => [canonical(file), source]),
  );
  const issues: string[] = [];
  const edges = new Map<string, string[]>();
  const host: ts.ModuleResolutionHost = {
    fileExists: (file) => files.has(canonical(file)) || ts.sys.fileExists(file),
    readFile: (file) => files.get(canonical(file)) ?? ts.sys.readFile(file),
  };
  const area = (file: string) =>
    relative(root, file).split(String.fromCharCode(92)).join("/").split("/");
  const layers = [
    "domain",
    "application",
    "infrastructure",
    "presentation",
    "composition",
  ];
  for (const [file, source] of files) {
    const from = area(file);
    const layer = from[0];
    const capability = from.length > 2 ? from[1] : "$shared";
    edges.set(file, []);
    if (!layers.includes(layer)) issues.push(`Unowned source file: ${file}`);
    function dependency(
      node: ts.Node,
      specifier: ts.Expression | ts.TypeNode | undefined,
    ) {
      if (!specifier || !ts.isStringLiteralLike(specifier)) {
        issues.push(`Computed dependency in ${file}`);
        return;
      }
      const name = specifier.text;
      const target = ts.resolveModuleName(
        name,
        file,
        options,
        host,
      ).resolvedModule;
      const resolved = target ? canonical(target.resolvedFileName) : null;
      if (!resolved || !files.has(resolved)) {
        if (name.startsWith("."))
          issues.push(`Unresolved local dependency ${name} in ${file}`);
        if (layer === "domain" || layer === "application")
          issues.push(`External dependency ${name} in ${file}`);
        if (/^(playwright|playwright-core|@playwright\/test)(\/|$)/.test(name))
          issues.push(`Browser dependency in mail-api: ${file}`);
        if (
          layer === "presentation" &&
          /^(pg|@azure\/msal-node)(\/|$)/.test(name)
        )
          issues.push(`Infrastructure package in Presentation: ${file}`);
        return;
      }
      edges.get(file)!.push(resolved);
      const to = area(resolved);
      const targetLayer = to[0];
      const targetCapability = to.length > 2 ? to[1] : "$shared";
      const allowed: Record<string, string[]> = {
        domain: ["domain"],
        application: ["domain", "application"],
        infrastructure: ["domain", "application", "infrastructure"],
        presentation: ["application", "presentation"],
        composition: layers,
      };
      if (!allowed[layer]?.includes(targetLayer))
        issues.push(`Outward dependency ${file} -> ${resolved}`);
      const publicEntry =
        to.at(-1) === "index.ts" && (to.length === 2 || to.length === 3);
      if (
        ["application", "domain"].includes(targetLayer) &&
        (layer !== targetLayer || capability !== targetCapability) &&
        !publicEntry
      ) {
        issues.push(`Private capability import ${file} -> ${resolved}`);
      }
      if (
        layer === "infrastructure" &&
        targetLayer === layer &&
        capability !== targetCapability &&
        !publicEntry
      ) {
        issues.push(`Private adapter capability import ${file} -> ${resolved}`);
      }
      void node;
    }
    const tree = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier) dependency(node, node.moduleSpecifier);
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        dependency(node, node.moduleReference.expression);
      } else if (ts.isImportTypeNode(node)) {
        dependency(
          node,
          ts.isLiteralTypeNode(node.argument)
            ? node.argument.literal
            : undefined,
        );
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"))
      ) {
        dependency(node, node.arguments[0]);
      }
      if (
        (layer === "domain" || layer === "application") &&
        ts.isIdentifier(node) &&
        ["fetch", "process"].includes(node.text)
      ) {
        issues.push(`Ambient infrastructure access ${node.text} in ${file}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  const state = new Map<string, number>();
  function cycle(file: string, stack: string[]) {
    if (state.get(file) === 1) {
      issues.push(`Dependency cycle: ${[...stack, file].join(" -> ")}`);
      return;
    }
    if (state.get(file) === 2) return;
    state.set(file, 1);
    for (const next of edges.get(file) ?? []) cycle(next, [...stack, file]);
    state.set(file, 2);
  }
  for (const file of files.keys()) cycle(file, []);
  return issues;
}
export function projectOptions(path: string): ts.CompilerOptions {
  const config = ts.readConfigFile(path, ts.sys.readFile);
  if (config.error) throw new Error("Cannot read TypeScript configuration");
  return ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(path))
    .options;
}
