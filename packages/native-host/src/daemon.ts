/**
 * Streamable HTTP MCP daemon for Web Browser.
 *
 * Target architecture:
 * - MCP clients connect over Streamable HTTP at http://127.0.0.1:<port>/mcp
 * - Each MCP session maps to a browser session (isolated tab group) via `sessionId`
 * - The daemon routes tool calls to the Chrome extension through the existing bridge:
 *   MCP daemon ↔ (Unix socket) ↔ Bridge ↔ (native messaging) ↔ Chrome extension
 *
 * Notes:
 * - Streamable HTTP transport instances are per-session (the SDK enforces this).
 * - This file intentionally avoids WebSocket as MCP does not define a WS transport.
 */

import * as http from 'node:http';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { MessageExtraInfo } from '@modelcontextprotocol/sdk/types.js';

import { getToolDefinitions, executeTool } from './mcp/tools/index.js';
import type { BrowserBackend, ToolResult } from './backends/types.js';

export interface RunDaemonOptions {
  /**
   * Port to bind Streamable HTTP on. Defaults to WEB_BROWSER_MCP_HTTP_PORT or 49321.
   */
  port?: number;
  /**
   * Host to bind Streamable HTTP on. Defaults to 127.0.0.1.
   */
  host?: string;
  /**
   * Path to serve MCP on. Defaults to /mcp.
   */
  mcpPath?: string;
  /**
   * If true, do not start the bridge socket server. Useful for CDP backend mode.
   */
  disableBridgeSocketServer?: boolean;
  /**
   * Backend to use for tool execution.
   */
  backend: BrowserBackend;
}

/**
 * Get the daemon's bridge socket path (Unix).
 */
function getBridgeSocketPath(): string {
  const override = process.env.WEB_BROWSER_MCP_SOCKET;
  if (override && override.trim()) return override;

  const user = process.env.USER || 'default';
  return path.join(os.tmpdir(), `web-browser-${user}`);
}

/**
 * Get the daemon bridge TCP port on Windows.
 */
function getBridgeWindowsPort(): number {
  const override = process.env.WEB_BROWSER_MCP_PORT;
  if (override) return parseInt(override, 10);
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
 * This is the server-side backend embedded in the daemon.
 * It accepts incoming bridge connections and routes commands to the extension.
 */
export class BridgeBackend implements BrowserBackend {
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

      if (this.connectResolve) {
        this.connectResolve();
        this.connectResolve = null;
        this.connectPromise = null;
      }
    }
  }

  async connect(): Promise<void> {
    if (this.bridge && !this.bridge.destroyed) return;

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
        // ignore
      }
    }
  }

  private handleMessage(message: unknown): void {
    if (!message || typeof message !== 'object') return;
    const msg = message as Record<string, unknown>;

    if (msg.type === 'command_response' && typeof msg.id === 'string') {
      const pending = this.pending.get(msg.id);
      if (!pending) return;

      clearTimeout(pending.timeout);
      this.pending.delete(msg.id);

      const response = msg.response as Record<string, unknown> | undefined;
      if (response?.success) {
        pending.resolve({ success: true, data: response.data });
      } else {
        pending.resolve({ success: false, error: (response?.error as string) || 'Unknown error' });
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

function headerGet(headers: unknown, name: string): string | undefined {
  // SDK uses an isomorphic Headers-like interface for extra.requestInfo.headers.
  if (!headers) return undefined;
  const h = headers as { get?: (key: string) => string | null };
  const v = h.get?.(name);
  return v ?? undefined;
}

function getSessionIdFromExtra(extra: MessageExtraInfo | undefined): string | undefined {
  const headers = extra?.requestInfo?.headers;
  return headerGet(headers, 'mcp-session-id');
}

function injectSessionId(args: Record<string, unknown> | undefined, extra: MessageExtraInfo | undefined): Record<string, unknown> {
  const sessionId = getSessionIdFromExtra(extra);
  return { ...(args || {}), sessionId };
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return undefined;
  return JSON.parse(raw);
}

function isAllowedHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return false;
  const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  return allowed.has(hostHeader);
}

type Session = {
  server: Server;
  transport: StreamableHTTPServerTransport;
  sessionId: string;
};

function createMcpServer(backend: BrowserBackend): Server {
  const server = new Server(
    { name: 'web-browser', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: getToolDefinitions() };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    const injectedArgs = injectSessionId(args || undefined, extra as MessageExtraInfo | undefined);

    try {
      const result = await executeTool(backend, name, injectedArgs);
      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2),
            },
          ],
        };
      }
      return {
        content: [{ type: 'text', text: `Error: ${result.error || 'Unknown error'}` }],
        isError: true,
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Run Streamable HTTP daemon.
 */
export async function runDaemon(options: RunDaemonOptions): Promise<void> {
  const port = options.port ?? (process.env.WEB_BROWSER_MCP_HTTP_PORT ? parseInt(process.env.WEB_BROWSER_MCP_HTTP_PORT, 10) : 49321);
  const host = options.host ?? '127.0.0.1';
  const mcpPath = options.mcpPath ?? '/mcp';

  const sessions = new Map<string, Session>();

  // Socket server for the native-messaging bridge (extension mode).
  let socketServer: net.Server | null = null;

  if (!options.disableBridgeSocketServer) {
    socketServer = net.createServer();

    if (process.platform === 'win32') {
      const p = getBridgeWindowsPort();
      socketServer.listen(p, '127.0.0.1');
      console.error(`Bridge socket server listening on 127.0.0.1:${p}`);
    } else {
      const socketPath = getBridgeSocketPath();
      try {
        fs.unlinkSync(socketPath);
      } catch {
        // ignore
      }
      socketServer.listen(socketPath);
      console.error(`Bridge socket server listening on ${socketPath}`);
    }

    // If using the BridgeBackend, we need to bind connections into it.
    // (If backend isn't BridgeBackend, connecting the bridge is meaningless.)
    const backend = options.backend;
    if (backend instanceof BridgeBackend) {
      socketServer.on('connection', (socket) => {
        console.error('Bridge connected');
        backend.setBridge(socket);

        socket.on('close', () => {
          console.error('Bridge disconnected');
          if (backend.isConnected()) backend.setBridge(null);
        });
      });
    }

    socketServer.on('error', (err) => {
      console.error(`Bridge socket server error: ${err.message}`);
    });
  }

  const httpServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || host}`);

      if (url.pathname !== mcpPath) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      // Host allowlist (DNS rebinding mitigation).
      if (!isAllowedHost(req.headers.host, port)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Invalid Host header: ${req.headers.host || ''}` }));
        return;
      }

      const sessionIdHeader = typeof req.headers['mcp-session-id'] === 'string' ? req.headers['mcp-session-id'] : undefined;
      const parsedBody = req.method === 'POST' ? await readJsonBody(req) : undefined;

      // Route to session transport.
      if (sessionIdHeader) {
        const session = sessions.get(sessionIdHeader);
        if (!session) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unknown session' }));
          return;
        }
        await session.transport.handleRequest(req as any, res as any, parsedBody);
        return;
      }

      // No session header: only valid for initialization POST. We'll allow the transport to enforce.
      const backend = options.backend;
      const server = createMcpServer(backend);

      let newSessionId: string | undefined;
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: async (sid) => {
          newSessionId = sid;
        },
        onsessionclosed: async (sid) => {
          const sess = sessions.get(sid);
          sessions.delete(sid);
          if (sess) {
            await sess.transport.close().catch(() => {});
            await sess.server.close().catch(() => {});
          }
        },
      });

      await server.connect(transport as any);
      await transport.handleRequest(req as any, res as any, parsedBody);

      if (newSessionId) {
        sessions.set(newSessionId, { server, transport, sessionId: newSessionId });
      } else {
        // Failed initialization; clean up.
        await transport.close().catch(() => {});
        await server.close().catch(() => {});
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => resolve());
  });

  console.error(`MCP Streamable HTTP daemon listening on http://${host}:${port}${mcpPath}`);

  const cleanup = async (): Promise<void> => {
    console.error('Daemon shutting down...');

    httpServer.close();
    if (socketServer) {
      socketServer.close();
      if (process.platform !== 'win32') {
        try {
          fs.unlinkSync(getBridgeSocketPath());
        } catch {
          // ignore
        }
      }
    }

    for (const sess of sessions.values()) {
      await sess.transport.close().catch(() => {});
      await sess.server.close().catch(() => {});
    }

    await options.backend.disconnect().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', () => void cleanup());
  process.on('SIGTERM', () => void cleanup());
}

// Export a small surface for unit tests without making these helpers part of the public package API.
export const __test__ = {
  isAllowedHost,
  getSessionIdFromExtra,
  injectSessionId,
};
