#!/usr/bin/env bun

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Chrome extension ids are derived from the public key:
// 1) sha256(publicKeyDer)
// 2) take first 16 bytes
// 3) map each nibble to [a-p]
const NIBBLE_ALPHABET = "abcdefghijklmnop";

function toExtensionId(publicKeyDer: Buffer): string {
  const digest = crypto.createHash("sha256").update(publicKeyDer).digest();
  const first16 = digest.subarray(0, 16);
  let out = "";
  for (const byte of first16) {
    out += NIBBLE_ALPHABET[(byte >> 4) & 0xf];
    out += NIBBLE_ALPHABET[byte & 0xf];
  }
  return out;
}

function main(): void {
  const repoRoot = path.resolve(import.meta.dir, "..");
  const keyPath = path.join(repoRoot, "packages/extension/manifest-key.txt");
  const b64 = fs.readFileSync(keyPath, "utf8").trim();
  const der = Buffer.from(b64, "base64");
  const id = toExtensionId(der);
  console.log(id);
}

main();

