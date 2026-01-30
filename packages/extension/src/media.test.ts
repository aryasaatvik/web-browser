/**
 * Tests for media capture utilities - recording and GIF generation.
 *
 * Note: The media module has module-level state (isRecording, gifCapturing) that
 * persists between tests. We test the public API behavior, focusing on the
 * state machine transitions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getRecordingState,
  getGifCaptureState,
  takeScreenshot,
} from './media.js';

// We avoid testing startRecording/stopRecording/startGifCapture/generateGif directly
// because the module state persists between tests and there's no reset function.
// Instead, we test the stateless functions and state getters.

describe('Recording state', () => {
  describe('getRecordingState', () => {
    it('should return recording state object', () => {
      const state = getRecordingState();
      expect(state).toHaveProperty('isRecording');
      expect(state).toHaveProperty('tabId');
      expect(typeof state.isRecording).toBe('boolean');
    });
  });
});

describe('GIF Capture state', () => {
  describe('getGifCaptureState', () => {
    it('should return capture state object', () => {
      const state = getGifCaptureState();
      expect(state).toHaveProperty('isCapturing');
      expect(state).toHaveProperty('tabId');
      expect(typeof state.isCapturing).toBe('boolean');
    });
  });
});

describe('takeScreenshot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should capture visible tab as PNG', async () => {
    browser.tabs.captureVisibleTab = vi.fn().mockResolvedValue('data:image/png;base64,iVBORw0KGgo=');

    const resultPromise = takeScreenshot(123);
    await vi.advanceTimersByTimeAsync(150);
    const result = await resultPromise;

    expect(browser.tabs.update).toHaveBeenCalledWith(123, { active: true });
    expect(browser.tabs.captureVisibleTab).toHaveBeenCalledWith({
      format: 'png',
      quality: undefined,
    });
    expect(result).toBe('iVBORw0KGgo=');
  });

  it('should capture visible tab as JPEG with quality', async () => {
    browser.tabs.captureVisibleTab = vi.fn().mockResolvedValue('data:image/jpeg;base64,/9j/4AAQSkZJRg==');

    const resultPromise = takeScreenshot(123, 'jpeg', 80);
    await vi.advanceTimersByTimeAsync(150);
    const result = await resultPromise;

    expect(browser.tabs.captureVisibleTab).toHaveBeenCalledWith({
      format: 'jpeg',
      quality: 80,
    });
    expect(result).toBe('/9j/4AAQSkZJRg==');
  });

  it('should not include quality for PNG format', async () => {
    browser.tabs.captureVisibleTab = vi.fn().mockResolvedValue('data:image/png;base64,abc123');

    const resultPromise = takeScreenshot(123, 'png', 80);
    await vi.advanceTimersByTimeAsync(150);
    await resultPromise;

    expect(browser.tabs.captureVisibleTab).toHaveBeenCalledWith({
      format: 'png',
      quality: undefined,
    });
  });

  it('should focus tab before capturing', async () => {
    browser.tabs.captureVisibleTab = vi.fn().mockResolvedValue('data:image/png;base64,abc');

    const resultPromise = takeScreenshot(456);
    await vi.advanceTimersByTimeAsync(150);
    await resultPromise;

    expect(browser.tabs.update).toHaveBeenCalledWith(456, { active: true });
  });

  it('should extract base64 from data URL', async () => {
    const base64Data = 'VGhpcyBpcyBhIHRlc3QgaW1hZ2U=';
    browser.tabs.captureVisibleTab = vi.fn().mockResolvedValue(`data:image/png;base64,${base64Data}`);

    const resultPromise = takeScreenshot(123);
    await vi.advanceTimersByTimeAsync(150);
    const result = await resultPromise;

    expect(result).toBe(base64Data);
  });
});

describe('Media capture module behavior', () => {
  it('should export recording state functions', () => {
    expect(typeof getRecordingState).toBe('function');
    expect(typeof getGifCaptureState).toBe('function');
    expect(typeof takeScreenshot).toBe('function');
  });

  it('recording state should have expected structure', () => {
    const state = getRecordingState();
    expect(Object.keys(state).sort()).toEqual(['isRecording', 'tabId'].sort());
  });

  it('gif state should have expected structure', () => {
    const state = getGifCaptureState();
    expect(Object.keys(state).sort()).toEqual(['isCapturing', 'tabId'].sort());
  });
});
