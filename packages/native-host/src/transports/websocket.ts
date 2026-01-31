/**
 * WebSocket transport for MCP server.
 * Provides bidirectional communication over WebSocket.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

export interface WebSocketTransportOptions {
  port?: number;
  host?: string;
  path?: string;
}

interface ClientInfo {
  id: string;
  socket: WebSocket;
  isAlive: boolean;
}

export class WebSocketTransport {
  private wss: WebSocketServer | null = null;
  private mcpServer: Server | null = null;
  private options: Required<WebSocketTransportOptions>;
  private clients: Map<string, ClientInfo> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: WebSocketTransportOptions = {}) {
    this.options = {
      port: options.port || 3001,
      host: options.host || "localhost",
      path: options.path || "/",
    };
  }

  /**
   * Connect to an MCP server.
   */
  async connect(server: Server): Promise<void> {
    this.mcpServer = server;

    this.wss = new WebSocketServer({
      port: this.options.port,
      host: this.options.host,
      path: this.options.path,
    });

    this.wss.on("connection", (socket, request) => {
      this.handleConnection(socket, request);
    });

    this.wss.on("error", (error) => {
      console.error("WebSocket server error:", error);
    });

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.heartbeat();
    }, 30000);

    console.error(`WebSocket transport listening on ws://${this.options.host}:${this.options.port}${this.options.path}`);
  }

  /**
   * Close the transport.
   */
  async close(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all clients
    for (const [, client] of this.clients) {
      client.socket.close(1000, "Server shutting down");
    }
    this.clients.clear();

    if (this.wss) {
      return new Promise((resolve) => {
        this.wss!.close(() => resolve());
      });
    }
  }

  private handleConnection(socket: WebSocket, request: { url?: string }): void {
    const clientId = crypto.randomUUID();

    const client: ClientInfo = {
      id: clientId,
      socket,
      isAlive: true,
    };

    this.clients.set(clientId, client);

    // Send welcome message
    this.send(socket, {
      type: "connected",
      clientId,
      serverInfo: {
        name: "web-browser",
        version: "0.1.0",
      },
    });

    socket.on("message", (data) => {
      this.handleMessage(client, data);
    });

    socket.on("pong", () => {
      client.isAlive = true;
    });

    socket.on("close", () => {
      this.clients.delete(clientId);
    });

    socket.on("error", (error) => {
      console.error(`Client ${clientId} error:`, error);
      this.clients.delete(clientId);
    });
  }

  private async handleMessage(client: ClientInfo, data: Buffer | ArrayBuffer | Buffer[]): Promise<void> {
    try {
      const message = JSON.parse(data.toString());

      if (!this.mcpServer) {
        this.send(client.socket, {
          type: "error",
          id: message.id,
          error: "MCP server not connected",
        });
        return;
      }

      // Handle different message types
      switch (message.type) {
        case "ping":
          this.send(client.socket, { type: "pong", id: message.id });
          break;

        case "request":
          // Forward to MCP server
          // This is a simplified version - full implementation would
          // properly integrate with MCP SDK transport interface
          this.send(client.socket, {
            type: "response",
            id: message.id,
            received: true,
          });
          break;

        default:
          this.send(client.socket, {
            type: "error",
            id: message.id,
            error: `Unknown message type: ${message.type}`,
          });
      }
    } catch (err) {
      console.error("Error handling message:", err);
    }
  }

  private send(socket: WebSocket, message: unknown): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  private heartbeat(): void {
    for (const [clientId, client] of this.clients) {
      if (!client.isAlive) {
        client.socket.terminate();
        this.clients.delete(clientId);
        continue;
      }

      client.isAlive = false;
      client.socket.ping();
    }
  }

  /**
   * Send a message to a specific client.
   */
  sendToClient(clientId: string, message: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    this.send(client.socket, message);
    return true;
  }

  /**
   * Broadcast a message to all clients.
   */
  broadcast(message: unknown): void {
    const data = JSON.stringify(message);
    for (const [, client] of this.clients) {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(data);
      }
    }
  }

  /**
   * Get connected client count.
   */
  getClientCount(): number {
    return this.clients.size;
  }
}
