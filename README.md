# web-browser-mcp

MCP (Model Context Protocol) server for browser automation via Chrome extension.

## Features

- **Dual Backend Support**: Control existing Chrome browsers via extension, or headless browsers via CDP
- **Native Messaging**: Secure communication between MCP server and Chrome extension
- **Rich Automation**: Navigate, click, type, scroll, screenshot, and more
- **AI-Powered Find**: Natural language element search using Claude
- **Multiple Transports**: stdio, HTTP/SSE, and WebSocket support
- **Recording & GIF**: Capture browser sessions as video or GIF

## Architecture

### MCP Server + Bridge Pattern

The default architecture uses an MCP server + bridge pattern for robust communication:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MCP Server (`web-browser-mcp mcp`)                    │
│                                                                             │
│    Claude ──stdio──►  ┌─────────────────────────────┐                       │
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
                 (WebSocket)       (`web-browser-mcp bridge`)
```

**Flow:**
1. MCP Client (Claude Desktop/Code) connects to MCP Server via stdio
2. MCP Server accepts bridge connections on Unix socket
3. Bridge (spawned by Chrome) connects native messaging to MCP Server
4. Commands flow: MCP → Bridge → Chrome Extension → Browser

### Alternative: Direct CDP (No Extension)

For headless browsers or simpler use cases:

```
MCP Client → web-browser-mcp --cdp-url → Chrome (--remote-debugging-port)
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
# Install native messaging bridge (macOS/Linux)
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
# Run as MCP server (default) - connects to Chrome extension via bridge
web-browser-mcp

# Explicit MCP server mode
web-browser-mcp mcp

# Run as bridge (Chrome spawns this via native messaging)
web-browser-mcp bridge

# Direct CDP mode (no extension needed, for headless browsers)
web-browser-mcp --cdp-url ws://localhost:9222
```

### Claude Desktop Configuration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "web-browser": {
      "command": "web-browser-mcp"
    }
  }
}
```

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
- **@web-browser/native-host**: MCP server and native messaging bridge
- **@web-browser/extension**: Chrome extension (WXT)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key for AI-powered find tool |
| `WEB_BROWSER_MCP_SOCKET` | Override Unix socket path for MCP server/bridge communication |
| `WEB_BROWSER_MCP_PORT` | Override TCP port for Windows (default: 49320) |

## License

MIT
