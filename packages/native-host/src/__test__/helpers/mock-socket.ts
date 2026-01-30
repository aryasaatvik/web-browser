/**
 * Mock socket utilities for testing bridge and backend connections.
 */

import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';

interface MockSocketOptions {
  autoConnect?: boolean;
}

/**
 * Create a mock net.Socket for testing.
 */
export function createMockSocket(options: MockSocketOptions = {}): Socket & {
  _triggerConnect: () => void;
  _triggerData: (data: Buffer | string) => void;
  _triggerClose: () => void;
  _triggerError: (err: Error) => void;
  getWrittenData: () => Buffer[];
  getAllWrittenData: () => Buffer;
  isDestroyed: () => boolean;
} {
  const emitter = new EventEmitter();
  const writtenData: Buffer[] = [];
  let _destroyed = false;

  const socket = {
    // EventEmitter methods
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.off.bind(emitter),
    emit: emitter.emit.bind(emitter),
    addListener: emitter.addListener.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    removeAllListeners: emitter.removeAllListeners.bind(emitter),
    listeners: emitter.listeners.bind(emitter),
    listenerCount: emitter.listenerCount.bind(emitter),
    prependListener: emitter.prependListener.bind(emitter),
    prependOnceListener: emitter.prependOnceListener.bind(emitter),
    eventNames: emitter.eventNames.bind(emitter),
    rawListeners: emitter.rawListeners.bind(emitter),
    setMaxListeners: emitter.setMaxListeners.bind(emitter),
    getMaxListeners: emitter.getMaxListeners.bind(emitter),
    [Symbol.toStringTag]: 'MockSocket',

    // Socket methods
    write(data: Buffer | string, encodingOrCallback?: BufferEncoding | ((err?: Error) => void), callback?: (err?: Error) => void): boolean {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      writtenData.push(buf);
      const cb = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
      if (cb) {
        setImmediate(() => cb());
      }
      return true;
    },

    destroy(): Socket {
      _destroyed = true;
      emitter.emit('close');
      return socket as Socket;
    },

    get destroyed(): boolean {
      return _destroyed;
    },

    end(): Socket {
      _destroyed = true;
      emitter.emit('close');
      return socket as Socket;
    },

    connect(): Socket {
      if (options.autoConnect !== false) {
        setImmediate(() => emitter.emit('connect'));
      }
      return socket as Socket;
    },

    // Test helpers
    _triggerConnect: (): void => {
      emitter.emit('connect');
    },

    _triggerData: (data: Buffer | string): void => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      emitter.emit('data', buf);
    },

    _triggerClose: (): void => {
      _destroyed = true;
      emitter.emit('close');
    },

    _triggerError: (err: Error): void => {
      emitter.emit('error', err);
    },

    getWrittenData: (): Buffer[] => [...writtenData],

    getAllWrittenData: (): Buffer => Buffer.concat(writtenData),

    isDestroyed: (): boolean => _destroyed,
  };

  return socket as unknown as Socket & {
    _triggerConnect: () => void;
    _triggerData: (data: Buffer | string) => void;
    _triggerClose: () => void;
    _triggerError: (err: Error) => void;
    getWrittenData: () => Buffer[];
    getAllWrittenData: () => Buffer;
    isDestroyed: () => boolean;
  };
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
