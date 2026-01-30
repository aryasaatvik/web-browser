/**
 * Tests for element stability detection.
 *
 * Note: happy-dom doesn't support requestAnimationFrame properly,
 * so we mock it along with performance.now() and getBoundingClientRect().
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkElementStability,
  waitForElementStable,
  isElementStableSync,
} from './stability.js';

describe('Stability Utilities', () => {
  let container: HTMLDivElement;
  let rafCallbacks: (() => void)[];
  let currentTime: number;
  let originalRaf: typeof requestAnimationFrame;
  let originalPerformance: typeof performance;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    rafCallbacks = [];
    currentTime = 0;

    // Mock requestAnimationFrame
    originalRaf = globalThis.requestAnimationFrame;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = rafCallbacks.length;
      rafCallbacks.push(() => callback(currentTime));
      return id;
    });

    // Mock performance.now
    originalPerformance = globalThis.performance;
    vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  // Helper to advance time and run pending RAF callbacks
  function advanceFrame(ms: number = 16.67) {
    currentTime += ms;
    const callbacks = rafCallbacks.splice(0);
    callbacks.forEach((cb) => cb());
  }

  // Helper to mock getBoundingClientRect
  function mockBoundingRect(element: Element, rect: Partial<DOMRect>) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      top: 0,
      right: 100,
      bottom: 50,
      left: 0,
      toJSON: () => ({}),
      ...rect,
    } as DOMRect);
  }

  describe('checkElementStability', () => {
    it('should return stable for non-moving element', async () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { top: 100, left: 100, width: 200, height: 100 });

      const resultPromise = checkElementStability(element, { frameCount: 2 });

      // First frame - capture initial rect
      advanceFrame(20);
      // Second frame - compare, still same
      advanceFrame(20);
      // Third frame - stable for 2 frames
      advanceFrame(20);

      const result = await resultPromise;
      expect(result.stable).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should detect moving element', async () => {
      const element = document.createElement('div');
      container.appendChild(element);

      let top = 100;
      vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => ({
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        top: top,
        right: 300,
        bottom: top + 100,
        left: 100,
        toJSON: () => ({}),
      } as DOMRect));

      const resultPromise = checkElementStability(element, { frameCount: 2, timeout: 100 });

      // First frame
      advanceFrame(20);

      // Second frame - element moved
      top = 150;
      advanceFrame(20);

      // Third frame - element moved again
      top = 200;
      advanceFrame(20);

      // Continue moving until timeout
      for (let i = 0; i < 10; i++) {
        top += 10;
        advanceFrame(20);
      }

      const result = await resultPromise;
      expect(result.stable).toBe(false);
      expect(result.reason).toBe('timeout');
    });

    it('should detect resizing element', async () => {
      const element = document.createElement('div');
      container.appendChild(element);

      let width = 200;
      vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => ({
        x: 0,
        y: 0,
        width: width,
        height: 100,
        top: 100,
        right: 100 + width,
        bottom: 200,
        left: 100,
        toJSON: () => ({}),
      } as DOMRect));

      const resultPromise = checkElementStability(element, { frameCount: 2, timeout: 100 });

      // First frame
      advanceFrame(20);

      // Second frame - element resized
      width = 250;
      advanceFrame(20);

      // Continue resizing until timeout
      for (let i = 0; i < 10; i++) {
        width += 10;
        advanceFrame(20);
      }

      const result = await resultPromise;
      expect(result.stable).toBe(false);
      expect(result.reason).toBe('timeout');
    });

    it('should return disconnected for detached element', async () => {
      const element = document.createElement('div');
      // Not appended to container - disconnected

      const result = await checkElementStability(element);

      expect(result.stable).toBe(false);
      expect(result.reason).toBe('disconnected');
    });

    it('should handle element becoming disconnected during check', async () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { top: 100, left: 100, width: 200, height: 100 });

      const resultPromise = checkElementStability(element, { frameCount: 3 });

      // First frame - element connected
      advanceFrame(20);

      // Remove element
      element.remove();

      // Second frame - element disconnected
      advanceFrame(20);

      const result = await resultPromise;
      expect(result.stable).toBe(false);
      expect(result.reason).toBe('disconnected');
    });

    it('should respect timeout option', async () => {
      const element = document.createElement('div');
      container.appendChild(element);

      let top = 100;
      vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => ({
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        top: top++, // Always moving
        right: 300,
        bottom: top + 99,
        left: 100,
        toJSON: () => ({}),
      } as DOMRect));

      const shortTimeout = 50;
      const resultPromise = checkElementStability(element, {
        frameCount: 2,
        timeout: shortTimeout,
      });

      // Advance past timeout
      advanceFrame(60);

      const result = await resultPromise;
      expect(result.stable).toBe(false);
      expect(result.reason).toBe('timeout');
    });

    it('should respect custom frame count', async () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { top: 100, left: 100, width: 200, height: 100 });

      const resultPromise = checkElementStability(element, { frameCount: 5 });

      // Need more frames for higher frameCount
      for (let i = 0; i < 6; i++) {
        advanceFrame(20);
      }

      const result = await resultPromise;
      expect(result.stable).toBe(true);
    });

    it('should ignore frames shorter than 15ms (WebKit workaround)', async () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { top: 100, left: 100, width: 200, height: 100 });

      const resultPromise = checkElementStability(element, { frameCount: 2 });

      // First frame - captures initial rect
      advanceFrame(20);

      // Very short frames should be ignored
      advanceFrame(5);
      advanceFrame(5);
      advanceFrame(5);

      // Normal frame
      advanceFrame(20);

      // Another normal frame to complete stability check
      advanceFrame(20);

      const result = await resultPromise;
      expect(result.stable).toBe(true);
    });
  });

  describe('waitForElementStable', () => {
    it('should be an alias for checkElementStability', async () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { top: 100, left: 100, width: 200, height: 100 });

      const resultPromise = waitForElementStable(element, { frameCount: 2 });

      advanceFrame(20);
      advanceFrame(20);
      advanceFrame(20);

      const result = await resultPromise;
      expect(result.stable).toBe(true);
    });
  });

  describe('isElementStableSync', () => {
    it('should return true for connected element with dimensions', () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      expect(isElementStableSync(element)).toBe(true);
    });

    it('should return false for disconnected element', () => {
      const element = document.createElement('div');
      // Not appended - disconnected

      expect(isElementStableSync(element)).toBe(false);
    });

    it('should return false for element with zero dimensions', () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { width: 0, height: 0 });

      expect(isElementStableSync(element)).toBe(false);
    });

    it('should return false for element with zero width', () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { width: 0, height: 50 });

      expect(isElementStableSync(element)).toBe(false);
    });

    it('should return false for element with zero height', () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 0 });

      expect(isElementStableSync(element)).toBe(false);
    });
  });
});
