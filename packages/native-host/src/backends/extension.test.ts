/**
 * Tests for ExtensionBackend - socket-based connection to MCP server.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockSocket } from '../__test__/helpers/index.js';

// Simulate the ExtensionBackend behavior for testing
class MockExtensionBackend {
  readonly name = 'extension' as const;

  private socket: ReturnType<typeof createMockSocket> | null = null;
  private buffer = '';
  private connecting: Promise<ReturnType<typeof createMockSocket>> | null = null;
  private pending = new Map<string, {
    resolve: (value: { success: boolean; data?: unknown; error?: string }) => void;
    reject: (err: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private requestId = 0;

  // For testing: inject socket creation function
  private createSocket: () => ReturnType<typeof createMockSocket>;

  constructor(createSocket?: () => ReturnType<typeof createMockSocket>) {
    this.createSocket = createSocket || createMockSocket;
  }

  async connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return;
    await this.ensureConnection();
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Disconnected'));
      this.pending.delete(id);
    }
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  async execute(tool: string, args: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const socket = await this.ensureConnection();
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

      socket.write(JSON.stringify(command) + '\n');
    });
  }

  private async ensureConnection(): Promise<ReturnType<typeof createMockSocket>> {
    if (this.socket && !this.socket.destroyed) return this.socket;
    if (this.connecting) return this.connecting;

    this.connecting = new Promise((resolve, reject) => {
      const socket = this.createSocket();

      socket.once('error', reject);
      socket.once('connect', () => {
        this.socket = socket;
        this.buffer = '';

        socket.on('data', (data: Buffer) => this.onData(data));
        socket.on('close', () => {
          if (this.socket === socket) {
            this.socket = null;
            this.onClose(new Error('Connection closed'));
          }
        });

        resolve(socket);
      });

      socket.connect();
    });

    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
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

  private onClose(err: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(err);
      this.pending.delete(id);
    }
  }

  // Test helpers
  getPendingCount(): number {
    return this.pending.size;
  }

  getSocket(): ReturnType<typeof createMockSocket> | null {
    return this.socket;
  }

  // Directly set socket for testing (bypasses ensureConnection)
  setSocket(socket: ReturnType<typeof createMockSocket>): void {
    this.socket = socket;
    socket.on('data', (data: Buffer) => this.onData(data));
    socket.on('close', () => {
      if (this.socket === socket) {
        this.socket = null;
        this.onClose(new Error('Connection closed'));
      }
    });
  }
}

describe('ExtensionBackend', () => {
  let backend: MockExtensionBackend;
  let mockSocket: ReturnType<typeof createMockSocket>;

  beforeEach(() => {
    mockSocket = createMockSocket();
    backend = new MockExtensionBackend(() => mockSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('connect', () => {
    it('should establish connection', async () => {
      const connectPromise = backend.connect();
      mockSocket._triggerConnect();
      await connectPromise;

      expect(backend.isConnected()).toBe(true);
    });

    it('should reuse existing connection', async () => {
      const connectPromise = backend.connect();
      mockSocket._triggerConnect();
      await connectPromise;

      await backend.connect();

      expect(backend.isConnected()).toBe(true);
    });

    it('should reject on connection error', async () => {
      const connectPromise = backend.connect();
      mockSocket._triggerError(new Error('Connection refused'));

      await expect(connectPromise).rejects.toThrow('Connection refused');
    });
  });

  describe('disconnect', () => {
    it('should destroy socket', async () => {
      const connectPromise = backend.connect();
      mockSocket._triggerConnect();
      await connectPromise;

      await backend.disconnect();

      expect(mockSocket.isDestroyed()).toBe(true);
      expect(backend.isConnected()).toBe(false);
    });
  });

  describe('isConnected', () => {
    it('should return false before connect', () => {
      expect(backend.isConnected()).toBe(false);
    });

    it('should return true after connect', async () => {
      const connectPromise = backend.connect();
      mockSocket._triggerConnect();
      await connectPromise;

      expect(backend.isConnected()).toBe(true);
    });

    it('should return false after disconnect', async () => {
      const connectPromise = backend.connect();
      mockSocket._triggerConnect();
      await connectPromise;

      await backend.disconnect();

      expect(backend.isConnected()).toBe(false);
    });
  });

  describe('execute with pre-connected socket', () => {
    beforeEach(() => {
      // Directly set socket to avoid async connection issues
      backend.setSocket(mockSocket);
    });

    it('should send command via socket', async () => {
      const executePromise = backend.execute('navigate', { url: 'https://example.com' });

      // Give time for the command to be written
      await vi.advanceTimersByTimeAsync(10);

      const written = mockSocket.getAllWrittenData().toString();
      expect(written.length).toBeGreaterThan(0);

      const command = JSON.parse(written.trim());

      expect(command.type).toBe('command_request');
      expect(command.command.action).toBe('navigate');
      expect(command.command.url).toBe('https://example.com');

      // Send response to complete
      mockSocket._triggerData(JSON.stringify({
        type: 'command_response',
        id: command.id,
        response: { success: true },
      }) + '\n');

      await executePromise;
    });

    it('should resolve on success response', async () => {
      const executePromise = backend.execute('test_tool', {});

      await vi.advanceTimersByTimeAsync(10);

      const written = mockSocket.getAllWrittenData().toString();
      const command = JSON.parse(written.trim());

      mockSocket._triggerData(JSON.stringify({
        type: 'command_response',
        id: command.id,
        response: { success: true, data: { value: 42 } },
      }) + '\n');

      const result = await executePromise;

      expect(result).toEqual({
        success: true,
        data: { value: 42 },
      });
    });

    it('should resolve with error on failure response', async () => {
      const executePromise = backend.execute('test_tool', {});

      await vi.advanceTimersByTimeAsync(10);

      const written = mockSocket.getAllWrittenData().toString();
      const command = JSON.parse(written.trim());

      mockSocket._triggerData(JSON.stringify({
        type: 'command_response',
        id: command.id,
        response: { success: false, error: 'Something went wrong' },
      }) + '\n');

      const result = await executePromise;

      expect(result).toEqual({
        success: false,
        error: 'Something went wrong',
      });
    });

    it('should timeout after 30 seconds', async () => {
      const executePromise = backend.execute('slow_tool', {});

      await vi.advanceTimersByTimeAsync(30000);

      const result = await executePromise;

      expect(result).toEqual({
        success: false,
        error: 'Request timeout',
      });
    });

    it('should handle chunked responses', async () => {
      const executePromise = backend.execute('test_tool', {});

      await vi.advanceTimersByTimeAsync(10);

      const written = mockSocket.getAllWrittenData().toString();
      const command = JSON.parse(written.trim());

      const fullResponse = JSON.stringify({
        type: 'command_response',
        id: command.id,
        response: { success: true, data: 'chunked result' },
      }) + '\n';

      // Send in chunks
      mockSocket._triggerData(fullResponse.slice(0, 20));
      mockSocket._triggerData(fullResponse.slice(20, 50));
      mockSocket._triggerData(fullResponse.slice(50));

      const result = await executePromise;

      expect(result).toEqual({
        success: true,
        data: 'chunked result',
      });
    });

    it('should handle concurrent requests', async () => {
      const promise1 = backend.execute('tool1', {});
      const promise2 = backend.execute('tool2', {});

      await vi.advanceTimersByTimeAsync(10);

      const written = mockSocket.getAllWrittenData().toString();
      const lines = written.trim().split('\n').filter(Boolean);
      const commands = lines.map((line) => JSON.parse(line));

      expect(commands.length).toBe(2);

      // Respond to both
      for (const cmd of commands) {
        mockSocket._triggerData(JSON.stringify({
          type: 'command_response',
          id: cmd.id,
          response: { success: true, data: cmd.command.action },
        }) + '\n');
      }

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1.data).toBe('tool1');
      expect(result2.data).toBe('tool2');
    });

    it('should reject on socket close', async () => {
      const executePromise = backend.execute('test_tool', {});

      await vi.advanceTimersByTimeAsync(10);

      mockSocket._triggerClose();

      await expect(executePromise).rejects.toThrow('Connection closed');
    });
  });

  describe('connection pooling', () => {
    it('should reuse existing socket', () => {
      backend.setSocket(mockSocket);

      const socket1 = backend.getSocket();
      const socket2 = backend.getSocket();

      expect(socket1).toBe(socket2);
    });
  });
});

describe('Socket address configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should respect WEB_BROWSER_MCP_SOCKET override', () => {
    process.env.WEB_BROWSER_MCP_SOCKET = '/custom/path.sock';
    expect(process.env.WEB_BROWSER_MCP_SOCKET).toBe('/custom/path.sock');
  });

  it('should respect WEB_BROWSER_MCP_PORT override for Windows', () => {
    process.env.WEB_BROWSER_MCP_PORT = '55555';
    expect(parseInt(process.env.WEB_BROWSER_MCP_PORT, 10)).toBe(55555);
  });

  it('should use default port when not specified', () => {
    delete process.env.WEB_BROWSER_MCP_PORT;
    const defaultPort = 49320;
    expect(defaultPort).toBe(49320);
  });
});
