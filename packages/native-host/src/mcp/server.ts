/**
 * MCP Server implementation.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { BrowserBackend } from '../backends/types.js';
import { getToolDefinitions, executeTool } from './tools/index.js';
import { HttpTransport, type HttpTransportOptions } from '../transports/http.js';
import { WebSocketTransport, type WebSocketTransportOptions } from '../transports/websocket.js';

export type TransportType = 'stdio' | 'http' | 'websocket';

export interface MCPServerOptions {
  name?: string;
  version?: string;
  backend: BrowserBackend;
  transport?: TransportType;
  httpOptions?: HttpTransportOptions;
  wsOptions?: WebSocketTransportOptions;
}

export class MCPServer {
  private server: Server;
  private backend: BrowserBackend;
  private options: MCPServerOptions;
  private transport: StdioServerTransport | null = null;
  private httpTransport: HttpTransport | null = null;
  private wsTransport: WebSocketTransport | null = null;

  constructor(options: MCPServerOptions) {
    this.backend = options.backend;
    this.options = options;

    this.server = new Server(
      {
        name: options.name || 'web-browser',
        version: options.version || '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: getToolDefinitions(),
      };
    });

    // Execute a tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const result = await executeTool(this.backend, name, args || {});

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
  }

  async start(): Promise<void> {
    // Connect the backend
    await this.backend.connect();

    const transportType = this.options.transport || 'stdio';

    switch (transportType) {
      case 'stdio':
        // Start the MCP server on stdio
        this.transport = new StdioServerTransport();
        await this.server.connect(this.transport);
        console.error('MCP server started on stdio');
        break;

      case 'http':
        // Start HTTP/SSE transport
        this.httpTransport = new HttpTransport(this.options.httpOptions);
        await this.httpTransport.connect(this.server);
        console.error(`MCP server started on HTTP port ${this.options.httpOptions?.port || 3000}`);
        break;

      case 'websocket':
        // Start WebSocket transport
        this.wsTransport = new WebSocketTransport(this.options.wsOptions);
        await this.wsTransport.connect(this.server);
        console.error(`MCP server started on WebSocket port ${this.options.wsOptions?.port || 3001}`);
        break;

      default:
        throw new Error(`Unknown transport type: ${transportType}`);
    }
  }

  async stop(): Promise<void> {
    await this.backend.disconnect();

    if (this.transport) {
      await this.server.close();
      this.transport = null;
    }

    if (this.httpTransport) {
      await this.httpTransport.close();
      this.httpTransport = null;
    }

    if (this.wsTransport) {
      await this.wsTransport.close();
      this.wsTransport = null;
    }
  }

  /**
   * Get the underlying MCP server.
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * Get the HTTP transport (if using HTTP).
   */
  getHttpTransport(): HttpTransport | null {
    return this.httpTransport;
  }

  /**
   * Get the WebSocket transport (if using WebSocket).
   */
  getWebSocketTransport(): WebSocketTransport | null {
    return this.wsTransport;
  }
}
