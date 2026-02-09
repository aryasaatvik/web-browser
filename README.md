# web-browser

MCP (Model Context Protocol) server for browser automation via Chrome extension.

**Official extension ID (deterministic):** `albcpcahedbojeaacnmihmkbljhndglk`

## Features

- **Dual Backend Support**: Control existing Chrome browsers via extension, or headless browsers via CDP
- **Native Messaging**: Secure communication between MCP server and Chrome extension
- **Rich Automation**: Navigate, click, type, scroll, screenshot, and more
- **AI-Powered Find**: Natural language element search using Claude
- **MCP Streamable HTTP Daemon**: Multi-client sessions over Streamable HTTP on localhost
- **Recording & GIF**: Capture browser sessions as video or GIF

## Architecture

### MCP Daemon + Bridge Pattern

The default architecture runs a long-lived local daemon that speaks MCP over **Streamable HTTP**.
Chrome connects via native-messaging to a bridge process which forwards commands over a local socket.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MCP Daemon (`web-browser daemon`)                      │
│                                                                             │
│  MCP Client ──HTTP──►  ┌─────────────────────────────┐                      │
│                       │         Tool Execution      │                       │
│                       └───────────┬─────────────────┘                       │
│                                   │                                         │
│                       ┌───────────┴───────────┐                             │
│                       ▼                       ▼                             │
│               ┌──────────────┐       ┌──────────────┐                       │
│               │  CdpBackend  │       │ BridgeBackend│                       │
│               │ --backend=cdp│       │  (default)   │                       │
│               └──────┬───────┘       └──────┬───────┘                       │
└──────────────────────┼──────────────────────┼───────────────────────────────┘
                       │                      │
                       ▼                      ▼
                 Chrome (CDP)            Bridge ◄──native msg──► Extension
                 (WebSocket)       (`web-browser bridge`, spawned by Chrome)
```

**Flow:**
1. MCP Client connects to the daemon via Streamable HTTP (`http://127.0.0.1:<port>/mcp`)
2. Daemon accepts bridge connections on a local socket (`/tmp/web-browser-$USER` by default)
3. Bridge (spawned by Chrome) connects native messaging to MCP Server
4. Commands flow: MCP → daemon → bridge socket → bridge → Chrome Extension → Browser

### Alternative: Direct CDP (No Extension)

For headless browsers or simpler use cases:

```
MCP Client → web-browser --cdp-url → Chrome (--remote-debugging-port)
```

## Installation

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- Chrome or Chromium-based browser
- Node.js >= 18 (for running the native host)

### Build

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Build specific packages
bun run build:core
bun run build:native-host
bun run build:extension
```

### Install Native Messaging Bridge

```bash
# If installed from npm:
#   npm i -g web-browser
#   web-browser install-native
#
# If working from this repo:
bun run install:native

# Uninstall
bun run uninstall:native
```

### Load Extension

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `packages/extension/.output/chrome-mv3`

## Usage

### CLI

```bash
# Run as MCP daemon (default) - connects to Chrome extension via bridge
web-browser

# Explicit daemon mode (alias: `mcp`)
web-browser daemon

# Run as bridge (Chrome spawns this via native messaging)
web-browser bridge

# Direct CDP mode (no extension needed, for headless browsers)
# Pass either a full CDP websocket URL (ws://.../devtools/browser/<id>)
# or a remote-debugging origin (http://localhost:9222).
web-browser --cdp-url http://localhost:9222
```

### MCP Client Configuration

This project exposes MCP over Streamable HTTP at `http://127.0.0.1:49321/mcp` by default.
Use an MCP client that supports Streamable HTTP and point it at that URL.

### Manual Testing

See `docs/daemon-manual-testing.md`.

### MCP Tools

| Tool | Description |
|------|-------------|
| `navigate` | Navigate to a URL |
| `computer` | Mouse/keyboard actions, screenshots |
| `read_page` | Get accessibility tree with element refs |
| `get_page_text` | Get plain text content |
| `find` | AI-powered natural language element search |
| `form_input` | Set form field values |
| `javascript` | Execute JavaScript |
| `tabs_list` | List managed tabs |
| `tabs_create` | Create new tab |
| `tabs_close` | Close tab |
| `cookies_get/set` | Manage cookies |
| `storage_get/set` | Manage localStorage/sessionStorage |
| `recording_start/stop` | Record browser session |
| `gif_export` | Export as GIF |

### Example Usage

```typescript
// Using MCP client
const result = await client.callTool("navigate", {
  url: "https://example.com"
});

// Read page accessibility tree
const page = await client.callTool("read_page", {});

// Find element using natural language
const element = await client.callTool("find", {
  query: "the login button"
});

// Click the found element
await client.callTool("computer", {
  action: "click",
  ref: element.refs[0]
});
```

## Development

```bash
# Watch mode for extension
bun run dev:extension

# Type checking
bun run typecheck

# Build specific package
bun run build:core
bun run build:native-host
bun run build:extension
```

## Packages

- **@web-browser/core**: Shared browser automation logic (selectors, DOM utils, a11y)
- **web-browser**: MCP server and native messaging bridge
- **@web-browser/extension**: Chrome extension (WXT)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key for AI-powered find tool |
| `WEB_BROWSER_MCP_HTTP_PORT` | Override Streamable HTTP daemon port (default: 49321) |
| `WEB_BROWSER_MCP_SOCKET` | Override Unix socket path for MCP server/bridge communication |
| `WEB_BROWSER_MCP_PORT` | Override TCP port for Windows (default: 49320) |

## License

MIT
