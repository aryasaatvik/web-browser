/**
 * Extension backend.
 * Communicates with the Chrome extension via native messaging.
 */

import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import type { BrowserBackend, ToolResult, ConnectOptions } from './types.js';

interface PendingRequest {
  resolve: (value: ToolResult) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Get the MCP server socket address.
 *
 * This backend connects to the Web Browser MCP server socket.
 * Note: In the MCP server + bridge architecture, the MCP server itself contains
 * a BridgeBackend. This ExtensionBackend class exists for cases where
 * you want to connect to an existing MCP server from another process.
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
  return { type: 'unix', path: path.join(os.tmpdir(), `web-browser-${user}`) };
}

export class ExtensionBackend implements BrowserBackend {
  readonly name = 'extension' as const;

  private socket: net.Socket | null = null;
  private buffer = '';
  private connecting: Promise<net.Socket> | null = null;
  private pending = new Map<string, PendingRequest>();
  private requestId = 0;

  async connect(_options?: ConnectOptions): Promise<void> {
    if (this.socket && !this.socket.destroyed) return;

    await this.ensureConnection();
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    // Reject all pending requests
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Disconnected'));
      this.pending.delete(id);
    }
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  async execute(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
    const socket = await this.ensureConnection();
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

      socket.write(JSON.stringify(command) + '\n');
    });
  }

  private async ensureConnection(): Promise<net.Socket> {
    if (this.socket && !this.socket.destroyed) return this.socket;
    if (this.connecting) return this.connecting;

    const addr = getMcpSocketAddress();

    this.connecting = new Promise<net.Socket>((resolve, reject) => {
      const socket = addr.type === 'unix'
        ? net.createConnection(addr.path)
        : net.createConnection(addr.port, addr.host);

      socket.once('error', reject);
      socket.once('connect', () => {
        this.socket = socket;
        this.buffer = '';

        socket.on('data', (data) => this.onData(data));
        socket.on('close', () => {
          if (this.socket === socket) {
            this.socket = null;
            this.onClose(new Error('Connection closed'));
          }
        });

        resolve(socket);
      });
    }).finally(() => {
      this.connecting = null;
    });

    return this.connecting;
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

  private onClose(err: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(err);
      this.pending.delete(id);
    }
  }
}
