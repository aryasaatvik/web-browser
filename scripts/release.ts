#!/usr/bin/env bun

import { $ } from "bun";
import * as fs from "node:fs/promises";
import * as path from "node:path";

type PackageKey = "core" | "web-browser" | "extension";

function usage(): never {
  console.error(`Usage:
  bun scripts/release.ts <core|web-browser|extension> <patch|minor|major> [--dry-run]
  bun scripts/release.ts <core|web-browser|extension> version <X.Y.Z> [--dry-run]

Examples:
  bun scripts/release.ts core patch --dry-run
  bun scripts/release.ts web-browser minor
`);
  process.exit(2);
}

function parseArgs(argv: string[]): { pkg: PackageKey; bump: "patch" | "minor" | "major" | "version"; version?: string; dryRun: boolean } {
  const dryRun = argv.includes("--dry-run");
  const filtered = argv.filter((a) => a !== "--dry-run");

  const pkg = filtered[0] as PackageKey | undefined;
  const bump = filtered[1] as any;
  if (!pkg || !["core", "web-browser", "extension"].includes(pkg)) usage();
  if (!bump || !["patch", "minor", "major", "version"].includes(bump)) usage();
  if (bump === "version") {
    const version = filtered[2];
    if (!version || !/^\d+\.\d+\.\d+$/.test(version)) usage();
    return { pkg, bump, version, dryRun };
  }
  return { pkg, bump, dryRun };
}

function inc(v: string, bump: "patch" | "minor" | "major"): string {
  const [maj, min, pat] = v.split(".").map((x) => parseInt(x, 10));
  if (bump === "patch") return `${maj}.${min}.${pat + 1}`;
  if (bump === "minor") return `${maj}.${min + 1}.0`;
  return `${maj + 1}.0.0`;
}

async function readJson(file: string): Promise<any> {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJson(file: string, data: any): Promise<void> {
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function ensureCleanTree(): Promise<void> {
  const s = await $`git status --porcelain=v1`.text();
  if (s.trim().length) {
    throw new Error(`Working tree is not clean:\n${s}`);
  }
}

async function latestTag(prefix: string): Promise<string | null> {
  const list = await $`git tag --list ${`${prefix}-v*`} --sort=version:refname`.text();
  const tags = list
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
  return tags.length ? tags[tags.length - 1] : null;
}

async function main() {
  const { pkg, bump, version, dryRun } = parseArgs(process.argv.slice(2));
  await ensureCleanTree();

  const repoRoot = path.resolve(import.meta.dir, "..");
  const corePkgPath = path.join(repoRoot, "packages/core/package.json");
  const hostPkgPath = path.join(repoRoot, "packages/native-host/package.json");
  const extPkgPath = path.join(repoRoot, "packages/extension/package.json");

  const prefix = pkg;
  const tagPrev = await latestTag(prefix);
  const prevVersion = tagPrev ? tagPrev.replace(`${prefix}-v`, "") : "0.0.0";
  const nextVersion = bump === "version" ? (version as string) : inc(prevVersion, bump);
  const tag = `${prefix}-v${nextVersion}`;

  const tagExists = (await $`git tag --list ${tag}`.text()).trim().length > 0;
  if (tagExists) {
    throw new Error(`Tag already exists: ${tag}`);
  }

  // Update the relevant package.json version.
  const filesToAdd: string[] = [];
  if (pkg === "core") {
    const json = await readJson(corePkgPath);
    json.version = nextVersion;
    if (!dryRun) await writeJson(corePkgPath, json);
    filesToAdd.push("packages/core/package.json");
  } else if (pkg === "web-browser") {
    const json = await readJson(hostPkgPath);
    json.version = nextVersion;

    // Ensure publishable dependency (no workspace protocol).
    const coreJson = await readJson(corePkgPath);
    const coreVersion = coreJson.version as string;
    if (!json.dependencies) json.dependencies = {};
    json.dependencies["@web-browser/core"] = `^${coreVersion}`;
    if (!dryRun) await writeJson(hostPkgPath, json);
    filesToAdd.push("packages/native-host/package.json");
  } else {
    const json = await readJson(extPkgPath);
    json.version = nextVersion;
    if (!dryRun) await writeJson(extPkgPath, json);
    filesToAdd.push("packages/extension/package.json");
  }

  if (dryRun) {
    console.log("dry-run: would create release");
    console.log(`  pkg:        ${pkg}`);
    console.log(`  prev tag:   ${tagPrev ?? "(none)"}`);
    console.log(`  version:    ${nextVersion}`);
    console.log(`  commit:     release(${pkg}): v${nextVersion}`);
    console.log(`  tag:        ${tag}`);
    console.log(`  stage:      ${filesToAdd.join(", ")}`);
    console.log("");
    console.log("Run without --dry-run to apply.");
    return;
  }

  // Commit (if needed) + tag.
  //
  // For the first release, it is common for the repo to already have the desired
  // package.json version (e.g. 0.1.0) without any diff. In that case, we skip
  // creating a no-op commit and just tag HEAD.
  await $`git add ${filesToAdd}`;
  const staged = (await $`git diff --cached --name-only`.text())
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (staged.length > 0) {
    await $`git commit -m ${`release(${pkg}): v${nextVersion}`}`;
  }
  await $`git tag ${tag}`;

  // Push if origin exists.
  const remotes = await $`git remote`.text();
  if (remotes.split("\n").map((r) => r.trim()).includes("origin")) {
    await $`git push origin HEAD --tags`;
  } else {
    console.log(`Created commit and tag ${tag}. No origin remote found; push manually.`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
