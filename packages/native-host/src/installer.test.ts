import { describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { installNative, uninstallNative, OFFICIAL_EXTENSION_ID } from "./installer.js";

async function mkTmpDir(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("native installer", () => {
  it("writes manifest with exactly one allowed_origin (default id)", async () => {
    const root = await mkTmpDir("web-browser-installer-");
    const installDir = path.join(root, "install");
    const manifestDir = path.join(root, "NativeMessagingHosts");
    const fakeBin = path.join(root, "bin.js");
    await fs.writeFile(fakeBin, "console.log('bridge')\n", "utf8");

    await installNative({
      paths: {
        installDir,
        chromeManifestDir: manifestDir,
        nodePath: "/usr/bin/node",
        bridgeBinPath: fakeBin,
      },
    });

    const manifestPath = path.join(manifestDir, "sh.arya.web_browser.json");
    const raw = await fs.readFile(manifestPath, "utf8");
    const json = JSON.parse(raw);

    expect(json.name).toBe("sh.arya.web_browser");
    expect(json.allowed_origins).toEqual([`chrome-extension://${OFFICIAL_EXTENSION_ID}/`]);

    await uninstallNative({ paths: { installDir, chromeManifestDir: manifestDir, nodePath: "/usr/bin/node", bridgeBinPath: fakeBin } });
  });

  it("supports override extension id (still single origin)", async () => {
    const root = await mkTmpDir("web-browser-installer-");
    const installDir = path.join(root, "install");
    const manifestDir = path.join(root, "NativeMessagingHosts");
    const fakeBin = path.join(root, "bin.js");
    await fs.writeFile(fakeBin, "console.log('bridge')\n", "utf8");

    const overrideId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    await installNative({
      extensionId: overrideId,
      paths: {
        installDir,
        chromeManifestDir: manifestDir,
        nodePath: "/usr/bin/node",
        bridgeBinPath: fakeBin,
      },
    });

    const manifestPath = path.join(manifestDir, "sh.arya.web_browser.json");
    const raw = await fs.readFile(manifestPath, "utf8");
    const json = JSON.parse(raw);

    expect(json.allowed_origins).toEqual([`chrome-extension://${overrideId}/`]);

    await uninstallNative({ paths: { installDir, chromeManifestDir: manifestDir, nodePath: "/usr/bin/node", bridgeBinPath: fakeBin } });
  });
});

