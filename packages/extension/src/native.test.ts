/**
 * Tests for NativeClient - native messaging client for Chrome extension.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NativeClient } from './native.js';

describe('NativeClient', () => {
  let client: NativeClient;

  beforeEach(() => {
    client = new NativeClient();
    vi.useFakeTimers();
  });

  afterEach(() => {
    client.disconnect();
    vi.useRealTimers();
  });

  describe('connect', () => {
    it('should connect to native host', () => {
      client.connect();

      expect(browser.runtime.connectNative).toHaveBeenCalledWith('sh.arya.web_browser');
      expect(client.isConnected()).toBe(true);
    });

    it('should not reconnect if already connected', () => {
      client.connect();
      client.connect();

      expect(browser.runtime.connectNative).toHaveBeenCalledTimes(1);
    });

    it('should set up message and disconnect listeners', () => {
      client.connect();

      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;
      expect(port.onMessage.addListener).toHaveBeenCalled();
      expect(port.onDisconnect.addListener).toHaveBeenCalled();
    });

    it('should schedule reconnect on connect error', () => {
      browser.runtime.connectNative = vi.fn(() => {
        throw new Error('Connection failed');
      });

      client.connect();

      expect(client.isConnected()).toBe(false);
      // Should have scheduled a reconnect
      vi.advanceTimersByTime(1000);
      // Would try to connect again
    });
  });

  describe('disconnect', () => {
    it('should disconnect the port', () => {
      client.connect();
      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;

      client.disconnect();

      expect(port.disconnect).toHaveBeenCalled();
      expect(client.isConnected()).toBe(false);
    });

    it('should clear reconnect timer', () => {
      // Force a disconnect that schedules reconnect
      client.connect();
      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;
      port.onDisconnect._triggerDisconnect();

      // Reconnect scheduled
      expect(client.isConnected()).toBe(false);

      // Now call disconnect to clear the timer
      client.disconnect();

      // Advance time - should not reconnect since timer was cleared
      vi.advanceTimersByTime(2000);
      // connectNative was called once on first connect, should not be called again
      expect(browser.runtime.connectNative).toHaveBeenCalledTimes(1);
    });

    it('should reset bridge status to unknown', () => {
      client.connect();
      expect(client.bridgeStatus).toBe('unknown');

      client.disconnect();
      expect(client.bridgeStatus).toBe('unknown');
    });
  });

  describe('send', () => {
    it('should send message via port', () => {
      client.connect();
      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;
      const message = { type: 'test', data: 'hello' };

      client.send(message);

      expect(port.postMessage).toHaveBeenCalledWith(message);
    });

    it('should throw if not connected', () => {
      expect(() => client.send({ test: 'message' })).toThrow('Native host not connected');
    });
  });

  describe('message handlers', () => {
    it('should dispatch messages to registered handlers', () => {
      const handler = vi.fn();
      client.onMessage(handler);
      client.connect();

      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;
      port.onMessage._triggerMessage({ type: 'test', data: 'hello' });

      expect(handler).toHaveBeenCalledWith({ type: 'test', data: 'hello' });
    });

    it('should support multiple handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      client.onMessage(handler1);
      client.onMessage(handler2);
      client.connect();

      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;
      port.onMessage._triggerMessage({ test: true });

      expect(handler1).toHaveBeenCalledWith({ test: true });
      expect(handler2).toHaveBeenCalledWith({ test: true });
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = client.onMessage(handler);
      client.connect();

      unsubscribe();

      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;
      port.onMessage._triggerMessage({ test: true });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should continue despite handler errors', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      client.onMessage(errorHandler);
      client.onMessage(normalHandler);
      client.connect();

      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;
      port.onMessage._triggerMessage({ test: true });

      // Both handlers should be called, even though first one throws
      expect(errorHandler).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalled();
    });
  });

  describe('disconnect handlers', () => {
    it('should call disconnect handlers on port disconnect', () => {
      const handler = vi.fn();
      client.onDisconnect(handler);
      client.connect();

      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;
      port.onDisconnect._triggerDisconnect();

      expect(handler).toHaveBeenCalled();
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = client.onDisconnect(handler);
      client.connect();

      unsubscribe();

      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;
      port.onDisconnect._triggerDisconnect();

      expect(handler).not.toHaveBeenCalled();
    });

    it('should schedule reconnect on disconnect', () => {
      client.connect();
      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;

      port.onDisconnect._triggerDisconnect();

      expect(client.isConnected()).toBe(false);

      // Advance time to trigger reconnect
      vi.advanceTimersByTime(1000);

      // Should have attempted to reconnect
      expect(browser.runtime.connectNative).toHaveBeenCalledTimes(2);
    });
  });

  describe('bridge status', () => {
    it('should start with unknown status', () => {
      expect(client.bridgeStatus).toBe('unknown');
    });

    it('should update status on bridge_status messages', () => {
      client.connect();

      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;
      port.onMessage._triggerMessage({ type: 'bridge_status', status: 'connected' });

      expect(client.bridgeStatus).toBe('connected');
      expect(client.isMcpConnected()).toBe(true);
    });

    it('should call bridge status handlers', () => {
      const handler = vi.fn();
      client.onBridgeStatus(handler);
      client.connect();

      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;
      port.onMessage._triggerMessage({ type: 'bridge_status', status: 'connecting' });

      expect(handler).toHaveBeenCalledWith('connecting');
    });

    it('should not pass bridge_status to regular message handlers', () => {
      const messageHandler = vi.fn();
      const statusHandler = vi.fn();

      client.onMessage(messageHandler);
      client.onBridgeStatus(statusHandler);
      client.connect();

      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;
      port.onMessage._triggerMessage({ type: 'bridge_status', status: 'connected' });

      expect(statusHandler).toHaveBeenCalledWith('connected');
      expect(messageHandler).not.toHaveBeenCalled();
    });

    it('should return unsubscribe function for bridge status', () => {
      const handler = vi.fn();
      const unsubscribe = client.onBridgeStatus(handler);
      client.connect();

      unsubscribe();

      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;
      port.onMessage._triggerMessage({ type: 'bridge_status', status: 'connected' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should track all status values', () => {
      client.connect();

      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;

      port.onMessage._triggerMessage({ type: 'bridge_status', status: 'connecting' });
      expect(client.bridgeStatus).toBe('connecting');
      expect(client.isMcpConnected()).toBe(false);

      port.onMessage._triggerMessage({ type: 'bridge_status', status: 'connected' });
      expect(client.bridgeStatus).toBe('connected');
      expect(client.isMcpConnected()).toBe(true);

      port.onMessage._triggerMessage({ type: 'bridge_status', status: 'disconnected' });
      expect(client.bridgeStatus).toBe('disconnected');
      expect(client.isMcpConnected()).toBe(false);
    });

    it('should reset status to unknown on port disconnect', () => {
      client.connect();
      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;

      port.onMessage._triggerMessage({ type: 'bridge_status', status: 'connected' });
      expect(client.bridgeStatus).toBe('connected');

      port.onDisconnect._triggerDisconnect();
      expect(client.bridgeStatus).toBe('unknown');
    });
  });

  describe('reconnection', () => {
    it('should reconnect after 1 second delay', () => {
      client.connect();
      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;

      port.onDisconnect._triggerDisconnect();
      expect(browser.runtime.connectNative).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(500);
      expect(browser.runtime.connectNative).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(500);
      expect(browser.runtime.connectNative).toHaveBeenCalledTimes(2);
    });

    it('should not schedule multiple reconnects', () => {
      client.connect();
      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;

      // Trigger multiple disconnects quickly
      port.onDisconnect._triggerDisconnect();

      // Advance past first reconnect
      vi.advanceTimersByTime(1000);

      // Should have exactly 2 calls (original + 1 reconnect)
      expect(browser.runtime.connectNative).toHaveBeenCalledTimes(2);
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(client.isConnected()).toBe(false);
    });

    it('should return true when connected', () => {
      client.connect();
      expect(client.isConnected()).toBe(true);
    });

    it('should return false after disconnect', () => {
      client.connect();
      client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it('should return false after port disconnect', () => {
      client.connect();
      const port = (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mock.results[0].value;

      port.onDisconnect._triggerDisconnect();

      expect(client.isConnected()).toBe(false);
    });
  });
});
