/**
 * Native messaging installer for macOS + Google Chrome.
 *
 * This is shipped in the `web-browser` npm package so users can install without
 * cloning the repo.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HOST_NAME = "sh.arya.web_browser";
const MANIFEST_FILENAME = `${HOST_NAME}.json`;

// Deterministic (pinned) extension ID. This must match the `packages/extension`
// manifest key. Changing it will break existing installs.
export const OFFICIAL_EXTENSION_ID = "albcpcahedbojeaacnmihmkbljhndglk";

export type InstallerPaths = {
  installDir: string;
  chromeManifestDir: string;
  nodePath: string;
  bridgeBinPath: string;
};

function defaultPaths(): InstallerPaths {
  const home = os.homedir();
  const installDir = path.join(home, ".web-browser");
  const chromeManifestDir = path.join(
    home,
    "Library/Application Support/Google/Chrome/NativeMessagingHosts",
  );

  // From dist/installer.js -> ../bin/web-browser.js
  const bridgeBinPath = fileURLToPath(new URL("../bin/web-browser.js", import.meta.url));

  return {
    installDir,
    chromeManifestDir,
    nodePath: process.execPath,
    bridgeBinPath,
  };
}

function validateExtensionId(id: string): void {
  // Chrome extension ids are 32 chars in [a-p]
  if (!/^[a-p]{32}$/.test(id)) {
    throw new Error(`Invalid extension id "${id}". Expected 32 chars [a-p].`);
  }
}

function wrapperScript(nodePath: string, bridgeBinPath: string): string {
  // Chrome native messaging runs with a restricted PATH; use an absolute node path.
  return `#!/bin/bash
set -euo pipefail

exec "${nodePath}" "${bridgeBinPath}" bridge
`;
}

function manifestJson(wrapperPath: string, extensionId: string): string {
  return JSON.stringify(
    {
      name: HOST_NAME,
      description: "Web Browser MCP Native Messaging Bridge - connects Chrome extension to MCP daemon",
      path: wrapperPath,
      type: "stdio",
      allowed_origins: [`chrome-extension://${extensionId}/`],
    },
    null,
    2,
  ) + "\n";
}

export async function installNative(options?: { extensionId?: string; paths?: Partial<InstallerPaths> }): Promise<void> {
  const extensionId = options?.extensionId ?? OFFICIAL_EXTENSION_ID;
  validateExtensionId(extensionId);

  const base = defaultPaths();
  const pathsResolved: InstallerPaths = {
    installDir: options?.paths?.installDir ?? base.installDir,
    chromeManifestDir: options?.paths?.chromeManifestDir ?? base.chromeManifestDir,
    nodePath: options?.paths?.nodePath ?? base.nodePath,
    bridgeBinPath: options?.paths?.bridgeBinPath ?? base.bridgeBinPath,
  };

  const wrapperPath = path.join(pathsResolved.installDir, "web-browser-bridge");
  const manifestPath = path.join(pathsResolved.chromeManifestDir, MANIFEST_FILENAME);

  await fs.mkdir(pathsResolved.installDir, { recursive: true });
  await fs.mkdir(pathsResolved.chromeManifestDir, { recursive: true });

  await fs.writeFile(wrapperPath, wrapperScript(pathsResolved.nodePath, pathsResolved.bridgeBinPath), "utf8");
  await fs.chmod(wrapperPath, 0o755);

  await fs.writeFile(manifestPath, manifestJson(wrapperPath, extensionId), "utf8");

  // User-facing info (CLI prints this).
}

export async function uninstallNative(options?: { paths?: Partial<InstallerPaths> }): Promise<void> {
  const base = defaultPaths();
  const pathsResolved: InstallerPaths = {
    installDir: options?.paths?.installDir ?? base.installDir,
    chromeManifestDir: options?.paths?.chromeManifestDir ?? base.chromeManifestDir,
    nodePath: options?.paths?.nodePath ?? base.nodePath,
    bridgeBinPath: options?.paths?.bridgeBinPath ?? base.bridgeBinPath,
  };

  const wrapperPath = path.join(pathsResolved.installDir, "web-browser-bridge");
  const manifestPath = path.join(pathsResolved.chromeManifestDir, MANIFEST_FILENAME);

  await fs.rm(manifestPath, { force: true });
  await fs.rm(wrapperPath, { force: true });

  // Best-effort cleanup of the install dir if empty.
  try {
    const entries = await fs.readdir(pathsResolved.installDir);
    if (entries.length === 0) {
      await fs.rmdir(pathsResolved.installDir);
    }
  } catch {
    // ignore
  }
}

export const __test__ = {
  validateExtensionId,
  manifestJson,
  wrapperScript,
};

