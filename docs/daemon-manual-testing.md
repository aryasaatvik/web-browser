# Streamable HTTP Daemon Manual Testing

This project runs as a long-lived local MCP daemon over **Streamable HTTP**:

- MCP clients connect to `http://127.0.0.1:<port>/mcp`
- the Chrome extension is reached via the native-messaging bridge:
  daemon ↔ unix socket (`/tmp/web-browser-$USER`) ↔ bridge ↔ native messaging ↔ extension service worker
- multiple MCP sessions should be isolated via per-session Chrome tab groups

## Build

```bash
cd /Users/aryasaatvik/Developer/browser-mcp

bun install
bun run build:native-host
bun run build:extension
```

## Install Native Host

Chrome requires a concrete extension ID in `allowed_origins` (no wildcards).

1. Load the unpacked extension once (see next section)
2. Copy the extension ID from `chrome://extensions` (Developer mode)
3. Install native host:

```bash
cd /Users/aryasaatvik/Developer/browser-mcp
bun run install:native -- --extension-id <your-extension-id>
```

## Load Extension (Unpacked)

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select: `packages/extension/.output/chrome-mv3`

## Start The Daemon

Default:

```bash
web-browser
```

Custom port:

```bash
WEB_BROWSER_MCP_HTTP_PORT=49321 web-browser
```

Expected stderr log includes:

- `MCP Streamable HTTP daemon listening on http://127.0.0.1:49321/mcp`

## Connect With A Streamable HTTP MCP Client

Any MCP client that supports **Streamable HTTP** should work.

### SDK example (Node/Bun)

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "smoke", version: "0.0.0" }, { capabilities: {} });
const transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1:49321/mcp"));

await client.connect(transport);
console.log("sessionId =", transport.sessionId);

await client.callTool({ name: "navigate", arguments: { url: "https://example.com" } });
```

## Smoke Flows (Per-Session Isolation)

Goal: two independent MCP sessions should produce two separate Chrome tab groups and should not interfere.

1. Start **client A** and connect.
2. Start **client B** and connect.
3. In Chrome, confirm you now have:
   - `Browser MCP (<short session id>)` group for A
   - `Browser MCP (<short session id>)` group for B

Then, in each client:

1. `navigate` to a different site in each session.
2. `read_page` in each session.
3. `computer`:
   - click/type/scroll within each session
   - take a screenshot to confirm correct tab is active
4. `get_page_text` and confirm contents match the correct site/session.

Pass condition: tab operations from session A never change session B’s active tab (and vice versa).

