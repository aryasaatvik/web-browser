/**
 * Tests for CdpClient - Chrome DevTools Protocol client.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CdpClient } from './cdp.js';

describe('CdpClient', () => {
  let client: CdpClient;

  beforeEach(() => {
    client = new CdpClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('attach', () => {
    it('should attach debugger to tab', async () => {
      await client.attach(123);

      expect(browser.debugger.attach).toHaveBeenCalledWith({ tabId: 123 }, '1.3');
      expect(client.isAttached(123)).toBe(true);
    });

    it('should not re-attach if already attached', async () => {
      await client.attach(123);
      await client.attach(123);

      expect(browser.debugger.attach).toHaveBeenCalledTimes(1);
    });

    it('should track multiple tabs independently', async () => {
      await client.attach(1);
      await client.attach(2);
      await client.attach(3);

      expect(client.isAttached(1)).toBe(true);
      expect(client.isAttached(2)).toBe(true);
      expect(client.isAttached(3)).toBe(true);
      expect(browser.debugger.attach).toHaveBeenCalledTimes(3);
    });
  });

  describe('detach', () => {
    it('should detach debugger from tab', async () => {
      await client.attach(123);
      await client.detach(123);

      expect(browser.debugger.detach).toHaveBeenCalledWith({ tabId: 123 });
      expect(client.isAttached(123)).toBe(false);
    });

    it('should not call detach if not attached', async () => {
      await client.detach(123);

      expect(browser.debugger.detach).not.toHaveBeenCalled();
    });

    it('should handle detach errors gracefully', async () => {
      browser.debugger.detach = vi.fn().mockRejectedValue(new Error('Tab closed'));

      await client.attach(123);
      await expect(client.detach(123)).resolves.toBeUndefined();

      expect(client.isAttached(123)).toBe(false);
    });
  });

  describe('isAttached', () => {
    it('should return false for unattached tab', () => {
      expect(client.isAttached(123)).toBe(false);
    });

    it('should return true for attached tab', async () => {
      await client.attach(123);
      expect(client.isAttached(123)).toBe(true);
    });

    it('should return false after detach', async () => {
      await client.attach(123);
      await client.detach(123);

      expect(client.isAttached(123)).toBe(false);
    });
  });

  describe('sendCommand', () => {
    it('should send command to attached tab', async () => {
      await client.attach(123);

      browser.debugger.sendCommand = vi.fn().mockResolvedValue({ result: 'ok' });

      const result = await client.sendCommand(123, 'Page.navigate', { url: 'https://example.com' });

      expect(browser.debugger.sendCommand).toHaveBeenCalledWith(
        { tabId: 123 },
        'Page.navigate',
        { url: 'https://example.com' }
      );
      expect(result).toEqual({ result: 'ok' });
    });

    it('should auto-attach if not already attached', async () => {
      browser.debugger.sendCommand = vi.fn().mockResolvedValue({});

      await client.sendCommand(123, 'Page.enable');

      expect(browser.debugger.attach).toHaveBeenCalledWith({ tabId: 123 }, '1.3');
      expect(browser.debugger.sendCommand).toHaveBeenCalled();
    });

    it('should not re-attach when sending multiple commands', async () => {
      browser.debugger.sendCommand = vi.fn().mockResolvedValue({});

      await client.sendCommand(123, 'Page.enable');
      await client.sendCommand(123, 'Runtime.enable');
      await client.sendCommand(123, 'DOM.enable');

      expect(browser.debugger.attach).toHaveBeenCalledTimes(1);
      expect(browser.debugger.sendCommand).toHaveBeenCalledTimes(3);
    });

    it('should send command without params', async () => {
      await client.attach(123);
      browser.debugger.sendCommand = vi.fn().mockResolvedValue({});

      await client.sendCommand(123, 'Page.enable');

      expect(browser.debugger.sendCommand).toHaveBeenCalledWith(
        { tabId: 123 },
        'Page.enable',
        undefined
      );
    });

    it('should return typed result', async () => {
      await client.attach(123);
      browser.debugger.sendCommand = vi.fn().mockResolvedValue({
        data: 'base64data',
        format: 'png',
      });

      interface ScreenshotResult {
        data: string;
        format: string;
      }

      const result = await client.sendCommand<ScreenshotResult>(
        123,
        'Page.captureScreenshot'
      );

      expect(result.data).toBe('base64data');
      expect(result.format).toBe('png');
    });
  });

  describe('multiple tabs', () => {
    it('should manage multiple tabs independently', async () => {
      browser.debugger.sendCommand = vi.fn().mockResolvedValue({});

      await client.attach(1);
      await client.attach(2);

      await client.sendCommand(1, 'Page.enable');
      await client.sendCommand(2, 'Page.enable');

      expect(browser.debugger.sendCommand).toHaveBeenCalledWith({ tabId: 1 }, 'Page.enable', undefined);
      expect(browser.debugger.sendCommand).toHaveBeenCalledWith({ tabId: 2 }, 'Page.enable', undefined);
    });

    it('should detach only specified tab', async () => {
      await client.attach(1);
      await client.attach(2);

      await client.detach(1);

      expect(client.isAttached(1)).toBe(false);
      expect(client.isAttached(2)).toBe(true);
    });
  });
});

describe('CdpClient idempotency', () => {
  let client: CdpClient;

  beforeEach(() => {
    client = new CdpClient();
  });

  it('should be idempotent for sequential attach', async () => {
    // Sequential attach calls after first completes should not re-attach
    await client.attach(123);
    await client.attach(123);
    await client.attach(123);

    expect(browser.debugger.attach).toHaveBeenCalledTimes(1);
  });

  it('should be idempotent for sequential detach', async () => {
    await client.attach(123);

    // Sequential detach calls should only call detach once
    await client.detach(123);
    await client.detach(123);
    await client.detach(123);

    expect(browser.debugger.detach).toHaveBeenCalledTimes(1);
  });
});
