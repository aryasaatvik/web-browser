/**
 * Mock stream utilities for testing native messaging protocol.
 */

import { Readable, Writable } from 'node:stream';
import { EventEmitter } from 'node:events';

/**
 * Create a mock Readable stream with controllable data flow.
 */
export function createMockReadable(): Readable & {
  pushData: (data: Buffer) => void;
  end: () => void;
  triggerError: (err: Error) => void;
} {
  const chunks: Buffer[] = [];
  let ended = false;
  let readCallback: (() => void) | null = null;

  const stream = new Readable({
    read() {
      // Called when consumer wants data
      if (chunks.length > 0) {
        const chunk = chunks.shift()!;
        this.push(chunk);
      } else if (ended) {
        this.push(null);
      } else {
        // No data available yet, will be pushed later
        readCallback = () => {
          if (chunks.length > 0) {
            const chunk = chunks.shift()!;
            this.push(chunk);
          } else if (ended) {
            this.push(null);
          }
        };
      }
    }
  });

  const pushData = (data: Buffer): void => {
    chunks.push(data);
    if (readCallback) {
      const cb = readCallback;
      readCallback = null;
      cb();
    }
    stream.emit('readable');
  };

  const end = (): void => {
    ended = true;
    if (readCallback) {
      const cb = readCallback;
      readCallback = null;
      cb();
    }
    stream.emit('end');
  };

  const triggerError = (err: Error): void => {
    stream.emit('error', err);
  };

  return Object.assign(stream, { pushData, end, triggerError });
}

/**
 * Create a mock Writable stream that captures written data.
 */
export function createMockWritable(): Writable & {
  getWrittenData: () => Buffer[];
  getAllData: () => Buffer;
} {
  const writtenData: Buffer[] = [];

  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      writtenData.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    }
  });

  const getWrittenData = (): Buffer[] => [...writtenData];
  const getAllData = (): Buffer => Buffer.concat(writtenData);

  return Object.assign(stream, { getWrittenData, getAllData });
}

/**
 * Create a native messaging format buffer from a message object.
 * Format: 4-byte little-endian length prefix + JSON message body
 */
export function createNativeMessageBuffer(message: unknown): Buffer {
  const json = JSON.stringify(message);
  const messageBuf = Buffer.from(json, 'utf8');
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32LE(messageBuf.length, 0);
  return Buffer.concat([lengthBuf, messageBuf]);
}

/**
 * Parse a native messaging format buffer into length and message.
 */
export function parseNativeMessageBuffer(buffer: Buffer): { length: number; message: unknown } {
  if (buffer.length < 4) {
    throw new Error('Buffer too short for length prefix');
  }
  const length = buffer.readUInt32LE(0);
  if (buffer.length < 4 + length) {
    throw new Error('Buffer too short for message body');
  }
  const json = buffer.slice(4, 4 + length).toString('utf8');
  return { length, message: JSON.parse(json) };
}
