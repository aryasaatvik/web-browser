/**
 * Mock socket utilities for testing bridge and backend connections.
 */

import { EventEmitter } from 'node:events';

interface MockSocketOptions {
  autoConnect?: boolean;
}

/**
 * Create a mock net.Socket for testing.
 */
class MockSocket extends EventEmitter {
  private writtenData: Buffer[] = [];
  private destroyedFlag = false;
  private autoConnect: boolean;

  constructor(options: MockSocketOptions = {}) {
    super();
    this.autoConnect = options.autoConnect !== false;
  }

  write(
    data: Buffer | string,
    encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
    callback?: (err?: Error) => void
  ): boolean {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.writtenData.push(buf);
    const cb = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    if (cb) {
      setImmediate(() => cb());
    }
    return true;
  }

  destroy(): this {
    this.destroyedFlag = true;
    this.emit('close');
    return this;
  }

  get destroyed(): boolean {
    return this.destroyedFlag;
  }

  end(): this {
    this.destroyedFlag = true;
    this.emit('close');
    return this;
  }

  connect(): this {
    if (this.autoConnect) {
      setImmediate(() => this.emit('connect'));
    }
    return this;
  }

  _triggerConnect(): void {
    this.emit('connect');
  }

  _triggerData(data: Buffer | string): void {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.emit('data', buf);
  }

  _triggerClose(): void {
    this.destroyedFlag = true;
    this.emit('close');
  }

  _triggerError(err: Error): void {
    this.emit('error', err);
  }

  getWrittenData(): Buffer[] {
    return [...this.writtenData];
  }

  getAllWrittenData(): Buffer {
    return Buffer.concat(this.writtenData);
  }

  isDestroyed(): boolean {
    return this.destroyedFlag;
  }
}

export function createMockSocket(options: MockSocketOptions = {}): MockSocket {
  return new MockSocket(options);
}

/**
 * Create a mock server that simulates connection acceptance.
 */
export function createMockServer(): {
  acceptConnection: () => ReturnType<typeof createMockSocket>;
  onConnection: (handler: (socket: ReturnType<typeof createMockSocket>) => void) => void;
} {
  let connectionHandler: ((socket: ReturnType<typeof createMockSocket>) => void) | null = null;

  return {
    acceptConnection(): ReturnType<typeof createMockSocket> {
      const socket = createMockSocket();
      if (connectionHandler) {
        connectionHandler(socket);
      }
      return socket;
    },

    onConnection(handler: (socket: ReturnType<typeof createMockSocket>) => void): void {
      connectionHandler = handler;
    },
  };
}
