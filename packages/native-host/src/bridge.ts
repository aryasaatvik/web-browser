/**
 * Bridge mode for Web Browser MCP.
 *
 * The bridge is spawned by Chrome via native messaging and acts as a connector:
 * Chrome Extension ↔ (native messaging stdio) ↔ Bridge ↔ (Unix socket) ↔ MCP Server
 *
 * The bridge simply forwards messages bidirectionally without processing them.
 * This allows the MCP server to handle MCP requests while the bridge handles the
 * native messaging protocol complexities.
 */

import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createNativeMessageReader,
  writeNativeMessage,
  EndOfStreamError,
} from './native-messaging.js';

/**
 * Get the MCP server socket address.
 */
function getMcpSocketAddress(): { type: 'unix'; path: string } | { type: 'tcp'; host: string; port: number } {
  const override = process.env.WEB_BROWSER_MCP_SOCKET;
  if (override && override.trim()) {
    return { type: 'unix', path: override };
  }

  if (process.platform === 'win32') {
    const port = process.env.WEB_BROWSER_MCP_PORT
      ? parseInt(process.env.WEB_BROWSER_MCP_PORT, 10)
      : 49320;
    return { type: 'tcp', host: '127.0.0.1', port };
  }

  const user = process.env.USER || 'default';
  return { type: 'unix', path: path.join(os.tmpdir(), `web-browser-mcp-${user}`) };
}

/**
 * Connect to the MCP server socket.
 */
async function connectToMcp(): Promise<net.Socket> {
  const addr = getMcpSocketAddress();

  return new Promise((resolve, reject) => {
    const socket = addr.type === 'unix'
      ? net.createConnection(addr.path)
      : net.createConnection(addr.port, addr.host);

    socket.once('error', (err) => {
      reject(new Error(`Failed to connect to MCP server: ${err.message}`));
    });

    socket.once('connect', () => {
      resolve(socket);
    });
  });
}

/**
 * Run the bridge process.
 *
 * This function:
 * 1. Connects to the MCP server socket
 * 2. Reads native messages from stdin (Chrome extension)
 * 3. Forwards them to the MCP server socket (newline-delimited JSON)
 * 4. Reads responses from MCP server socket
 * 5. Sends them back to Chrome via native messaging
 */
export async function runBridge(): Promise<void> {
  // Disable buffering on stdin/stdout for native messaging
  if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
  }

  let socket: net.Socket;

  try {
    socket = await connectToMcp();
  } catch (err) {
    // Send error back to extension
    writeNativeMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }

  let socketBuffer = '';

  // Handle messages from MCP server socket
  socket.on('data', (data) => {
    socketBuffer += data.toString();

    // Process newline-delimited JSON messages
    while (socketBuffer.includes('\n')) {
      const idx = socketBuffer.indexOf('\n');
      const line = socketBuffer.slice(0, idx);
      socketBuffer = socketBuffer.slice(idx + 1);

      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        // Forward to Chrome via native messaging
        writeNativeMessage(message);
      } catch {
        // Ignore parse errors
      }
    }
  });

  socket.on('close', () => {
    // MCP server disconnected, exit bridge
    process.exit(0);
  });

  socket.on('error', (err) => {
    writeNativeMessage({
      type: 'error',
      error: `MCP server socket error: ${err.message}`,
    });
    process.exit(1);
  });

  // Read native messages from Chrome and forward to MCP server
  const reader = createNativeMessageReader(process.stdin);

  try {
    for await (const message of reader) {
      // Forward to MCP server as newline-delimited JSON
      socket.write(JSON.stringify(message) + '\n');
    }
  } catch (err) {
    if (!(err instanceof EndOfStreamError)) {
      writeNativeMessage({
        type: 'error',
        error: `Native messaging error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // Chrome disconnected
  socket.destroy();
  process.exit(0);
}
