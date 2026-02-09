#!/usr/bin/env bun

import { $ } from "bun";

function usage(): never {
  console.error("Usage: bun script/release-notes.ts --tag <tag>");
  process.exit(2);
}

function parseArgs(argv: string[]): { tag: string } {
  const tagIdx = argv.indexOf("--tag");
  if (tagIdx === -1 || !argv[tagIdx + 1]) usage();
  return { tag: argv[tagIdx + 1] };
}

async function findPreviousTag(prefix: string, current: string): Promise<string | null> {
  // Sort tags by semver part. We assume tags are `${prefix}-vX.Y.Z`.
  const list = await $`git tag --list ${`${prefix}-v*`} --sort=version:refname`.text();
  const tags = list
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  const idx = tags.indexOf(current);
  if (idx <= 0) return null;
  return tags[idx - 1] ?? null;
}

async function main() {
  const { tag } = parseArgs(process.argv.slice(2));
  const m = tag.match(/^(core|web-browser|extension)-v\d+\.\d+\.\d+$/);
  if (!m) {
    console.error(`Unsupported tag format: ${tag}`);
    process.exit(2);
  }
  const prefix = m[1];

  const prev = await findPreviousTag(prefix, tag);
  const range = prev ? `${prev}..${tag}` : tag;

  const log = await $`git log ${range} --pretty=format:%s (%h)`.text();
  const lines = log
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `- ${l}`)
    .join("\n");

  const header = `# ${tag}\n\n`;
  const intro = prev ? `Changes since ${prev}:\n\n` : `Changes:\n\n`;
  const body = lines || "- No notable changes\n";

  process.stdout.write(header + intro + body + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

