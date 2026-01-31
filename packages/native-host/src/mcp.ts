/**
 * MCP server for Web Browser.
 *
 * The MCP server is the long-running process that:
 * 1. Runs an MCP server on stdio (for Claude Desktop/Claude Code)
 * 2. Accepts bridge connections on a Unix socket
 * 3. Routes MCP tool calls to the extension via the bridge
 *
 * Architecture:
 * MCP Client ↔ (MCP stdio) ↔ MCP Server ↔ (Unix socket) ↔ Bridge ↔ (native messaging) ↔ Chrome Extension
 */

import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getToolDefinitions, executeTool } from './mcp/tools/index.js';
import type { BrowserBackend, ToolResult } from './backends/types.js';

/**
 * Get the MCP server socket path.
 */
function getMcpSocketPath(): string {
  const override = process.env.WEB_BROWSER_MCP_SOCKET;
  if (override && override.trim()) {
    return override;
  }

  const user = process.env.USER || 'default';
  return path.join(os.tmpdir(), `web-browser-${user}`);
}

/**
 * Get the MCP server port for Windows.
 */
function getMcpWindowsPort(): number {
  const override = process.env.WEB_BROWSER_MCP_PORT;
  if (override) {
    return parseInt(override, 10);
  }
  return 49320;
}

interface PendingRequest {
  resolve: (value: ToolResult) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Bridge backend that routes through the bridge connection.
 *
 * This is the server-side backend embedded in the MCP server.
 * It accepts incoming bridge connections and routes commands to the extension.
 */
class BridgeBackend implements BrowserBackend {
  readonly name = 'extension' as const;

  private bridge: net.Socket | null = null;
  private buffer = '';
  private pending = new Map<string, PendingRequest>();
  private requestId = 0;
  private connectPromise: Promise<void> | null = null;
  private connectResolve: (() => void) | null = null;

  setBridge(socket: net.Socket | null): void {
    if (this.bridge) {
      this.bridge.removeAllListeners();
      this.bridge.destroy();
    }

    this.bridge = socket;
    this.buffer = '';

    if (socket) {
      socket.on('data', (data) => this.onData(data));
      socket.on('close', () => this.onClose());
      socket.on('error', () => this.onClose());

      // Resolve any pending connect promise
      if (this.connectResolve) {
        this.connectResolve();
        this.connectResolve = null;
        this.connectPromise = null;
      }
    }
  }

  async connect(): Promise<void> {
    if (this.bridge && !this.bridge.destroyed) {
      return;
    }

    // Wait for a bridge to connect
    if (!this.connectPromise) {
      this.connectPromise = new Promise((resolve) => {
        this.connectResolve = resolve;
      });
    }

    return this.connectPromise;
  }

  async disconnect(): Promise<void> {
    if (this.bridge) {
      this.bridge.destroy();
      this.bridge = null;
    }

    // Reject all pending requests
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Disconnected'));
      this.pending.delete(id);
    }
  }

  isConnected(): boolean {
    return this.bridge !== null && !this.bridge.destroyed;
  }

  async execute(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.bridge || this.bridge.destroyed) {
      return { success: false, error: 'Extension not connected. Make sure the Chrome extension is running.' };
    }

    const id = `req_${++this.requestId}`;

    return new Promise<ToolResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        resolve({ success: false, error: 'Request timeout' });
      }, 30000);

      this.pending.set(id, { resolve, reject, timeout });

      const command = {
        type: 'command_request',
        id,
        command: {
          id,
          action: tool,
          ...args,
        },
      };

      this.bridge!.write(JSON.stringify(command) + '\n');
    });
  }

  private onData(data: Buffer): void {
    this.buffer += data.toString();

    while (this.buffer.includes('\n')) {
      const idx = this.buffer.indexOf('\n');
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);

      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        this.handleMessage(message);
      } catch {
        // Ignore parse errors
      }
    }
  }

  private handleMessage(message: unknown): void {
    if (!message || typeof message !== 'object') return;

    const msg = message as Record<string, unknown>;

    // Handle command response
    if (msg.type === 'command_response' && typeof msg.id === 'string') {
      const pending = this.pending.get(msg.id);
      if (!pending) return;

      clearTimeout(pending.timeout);
      this.pending.delete(msg.id);

      const response = msg.response as Record<string, unknown> | undefined;
      if (response?.success) {
        pending.resolve({ success: true, data: response.data });
      } else {
        pending.resolve({
          success: false,
          error: (response?.error as string) || 'Unknown error',
        });
      }
    }
  }

  private onClose(): void {
    this.bridge = null;

    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
      this.pending.delete(id);
    }
  }
}

/**
 * Run the MCP server process.
 */
export async function runMcp(): Promise<void> {
  const backend = new BridgeBackend();

  // Create MCP server
  const server = new Server(
    {
      name: 'web-browser',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Set up MCP handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: getToolDefinitions(),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await executeTool(backend, name, args || {});

      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: typeof result.data === 'string'
                ? result.data
                : JSON.stringify(result.data, null, 2),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${result.error || 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Create socket server for bridge connections
  let socketServer: net.Server;

  if (process.platform === 'win32') {
    // Windows: use TCP
    const port = getMcpWindowsPort();
    socketServer = net.createServer();
    socketServer.listen(port, '127.0.0.1');
    console.error(`MCP server listening for bridge connections on port ${port}`);
  } else {
    // Unix: use Unix socket
    const socketPath = getMcpSocketPath();

    // Remove existing socket file if it exists
    try {
      fs.unlinkSync(socketPath);
    } catch {
      // Ignore if doesn't exist
    }

    socketServer = net.createServer();
    socketServer.listen(socketPath);
    console.error(`MCP server listening for bridge connections on ${socketPath}`);
  }

  // Handle bridge connections
  socketServer.on('connection', (socket) => {
    console.error('Bridge connected');
    backend.setBridge(socket);

    socket.on('close', () => {
      console.error('Bridge disconnected');
      if (backend.isConnected()) {
        backend.setBridge(null);
      }
    });
  });

  socketServer.on('error', (err) => {
    console.error(`Socket server error: ${err.message}`);
  });

  // Handle shutdown
  const cleanup = (): void => {
    console.error('MCP server shutting down...');
    socketServer.close();

    if (process.platform !== 'win32') {
      try {
        fs.unlinkSync(getMcpSocketPath());
      } catch {
        // Ignore
      }
    }

    backend.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Start MCP server on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP server started on stdio');
}
