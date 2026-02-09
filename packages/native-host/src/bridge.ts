/**
 * Bridge mode for Web Browser.
 *
 * The bridge is spawned by Chrome via native messaging and acts as a connector:
 * Chrome Extension ↔ (native messaging stdio) ↔ Bridge ↔ (Unix socket) ↔ MCP daemon
 *
 * The bridge is resilient to daemon availability:
 * - Retries connection with exponential backoff
 * - Reconnects automatically if the daemon restarts
 * - Queues messages while disconnected
 * - Stays alive as long as Chrome keeps the native messaging port open
 */

import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createNativeMessageReader,
  writeNativeMessage,
  EndOfStreamError,
} from './native-messaging.js';

// Connection retry settings
const INITIAL_RETRY_DELAY = 500; // ms
const MAX_RETRY_DELAY = 10000; // ms
const MAX_QUEUE_SIZE = 100;

/**
 * Get the daemon socket address.
 */
function getMcpSocketAddress(): { type: 'unix'; path: string } | { type: 'tcp'; host: string; port: number } {
  const override = process.env.WEB_BROWSER_MCP_SOCKET;
  if (override && override.trim()) {
    return { type: 'unix', path: override };
  }

  if (process.platform === 'win32') {
    const port = process.env.WEB_BROWSER_MCP_PORT
      ? parseInt(process.env.WEB_BROWSER_MCP_PORT, 10)
      : 49320;
    return { type: 'tcp', host: '127.0.0.1', port };
  }

  const user = process.env.USER || 'default';
  return { type: 'unix', path: path.join(os.tmpdir(), `web-browser-${user}`) };
}

/**
 * Attempt to connect to the daemon socket once.
 */
function tryConnect(): Promise<net.Socket> {
  const addr = getMcpSocketAddress();

  return new Promise((resolve, reject) => {
    const socket = addr.type === 'unix'
      ? net.createConnection(addr.path)
      : net.createConnection(addr.port, addr.host);

    const onError = (err: Error): void => {
      socket.removeListener('connect', onConnect);
      reject(err);
    };

    const onConnect = (): void => {
      socket.removeListener('error', onError);
      resolve(socket);
    };

    socket.once('error', onError);
    socket.once('connect', onConnect);
  });
}

/**
 * Run the bridge process.
 *
 * The bridge stays alive as long as Chrome keeps the native messaging connection open.
 * It automatically connects/reconnects to the daemon and queues messages while disconnected.
 */
export async function runBridge(): Promise<void> {
  // Disable buffering on stdin/stdout for native messaging
  if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
  }

  let socket: net.Socket | null = null;
  let socketBuffer = '';
  let connected = false;
  let connecting = false;
  let retryDelay = INITIAL_RETRY_DELAY;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const messageQueue: string[] = [];

  /**
   * Send connection status to extension.
   */
  function sendStatus(status: 'connected' | 'disconnected' | 'connecting'): void {
    writeNativeMessage({ type: 'bridge_status', status });
  }

  /**
   * Flush queued messages to MCP server.
   */
  function flushQueue(): void {
    if (!socket || !connected) return;

    while (messageQueue.length > 0) {
      const msg = messageQueue.shift()!;
      socket.write(msg);
    }
  }

  /**
   * Handle incoming data from MCP server.
   */
  function handleSocketData(data: Buffer): void {
    socketBuffer += data.toString();

    while (socketBuffer.includes('\n')) {
      const idx = socketBuffer.indexOf('\n');
      const line = socketBuffer.slice(0, idx);
      socketBuffer = socketBuffer.slice(idx + 1);

      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        writeNativeMessage(message);
      } catch {
        // Ignore parse errors
      }
    }
  }

  /**
   * Set up socket event handlers.
   */
  function setupSocket(sock: net.Socket): void {
    sock.on('data', handleSocketData);

    sock.on('close', () => {
      if (socket === sock) {
        socket = null;
        connected = false;
        socketBuffer = '';
        sendStatus('disconnected');
        scheduleReconnect();
      }
    });

    sock.on('error', () => {
      // Error will trigger close event
      sock.destroy();
    });
  }

  /**
   * Schedule a reconnection attempt.
   */
  function scheduleReconnect(): void {
    if (retryTimer || connecting) return;

    retryTimer = setTimeout(() => {
      retryTimer = null;
      attemptConnect();
    }, retryDelay);

    // Exponential backoff
    retryDelay = Math.min(retryDelay * 1.5, MAX_RETRY_DELAY);
  }

  /**
   * Attempt to connect to MCP server.
   */
  async function attemptConnect(): Promise<void> {
    if (connected || connecting) return;

    connecting = true;
    sendStatus('connecting');

    try {
      socket = await tryConnect();
      connected = true;
      connecting = false;
      retryDelay = INITIAL_RETRY_DELAY; // Reset backoff on success
      setupSocket(socket);
      sendStatus('connected');
      flushQueue();
    } catch {
      connecting = false;
      sendStatus('disconnected');
      scheduleReconnect();
    }
  }

  /**
   * Queue a message to send to MCP server.
   */
  function queueMessage(message: unknown): void {
    const serialized = JSON.stringify(message) + '\n';

    if (connected && socket) {
      socket.write(serialized);
    } else {
      // Queue message for when we reconnect
      if (messageQueue.length < MAX_QUEUE_SIZE) {
        messageQueue.push(serialized);
      }
      // Trigger connection attempt if not already trying
      if (!connecting && !retryTimer) {
        attemptConnect();
      }
    }
  }

  // Start connection attempt immediately
  attemptConnect();

  // Read native messages from Chrome
  const reader = createNativeMessageReader(process.stdin);

  try {
    for await (const message of reader) {
      queueMessage(message);
    }
  } catch (err) {
    if (!(err instanceof EndOfStreamError)) {
      writeNativeMessage({
        type: 'error',
        error: `Native messaging error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // Chrome disconnected - clean up and exit
  if (retryTimer) clearTimeout(retryTimer);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (socket) (socket as net.Socket).destroy();
  process.exit(0);
}
