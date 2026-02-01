/**
 * Native messaging client for communicating with the native host.
 *
 * The native client maintains a connection to the bridge process, which in turn
 * connects to the MCP server. The bridge is resilient and will automatically
 * reconnect to the MCP server, so we only need to maintain one native messaging
 * connection.
 */

import type { Browser } from "wxt/browser";

const NATIVE_HOST_NAME = "sh.arya.web_browser";

type MessageHandler = (message: unknown) => void;
type DisconnectHandler = () => void;
type BridgeStatusHandler = (status: 'connected' | 'disconnected' | 'connecting') => void;

export class NativeClient {
  private port: Browser.runtime.Port | null = null;
  private messageHandlers = new Set<MessageHandler>();
  private disconnectHandlers = new Set<DisconnectHandler>();
  private bridgeStatusHandlers = new Set<BridgeStatusHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _bridgeStatus: 'connected' | 'disconnected' | 'connecting' | 'unknown' = 'unknown';

  connect(): void {
    if (this.port) return;

    try {
      this.port = browser.runtime.connectNative(NATIVE_HOST_NAME);

      this.port.onMessage.addListener((message) => {
        // Handle bridge status messages internally
        if (message && typeof message === 'object' && 'type' in message) {
          const msg = message as { type: string; status?: string };
          if (msg.type === 'bridge_status' && msg.status) {
            this._bridgeStatus = msg.status as typeof this._bridgeStatus;
            for (const handler of this.bridgeStatusHandlers) {
              try {
                handler(msg.status as 'connected' | 'disconnected' | 'connecting');
              } catch (err) {
                console.warn("[native] bridge status handler error", err);
              }
            }
            return; // Don't pass bridge_status to regular message handlers
          }
        }

        for (const handler of this.messageHandlers) {
          try {
            handler(message);
          } catch (err) {
            console.warn("[native] handler error", err);
          }
        }
      });

      this.port.onDisconnect.addListener(() => {
        this.port = null;
        this._bridgeStatus = 'unknown';
        for (const handler of this.disconnectHandlers) {
          try {
            handler();
          } catch (err) {
            console.warn("[native] disconnect handler error", err);
          }
        }
        // Reconnect to the bridge
        this.scheduleReconnect();
      });
    } catch (err) {
      console.warn("[native] connect error", err);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }
    this._bridgeStatus = 'unknown';
  }

  send(message: unknown): void {
    if (!this.port) {
      throw new Error("Native host not connected");
    }
    this.port.postMessage(message);
  }

  /**
   * Check if the native messaging port to the bridge is connected.
   */
  isConnected(): boolean {
    return this.port !== null;
  }

  /**
   * Check if the bridge is connected to the MCP server.
   */
  isMcpConnected(): boolean {
    return this._bridgeStatus === 'connected';
  }

  /**
   * Get the current bridge-to-MCP connection status.
   */
  get bridgeStatus(): typeof this._bridgeStatus {
    return this._bridgeStatus;
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onDisconnect(handler: DisconnectHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  /**
   * Listen for bridge-to-MCP connection status changes.
   */
  onBridgeStatus(handler: BridgeStatusHandler): () => void {
    this.bridgeStatusHandlers.add(handler);
    return () => this.bridgeStatusHandlers.delete(handler);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1000);
  }
}

export const native = new NativeClient();
