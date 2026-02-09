import { defineConfig } from "wxt";
import path from "path";
import fs from "fs";

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: "Web Browser MCP",
    description: "MCP server bridge for browser automation",
    // Pin a stable extension id across machines/builds.
    // Chrome derives the unpacked extension ID from this public key material.
    key: fs.readFileSync(path.join(__dirname, "manifest-key.txt"), "utf8").trim(),
    permissions: [
      "activeTab",
      "cookies",
      "debugger",
      "nativeMessaging",
      "offscreen",
      "scripting",
      "storage",
      "tabs",
      "tabGroups",
    ],
    host_permissions: ["<all_urls>"],
  },
  vite: () => ({
    resolve: {
      alias: {
        "@web-browser/core": path.resolve(__dirname, "../core/src/index.ts"),
      },
    },
  }),
});
