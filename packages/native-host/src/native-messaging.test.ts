/**
 * Tests for Chrome Native Messaging Protocol implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  readNativeMessage,
  writeNativeMessage,
  createNativeMessageReader,
  createNativeMessageWriter,
  EndOfStreamError,
} from './native-messaging.js';
import {
  createMockReadable,
  createMockWritable,
  createNativeMessageBuffer,
  parseNativeMessageBuffer,
} from './__test__/helpers/index.js';

describe('readNativeMessage', () => {
  it('should read a valid message', async () => {
    const input = createMockReadable();
    const message = { type: 'test', data: 'hello' };
    const readPromise = readNativeMessage(input);

    input.pushData(createNativeMessageBuffer(message));

    const result = await readPromise;
    expect(result).toEqual(message);
  });

  it('should read messages with various JSON types', async () => {
    const testCases = [
      { string: 'value' },
      { number: 42 },
      { boolean: true },
      { array: [1, 2, 3] },
      { nested: { a: { b: { c: 1 } } } },
      { mixed: [1, 'two', { three: 3 }] },
    ];

    for (const message of testCases) {
      const input = createMockReadable();
      const readPromise = readNativeMessage(input);

      input.pushData(createNativeMessageBuffer(message));

      const result = await readPromise;
      expect(result).toEqual(message);
    }
  });

  it('should handle chunked data', async () => {
    const input = createMockReadable();
    const message = { type: 'chunked', value: 123 };
    const buffer = createNativeMessageBuffer(message);
    const readPromise = readNativeMessage(input);

    // Send data in small chunks
    const chunkSize = 3;
    for (let i = 0; i < buffer.length; i += chunkSize) {
      input.pushData(buffer.slice(i, Math.min(i + chunkSize, buffer.length)));
    }

    const result = await readPromise;
    expect(result).toEqual(message);
  });

  it('should throw EndOfStreamError on clean EOF', async () => {
    const input = createMockReadable();
    const readPromise = readNativeMessage(input);

    // End stream without any data
    input.end();

    await expect(readPromise).rejects.toThrow(EndOfStreamError);
  });

  it('should throw on partial data followed by EOF', async () => {
    const input = createMockReadable();
    const readPromise = readNativeMessage(input);

    // Send only 2 bytes of the 4-byte length prefix
    input.pushData(Buffer.from([0x05, 0x00]));
    input.end();

    await expect(readPromise).rejects.toThrow(/expected 4/);
  });

  it('should throw on message exceeding 1MB limit', async () => {
    const input = createMockReadable();
    const readPromise = readNativeMessage(input);

    // Create a length prefix indicating > 1MB
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32LE(1024 * 1024 + 1, 0);
    input.pushData(lengthBuf);

    await expect(readPromise).rejects.toThrow(/too large/);
  });

  it('should throw on zero-length message', async () => {
    const input = createMockReadable();
    const readPromise = readNativeMessage(input);

    // Create a length prefix of 0
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32LE(0, 0);
    input.pushData(lengthBuf);

    await expect(readPromise).rejects.toThrow(/length is 0/);
  });

  it('should throw on invalid JSON', async () => {
    const input = createMockReadable();
    const readPromise = readNativeMessage(input);

    // Create a message with invalid JSON
    const invalidJson = 'not valid json {';
    const messageBuf = Buffer.from(invalidJson, 'utf8');
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32LE(messageBuf.length, 0);
    input.pushData(Buffer.concat([lengthBuf, messageBuf]));

    await expect(readPromise).rejects.toThrow(/Invalid JSON/);
  });

  it('should propagate stream errors', async () => {
    const input = createMockReadable();
    const readPromise = readNativeMessage(input);

    const testError = new Error('Test stream error');
    input.triggerError(testError);

    await expect(readPromise).rejects.toThrow('Test stream error');
  });
});

describe('writeNativeMessage', () => {
  it('should write a valid message', () => {
    const output = createMockWritable();
    const message = { type: 'test', data: 'hello' };

    writeNativeMessage(message, output);

    const written = output.getAllData();
    const parsed = parseNativeMessageBuffer(written);
    expect(parsed.message).toEqual(message);
  });

  it('should write messages with various JSON types', () => {
    const testCases = [
      { string: 'value' },
      { number: 42 },
      { boolean: true },
      { array: [1, 2, 3] },
      { nested: { a: { b: { c: 1 } } } },
    ];

    for (const message of testCases) {
      const output = createMockWritable();
      writeNativeMessage(message, output);

      const written = output.getAllData();
      const parsed = parseNativeMessageBuffer(written);
      expect(parsed.message).toEqual(message);
    }
  });

  it('should correctly format the length prefix', () => {
    const output = createMockWritable();
    const message = { test: 'data' };

    writeNativeMessage(message, output);

    const written = output.getAllData();
    const length = written.readUInt32LE(0);
    const jsonPart = written.slice(4);

    expect(length).toBe(jsonPart.length);
    expect(JSON.parse(jsonPart.toString('utf8'))).toEqual(message);
  });

  it('should throw on message exceeding 1MB limit', () => {
    const output = createMockWritable();
    // Create a message that will exceed 1MB when serialized
    const largeData = 'x'.repeat(1024 * 1024 + 100);
    const message = { data: largeData };

    expect(() => writeNativeMessage(message, output)).toThrow(/too large/);
  });

  it('should handle Unicode characters correctly', () => {
    const output = createMockWritable();
    const message = { text: '你好世界 🌍 émoji' };

    writeNativeMessage(message, output);

    const written = output.getAllData();
    const parsed = parseNativeMessageBuffer(written);
    expect(parsed.message).toEqual(message);
  });

  it('should write two separate buffers (length + message)', () => {
    const output = createMockWritable();
    const message = { test: 'data' };

    writeNativeMessage(message, output);

    const chunks = output.getWrittenData();
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(4); // Length prefix
    expect(chunks[1].length).toBeGreaterThan(0); // Message body
  });
});

describe('createNativeMessageReader', () => {
  it('should yield messages as they arrive', async () => {
    const input = createMockReadable();
    const reader = createNativeMessageReader(input);

    const messages = [
      { id: 1, type: 'first' },
      { id: 2, type: 'second' },
      { id: 3, type: 'third' },
    ];

    // Push all messages
    for (const msg of messages) {
      input.pushData(createNativeMessageBuffer(msg));
    }
    input.end();

    const received: unknown[] = [];
    for await (const msg of reader) {
      received.push(msg);
    }

    expect(received).toEqual(messages);
  });

  it('should handle interleaved pushes', async () => {
    const input = createMockReadable();
    const reader = createNativeMessageReader(input);

    const received: unknown[] = [];
    const readerPromise = (async () => {
      for await (const msg of reader) {
        received.push(msg);
      }
    })();

    // Push messages one at a time with small delays
    input.pushData(createNativeMessageBuffer({ n: 1 }));
    await new Promise((r) => setImmediate(r));

    input.pushData(createNativeMessageBuffer({ n: 2 }));
    await new Promise((r) => setImmediate(r));

    input.end();
    await readerPromise;

    expect(received).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('should return cleanly on EndOfStreamError', async () => {
    const input = createMockReadable();
    const reader = createNativeMessageReader(input);

    // End immediately without any messages
    input.end();

    const received: unknown[] = [];
    for await (const msg of reader) {
      received.push(msg);
    }

    expect(received).toEqual([]);
  });

  it('should propagate non-EOF errors', async () => {
    const input = createMockReadable();
    const reader = createNativeMessageReader(input);

    // Push invalid data that will cause a parse error
    const invalidJson = 'not valid';
    const messageBuf = Buffer.from(invalidJson, 'utf8');
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32LE(messageBuf.length, 0);
    input.pushData(Buffer.concat([lengthBuf, messageBuf]));

    await expect(async () => {
      for await (const _ of reader) {
        // Should throw before yielding
      }
    }).rejects.toThrow(/Invalid JSON/);
  });
});

describe('createNativeMessageWriter', () => {
  it('should create a bound writer function', () => {
    const output = createMockWritable();
    const write = createNativeMessageWriter(output);

    write({ test: 'message' });

    const written = output.getAllData();
    const parsed = parseNativeMessageBuffer(written);
    expect(parsed.message).toEqual({ test: 'message' });
  });

  it('should allow multiple writes', () => {
    const output = createMockWritable();
    const write = createNativeMessageWriter(output);

    write({ id: 1 });
    write({ id: 2 });
    write({ id: 3 });

    const chunks = output.getWrittenData();
    // Each write produces 2 chunks (length + message)
    expect(chunks.length).toBe(6);
  });
});

describe('EndOfStreamError', () => {
  it('should have correct name', () => {
    const error = new EndOfStreamError();
    expect(error.name).toBe('EndOfStreamError');
  });

  it('should have default message', () => {
    const error = new EndOfStreamError();
    expect(error.message).toBe('End of stream');
  });

  it('should accept custom message', () => {
    const error = new EndOfStreamError('Custom message');
    expect(error.message).toBe('Custom message');
  });

  it('should be instanceof Error', () => {
    const error = new EndOfStreamError();
    expect(error instanceof Error).toBe(true);
    expect(error instanceof EndOfStreamError).toBe(true);
  });
});
