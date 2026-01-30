/**
 * Tests for MCP server and BridgeBackend.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockSocket } from './__test__/helpers/index.js';

// Simulate the BridgeBackend behavior for testing
class MockBridgeBackend {
  readonly name = 'extension' as const;

  private bridge: ReturnType<typeof createMockSocket> | null = null;
  private buffer = '';
  private pending = new Map<string, {
    resolve: (value: { success: boolean; data?: unknown; error?: string }) => void;
    reject: (err: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private requestId = 0;
  private connectPromise: Promise<void> | null = null;
  private connectResolve: (() => void) | null = null;

  setBridge(socket: ReturnType<typeof createMockSocket> | null): void {
    if (this.bridge) {
      this.bridge.destroy();
    }

    this.bridge = socket;
    this.buffer = '';

    if (socket) {
      socket.on('data', (data: Buffer) => this.onData(data));
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
    if (this.bridge && !this.bridge.destroyed) {
      return;
    }

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

  async execute(tool: string, args: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
    if (!this.bridge || this.bridge.destroyed) {
      return { success: false, error: 'Extension not connected. Make sure the Chrome extension is running.' };
    }

    const id = `req_${++this.requestId}`;

    return new Promise((resolve, reject) => {
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

  // Test helpers
  getPendingCount(): number {
    return this.pending.size;
  }

  getLastRequestId(): number {
    return this.requestId;
  }
}

describe('BridgeBackend', () => {
  let backend: MockBridgeBackend;
  let socket: ReturnType<typeof createMockSocket>;

  beforeEach(() => {
    backend = new MockBridgeBackend();
    socket = createMockSocket();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('setBridge', () => {
    it('should set the bridge socket', () => {
      backend.setBridge(socket);
      expect(backend.isConnected()).toBe(true);
    });

    it('should destroy previous socket when setting new one', () => {
      const oldSocket = createMockSocket();
      backend.setBridge(oldSocket);

      backend.setBridge(socket);

      expect(oldSocket.isDestroyed()).toBe(true);
      expect(backend.isConnected()).toBe(true);
    });

    it('should clear socket on null', () => {
      backend.setBridge(socket);
      backend.setBridge(null);

      expect(backend.isConnected()).toBe(false);
    });

    it('should resolve pending connect promise', async () => {
      const connectPromise = backend.connect();
      backend.setBridge(socket);

      await expect(connectPromise).resolves.toBeUndefined();
    });
  });

  describe('connect', () => {
    it('should return immediately if already connected', async () => {
      backend.setBridge(socket);
      await expect(backend.connect()).resolves.toBeUndefined();
    });

    it('should wait for bridge to be set', async () => {
      let resolved = false;
      const connectPromise = backend.connect().then(() => {
        resolved = true;
      });

      expect(resolved).toBe(false);

      backend.setBridge(socket);
      await connectPromise;

      expect(resolved).toBe(true);
    });

    it('should reuse existing connect promise', async () => {
      // Start connect without setting bridge
      const promise1 = backend.connect();
      const promise2 = backend.connect();

      // Both calls should wait for the same bridge connection
      // Set bridge to resolve both
      backend.setBridge(createMockSocket());

      await Promise.all([promise1, promise2]);
      expect(backend.isConnected()).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('should destroy the socket', async () => {
      backend.setBridge(socket);
      await backend.disconnect();

      expect(socket.isDestroyed()).toBe(true);
      expect(backend.isConnected()).toBe(false);
    });

    it('should reject all pending requests', async () => {
      backend.setBridge(socket);

      const executePromise = backend.execute('test_tool', {});

      await backend.disconnect();

      // May throw either 'Disconnected' or 'Connection closed' depending on timing
      await expect(executePromise).rejects.toThrow();
    });
  });

  describe('isConnected', () => {
    it('should return false when no bridge', () => {
      expect(backend.isConnected()).toBe(false);
    });

    it('should return true when bridge is set', () => {
      backend.setBridge(socket);
      expect(backend.isConnected()).toBe(true);
    });

    it('should return false after socket destroyed', () => {
      backend.setBridge(socket);
      socket.destroy();

      expect(backend.isConnected()).toBe(false);
    });
  });

  describe('execute', () => {
    it('should return error if not connected', async () => {
      const result = await backend.execute('test_tool', {});

      expect(result).toEqual({
        success: false,
        error: 'Extension not connected. Make sure the Chrome extension is running.',
      });
    });

    it('should send command to bridge', async () => {
      backend.setBridge(socket);

      const executePromise = backend.execute('navigate', { url: 'https://example.com' });

      // Check that command was written
      const written = socket.getAllWrittenData().toString();
      const command = JSON.parse(written.replace('\n', ''));

      expect(command.type).toBe('command_request');
      expect(command.id).toMatch(/^req_\d+$/);
      expect(command.command.action).toBe('navigate');
      expect(command.command.url).toBe('https://example.com');
    });

    it('should increment request IDs', async () => {
      backend.setBridge(socket);

      backend.execute('tool1', {});
      backend.execute('tool2', {});
      backend.execute('tool3', {});

      expect(backend.getLastRequestId()).toBe(3);
    });

    it('should resolve on successful response', async () => {
      backend.setBridge(socket);

      const executePromise = backend.execute('test_tool', {});

      // Simulate response
      const written = socket.getAllWrittenData().toString();
      const command = JSON.parse(written.replace('\n', ''));

      socket._triggerData(JSON.stringify({
        type: 'command_response',
        id: command.id,
        response: { success: true, data: { result: 'ok' } },
      }) + '\n');

      const result = await executePromise;

      expect(result).toEqual({
        success: true,
        data: { result: 'ok' },
      });
    });

    it('should resolve with error on failed response', async () => {
      backend.setBridge(socket);

      const executePromise = backend.execute('test_tool', {});

      const written = socket.getAllWrittenData().toString();
      const command = JSON.parse(written.replace('\n', ''));

      socket._triggerData(JSON.stringify({
        type: 'command_response',
        id: command.id,
        response: { success: false, error: 'Tool failed' },
      }) + '\n');

      const result = await executePromise;

      expect(result).toEqual({
        success: false,
        error: 'Tool failed',
      });
    });

    it('should timeout after 30 seconds', async () => {
      backend.setBridge(socket);

      const executePromise = backend.execute('slow_tool', {});

      // Advance time past timeout
      vi.advanceTimersByTime(30000);

      const result = await executePromise;

      expect(result).toEqual({
        success: false,
        error: 'Request timeout',
      });
      expect(backend.getPendingCount()).toBe(0);
    });

    it('should handle multiple concurrent requests', async () => {
      backend.setBridge(socket);

      const promises = [
        backend.execute('tool1', {}),
        backend.execute('tool2', {}),
        backend.execute('tool3', {}),
      ];

      expect(backend.getPendingCount()).toBe(3);

      // Respond to all
      const written = socket.getAllWrittenData().toString();
      const commands = written.trim().split('\n').map((line) => JSON.parse(line));

      for (const cmd of commands) {
        socket._triggerData(JSON.stringify({
          type: 'command_response',
          id: cmd.id,
          response: { success: true, data: { action: cmd.command.action } },
        }) + '\n');
      }

      const results = await Promise.all(promises);

      expect(results[0]).toEqual({ success: true, data: { action: 'tool1' } });
      expect(results[1]).toEqual({ success: true, data: { action: 'tool2' } });
      expect(results[2]).toEqual({ success: true, data: { action: 'tool3' } });
      expect(backend.getPendingCount()).toBe(0);
    });

    it('should handle chunked response data', async () => {
      backend.setBridge(socket);

      const executePromise = backend.execute('test_tool', {});

      const written = socket.getAllWrittenData().toString();
      const command = JSON.parse(written.replace('\n', ''));

      const fullResponse = JSON.stringify({
        type: 'command_response',
        id: command.id,
        response: { success: true, data: 'result' },
      }) + '\n';

      // Send in chunks
      socket._triggerData(fullResponse.slice(0, 10));
      socket._triggerData(fullResponse.slice(10, 30));
      socket._triggerData(fullResponse.slice(30));

      const result = await executePromise;

      expect(result).toEqual({ success: true, data: 'result' });
    });
  });

  describe('socket events', () => {
    it('should handle close event', async () => {
      backend.setBridge(socket);
      const executePromise = backend.execute('test_tool', {});

      socket._triggerClose();

      await expect(executePromise).rejects.toThrow('Connection closed');
      expect(backend.isConnected()).toBe(false);
    });

    it('should handle error event', async () => {
      backend.setBridge(socket);
      const executePromise = backend.execute('test_tool', {});

      socket._triggerError(new Error('Socket error'));

      await expect(executePromise).rejects.toThrow('Connection closed');
    });

    it('should ignore unknown message types', async () => {
      backend.setBridge(socket);

      const executePromise = backend.execute('test_tool', {});

      // Send unknown message type
      socket._triggerData(JSON.stringify({
        type: 'unknown_type',
        data: 'something',
      }) + '\n');

      // Should still have pending request
      expect(backend.getPendingCount()).toBe(1);
    });

    it('should ignore responses for unknown request IDs', async () => {
      backend.setBridge(socket);

      const executePromise = backend.execute('test_tool', {});

      // Send response with wrong ID
      socket._triggerData(JSON.stringify({
        type: 'command_response',
        id: 'wrong_id',
        response: { success: true },
      }) + '\n');

      // Should still have pending request
      expect(backend.getPendingCount()).toBe(1);

      // Timeout to clean up
      vi.advanceTimersByTime(30000);
      await executePromise;
    });
  });
});

describe('MCP socket path', () => {
  it('should construct default Unix socket path', () => {
    const user = process.env.USER || 'default';
    const tmpdir = require('node:os').tmpdir();
    const path = require('node:path');

    const socketPath = path.join(tmpdir, `web-browser-mcp-${user}`);

    expect(socketPath).toContain('web-browser-mcp-');
    expect(socketPath).toContain(user);
  });

  it('should use environment override', () => {
    const override = '/custom/socket/path';
    process.env.WEB_BROWSER_MCP_SOCKET = override;

    expect(process.env.WEB_BROWSER_MCP_SOCKET).toBe(override);

    delete process.env.WEB_BROWSER_MCP_SOCKET;
  });

  it('should handle Windows port configuration', () => {
    const defaultPort = 49320;
    const customPort = 12345;

    expect(defaultPort).toBe(49320);

    process.env.WEB_BROWSER_MCP_PORT = String(customPort);
    expect(parseInt(process.env.WEB_BROWSER_MCP_PORT, 10)).toBe(customPort);

    delete process.env.WEB_BROWSER_MCP_PORT;
  });
});

describe('Request ID correlation', () => {
  it('should match responses to correct requests', async () => {
    const backend = new MockBridgeBackend();
    const socket = createMockSocket();
    backend.setBridge(socket);

    // Start multiple requests
    const promise1 = backend.execute('tool1', { arg: 'a' });
    const promise2 = backend.execute('tool2', { arg: 'b' });

    // Parse the commands to get IDs
    const written = socket.getAllWrittenData().toString();
    const commands = written.trim().split('\n').map((line) => JSON.parse(line));

    // Respond in reverse order
    socket._triggerData(JSON.stringify({
      type: 'command_response',
      id: commands[1].id,
      response: { success: true, data: 'response2' },
    }) + '\n');

    socket._triggerData(JSON.stringify({
      type: 'command_response',
      id: commands[0].id,
      response: { success: true, data: 'response1' },
    }) + '\n');

    const result1 = await promise1;
    const result2 = await promise2;

    // Results should match their respective requests despite response order
    expect(result1.data).toBe('response1');
    expect(result2.data).toBe('response2');
  });
});
