import { defineConfig } from "wxt";
import path from "path";

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: "Web Browser MCP",
    description: "MCP server bridge for browser automation",
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
