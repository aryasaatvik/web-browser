/**
 * Native messaging client for communicating with the native host.
 */

import type { Browser } from "wxt/browser";

const NATIVE_HOST_NAME = "sh.arya.web_browser_mcp";

type MessageHandler = (message: unknown) => void;
type DisconnectHandler = () => void;

export class NativeClient {
  private port: Browser.runtime.Port | null = null;
  private messageHandlers = new Set<MessageHandler>();
  private disconnectHandlers = new Set<DisconnectHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(): void {
    if (this.port) return;

    try {
      this.port = browser.runtime.connectNative(NATIVE_HOST_NAME);

      this.port.onMessage.addListener((message) => {
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
        for (const handler of this.disconnectHandlers) {
          try {
            handler();
          } catch (err) {
            console.warn("[native] disconnect handler error", err);
          }
        }
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
  }

  send(message: unknown): void {
    if (!this.port) {
      throw new Error("Native host not connected");
    }
    this.port.postMessage(message);
  }

  isConnected(): boolean {
    return this.port !== null;
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onDisconnect(handler: DisconnectHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
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
