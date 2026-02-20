# packages/native-host

MCP server daemon + native messaging bridge.

## OVERVIEW

Streamable HTTP MCP server (port 49321) that forwards commands to Chrome via native messaging bridge. Supports two backends: Extension (socket) and CDP (WebSocket).

## STRUCTURE

```
src/
├── daemon.ts             # MCP server + BridgeBackend
├── bridge.ts            # Native messaging relay
├── native-messaging.ts  # Chrome wire protocol (4-byte length prefix)
├── installer.ts         # Chrome manifest installer
├── backends/
│   ├── types.ts         # BrowserBackend interface
│   ├── extension.ts     # ExtensionBackend (socket to daemon)
│   └── cdp.ts           # CdpBackend (direct WebSocket)
├── mcp/tools/           # 26 MCP tool definitions
└── ai/                  # AI-powered element finding
bin/
└── web-browser.js       # CLI entry point
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| MCP server | `src/daemon.ts` |
| Tool definitions | `src/mcp/tools/index.ts` |
| Native messaging | `src/native-messaging.ts`, `bridge.ts` |
| Backend implementations | `src/backends/` |
| CLI | `bin/web-browser.js` |

## COMMANDS

```bash
web-browser daemon          # Start MCP daemon (default)
web-browser bridge          # Run as native messaging bridge
web-browser install-native # Install Chrome manifest
web-browser --cdp-url URL  # CDP mode (no bridge)
```

## ENVIRONMENT

| Variable | Default |
|----------|---------|
| WEB_BROWSER_MCP_HTTP_PORT | 49321 |
| WEB_BROWSER_MCP_SOCKET | /tmp/web-browser-\<USER\> |
| ANTHROPIC_API_KEY | Required for AI `find` tool |
