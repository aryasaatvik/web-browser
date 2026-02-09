#!/usr/bin/env node

/**
 * web-browser CLI entry point.
 *
 * Usage:
 *   web-browser                    # Run MCP daemon (Streamable HTTP + socket server)
 *   web-browser daemon             # Same as above, explicit
 *   web-browser bridge             # Run bridge mode (Chrome spawns this via native messaging)
 *   web-browser --backend cdp      # Direct CDP mode (no extension needed)
 */

import { runDaemon, BridgeBackend } from '../dist/daemon.js';
import { runBridge } from '../dist/bridge.js';
import { CdpBackend } from '../dist/backends/cdp.js';

function printHelp() {
  console.log(`
 web-browser - MCP server for browser automation

Usage:
   web-browser [command] [options]

Commands:
  daemon              Run as MCP daemon (default). Listens for MCP over
                      Streamable HTTP on 127.0.0.1 and accepts extension bridge
                      connections on a Unix socket.

  bridge              Run as native messaging bridge. Chrome spawns this process
                      via browser.runtime.connectNative(). Bridges between
                      Chrome's native messaging (stdio) and the daemon socket.

Options:
  --backend cdp       Use direct CDP backend instead of extension.
                      Requires Chrome running with --remote-debugging-port.

  --cdp-url <url>     CDP URL (implies --backend cdp). Accepts either:
                      - A full CDP websocket URL: ws://127.0.0.1:9222/devtools/browser/<id>
                      - A remote-debugging origin: http://127.0.0.1:9222

  --help, -h          Show this help message

Environment Variables:
  WEB_BROWSER_MCP_HTTP_PORT  Override the Streamable HTTP daemon port (default: 49321)
  WEB_BROWSER_MCP_SOCKET     Override the Unix socket path for daemon/bridge communication
  WEB_BROWSER_MCP_PORT    Override the TCP port for Windows (default: 49320)
  ANTHROPIC_API_KEY       Required for the 'find' tool (AI-powered element finding)

Examples:
  # Standard usage with Chrome extension + Streamable HTTP clients
   web-browser                           # Start MCP daemon on http://127.0.0.1:49321/mcp

  # Direct CDP mode (no extension, limited functionality)
   web-browser --cdp-url http://127.0.0.1:9222

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
  let command = 'daemon'; // default
  let cdpUrl = undefined;
  let backendType = 'extension';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === 'daemon' || arg === 'bridge' || arg === 'mcp') {
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
      // Direct CDP mode - run daemon with CdpBackend
      if (!cdpUrl) {
        console.error('Error: --cdp-url is required for CDP backend');
        process.exit(1);
      }

      const backend = new CdpBackend();
      await backend.connect({ url: cdpUrl });

      await runDaemon({
        backend,
        disableBridgeSocketServer: true,
      });
      break;
    }

    case 'mcp':
    case 'daemon':
    default: {
      // Daemon mode (extension backend)
      if (backendType === 'cdp' && !cdpUrl) {
        console.error('Error: --cdp-url is required for CDP backend');
        process.exit(1);
      }

      if (backendType === 'cdp') {
        const backend = new CdpBackend();
        await backend.connect({ url: cdpUrl });
        await runDaemon({ backend, disableBridgeSocketServer: true });
        return;
      }

      const backend = new BridgeBackend();
      await runDaemon({ backend });
      break;
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
