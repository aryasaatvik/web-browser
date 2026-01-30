/**
 * Chrome Native Messaging Protocol implementation.
 *
 * Chrome native messaging uses length-prefixed JSON on stdio:
 * - 4 byte little-endian uint32 length prefix
 * - N bytes of UTF-8 encoded JSON message
 *
 * @see https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
 */

import { Readable, Writable } from 'node:stream';

/**
 * Read exactly N bytes from a readable stream.
 */
async function readExactly(stream: Readable, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;

    const onReadable = (): void => {
      while (received < length) {
        const remaining = length - received;
        const chunk = stream.read(remaining) as Buffer | null;
        if (chunk === null) break;

        chunks.push(chunk);
        received += chunk.length;
      }

      if (received >= length) {
        cleanup();
        resolve(Buffer.concat(chunks));
      }
    };

    const onEnd = (): void => {
      cleanup();
      if (received === 0) {
        // Clean EOF - stream closed with no partial data
        reject(new EndOfStreamError('Stream ended'));
      } else {
        reject(new Error(`Stream ended after ${received} bytes, expected ${length}`));
      }
    };

    const onError = (err: Error): void => {
      cleanup();
      reject(err);
    };

    const cleanup = (): void => {
      stream.removeListener('readable', onReadable);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
    };

    stream.on('readable', onReadable);
    stream.on('end', onEnd);
    stream.on('error', onError);

    // Try reading immediately in case data is already available
    onReadable();
  });
}

/**
 * Error thrown when the stream ends cleanly (EOF).
 */
export class EndOfStreamError extends Error {
  constructor(message = 'End of stream') {
    super(message);
    this.name = 'EndOfStreamError';
  }
}

/**
 * Read a single native message from stdin.
 *
 * @param input - Readable stream (defaults to process.stdin)
 * @returns Parsed JSON message
 * @throws EndOfStreamError if the stream ends cleanly
 * @throws Error if the stream ends unexpectedly or message is invalid
 */
export async function readNativeMessage(input: Readable = process.stdin): Promise<unknown> {
  // Read 4-byte length prefix (little-endian uint32)
  const lengthBuf = await readExactly(input, 4);
  const length = lengthBuf.readUInt32LE(0);

  // Chrome limits messages to 1MB
  if (length > 1024 * 1024) {
    throw new Error(`Message too large: ${length} bytes (max 1MB)`);
  }

  if (length === 0) {
    throw new Error('Message length is 0');
  }

  // Read message body
  const messageBuf = await readExactly(input, length);
  const json = messageBuf.toString('utf8');

  try {
    return JSON.parse(json);
  } catch {
    throw new Error(`Invalid JSON in native message: ${json.slice(0, 100)}...`);
  }
}

/**
 * Write a native message to stdout.
 *
 * @param message - Object to serialize as JSON
 * @param output - Writable stream (defaults to process.stdout)
 */
export function writeNativeMessage(message: unknown, output: Writable = process.stdout): void {
  const json = JSON.stringify(message);
  const messageBuf = Buffer.from(json, 'utf8');

  // Chrome limits messages to 1MB
  if (messageBuf.length > 1024 * 1024) {
    throw new Error(`Message too large: ${messageBuf.length} bytes (max 1MB)`);
  }

  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32LE(messageBuf.length, 0);

  output.write(lengthBuf);
  output.write(messageBuf);
}

/**
 * Create a native message reader that yields messages from a stream.
 *
 * @param input - Readable stream (defaults to process.stdin)
 * @yields Parsed JSON messages
 */
export async function* createNativeMessageReader(
  input: Readable = process.stdin
): AsyncGenerator<unknown, void, unknown> {
  while (true) {
    try {
      const message = await readNativeMessage(input);
      yield message;
    } catch (err) {
      if (err instanceof EndOfStreamError) {
        // Clean exit
        return;
      }
      throw err;
    }
  }
}

/**
 * Create a native message writer function bound to a stream.
 *
 * @param output - Writable stream (defaults to process.stdout)
 * @returns Function that writes messages to the stream
 */
export function createNativeMessageWriter(
  output: Writable = process.stdout
): (message: unknown) => void {
  return (message: unknown) => writeNativeMessage(message, output);
}
