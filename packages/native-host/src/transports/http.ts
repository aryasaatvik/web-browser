/**
 * HTTP/SSE transport for MCP server.
 * Provides a REST API with Server-Sent Events for responses.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

export interface HttpTransportOptions {
  port?: number;
  host?: string;
  corsOrigin?: string;
}

export class HttpTransport {
  private httpServer: ReturnType<typeof createServer> | null = null;
  private mcpServer: Server | null = null;
  private options: Required<HttpTransportOptions>;
  private clients: Map<string, ServerResponse> = new Map();

  constructor(options: HttpTransportOptions = {}) {
    this.options = {
      port: options.port || 3000,
      host: options.host || "localhost",
      corsOrigin: options.corsOrigin || "*",
    };
  }

  /**
   * Connect to an MCP server.
   */
  async connect(server: Server): Promise<void> {
    this.mcpServer = server;

    this.httpServer = createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.httpServer!.on("error", reject);
      this.httpServer!.listen(this.options.port, this.options.host, () => {
        console.error(`HTTP transport listening on http://${this.options.host}:${this.options.port}`);
        resolve();
      });
    });
  }

  /**
   * Close the transport.
   */
  async close(): Promise<void> {
    // Close all SSE clients
    for (const [, res] of this.clients) {
      res.end();
    }
    this.clients.clear();

    if (this.httpServer) {
      return new Promise((resolve) => {
        this.httpServer!.close(() => resolve());
      });
    }
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", this.options.corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname === "/sse" && req.method === "GET") {
      this.handleSSE(req, res);
    } else if (url.pathname === "/message" && req.method === "POST") {
      this.handleMessage(req, res);
    } else if (url.pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  }

  private handleSSE(_req: IncomingMessage, res: ServerResponse): void {
    const clientId = crypto.randomUUID();

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: "connected", clientId })}\n\n`);

    this.clients.set(clientId, res);

    res.on("close", () => {
      this.clients.delete(clientId);
    });
  }

  private async handleMessage(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const message = JSON.parse(body);
        const clientId = req.headers["x-client-id"] as string;

        if (!this.mcpServer) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "MCP server not connected" }));
          return;
        }

        // Process the message through MCP server
        // For now, we'll implement a simple request/response pattern
        // The full MCP SDK transport integration would require more work

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ received: true, id: message.id }));

        // Broadcast response to SSE clients
        if (clientId && this.clients.has(clientId)) {
          const sseRes = this.clients.get(clientId)!;
          sseRes.write(`data: ${JSON.stringify({ type: "response", id: message.id })}\n\n`);
        }
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
  }

  /**
   * Send a message to a specific client.
   */
  sendToClient(clientId: string, message: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    client.write(`data: ${JSON.stringify(message)}\n\n`);
    return true;
  }

  /**
   * Broadcast a message to all clients.
   */
  broadcast(message: unknown): void {
    const data = `data: ${JSON.stringify(message)}\n\n`;
    for (const [, client] of this.clients) {
      client.write(data);
    }
  }
}
