#!/usr/bin/env node

/**
 * web-browser CLI entry point.
 *
 * Usage:
 *   web-browser                    # Run MCP server (MCP on stdio + socket server)
 *   web-browser mcp                # Same as above, explicit
 *   web-browser bridge             # Run bridge mode (Chrome spawns this via native messaging)
 *   web-browser --backend cdp      # Direct CDP mode (no extension needed)
 */

import { runMcp } from '../dist/mcp.js';
import { runBridge } from '../dist/bridge.js';
import { MCPServer } from '../dist/mcp/server.js';
import { CdpBackend } from '../dist/backends/cdp.js';

function printHelp() {
  console.log(`
 web-browser - MCP server for browser automation

Usage:
   web-browser [command] [options]

Commands:
  mcp                 Run as MCP server (default). Listens for MCP on stdio
                      and accepts extension bridge connections on Unix socket.

  bridge              Run as native messaging bridge. Chrome spawns this process
                      via browser.runtime.connectNative(). Bridges between
                      Chrome's native messaging (stdio) and MCP server (socket).

Options:
  --backend cdp       Use direct CDP backend instead of extension.
                      Requires Chrome running with --remote-debugging-port.

  --cdp-url <url>     CDP WebSocket URL (implies --backend cdp)
                      Example: ws://localhost:9222

  --help, -h          Show this help message

Environment Variables:
  WEB_BROWSER_MCP_SOCKET  Override the Unix socket path for MCP server/bridge communication
  WEB_BROWSER_MCP_PORT    Override the TCP port for Windows (default: 49320)
  ANTHROPIC_API_KEY       Required for the 'find' tool (AI-powered element finding)

Examples:
  # Standard usage with Chrome extension
   web-browser                           # Start MCP server for Claude Desktop/Code

  # Direct CDP mode (no extension, limited functionality)
   web-browser --cdp-url ws://localhost:9222

  # For Chrome native messaging manifest (internal use)
   web-browser bridge
`);
}

async function main() {
  const args = process.argv.slice(2);

  // Check for help flag anywhere
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  // Parse command (first non-flag argument)
  let command = 'mcp'; // default
  let cdpUrl = undefined;
  let backendType = 'extension';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === 'mcp' || arg === 'bridge') {
      command = arg;
    } else if (arg === '--backend' && args[i + 1]) {
      backendType = args[i + 1];
      i++;
    } else if (arg === '--cdp-url' && args[i + 1]) {
      cdpUrl = args[i + 1];
      backendType = 'cdp';
      command = 'cdp';
      i++;
    }
  }

  // Route to appropriate handler
  switch (command) {
    case 'bridge':
      await runBridge();
      break;

    case 'cdp': {
      // Direct CDP mode - use the old MCPServer with CdpBackend
      if (!cdpUrl) {
        console.error('Error: --cdp-url is required for CDP backend');
        process.exit(1);
      }

      const backend = new CdpBackend();
      await backend.connect({ url: cdpUrl });

      const server = new MCPServer({
        backend,
        transport: 'stdio',
      });

      process.on('SIGINT', async () => {
        await server.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await server.stop();
        process.exit(0);
      });

      await server.start();
      break;
    }

    case 'mcp':
    default: {
      // Check if they accidentally passed --backend extension (which is now default mcp mode)
      if (backendType === 'cdp' && !cdpUrl) {
        console.error('Error: --cdp-url is required for CDP backend');
        process.exit(1);
      }

      await runMcp();
      break;
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
