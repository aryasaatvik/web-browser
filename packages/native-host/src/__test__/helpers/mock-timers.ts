/**
 * Timer utilities for testing retry and backoff logic.
 */

import { vi, type MockInstance } from 'vitest';

interface MockTimers {
  setTimeout: MockInstance;
  clearTimeout: MockInstance;
  setInterval: MockInstance;
  clearInterval: MockInstance;
  advanceTimersByTime: (ms: number) => void;
  advanceTimersByTimeAsync: (ms: number) => Promise<void>;
  advanceTimersToNextTimer: () => void;
  advanceTimersToNextTimerAsync: () => Promise<void>;
  runAllTimers: () => void;
  runAllTimersAsync: () => Promise<void>;
  runOnlyPendingTimers: () => void;
  runOnlyPendingTimersAsync: () => Promise<void>;
  getTimerCount: () => number;
  cleanup: () => void;
}

/**
 * Set up mock timers for testing retry/backoff logic.
 * Returns control functions for advancing time.
 */
export function setupMockTimers(): MockTimers {
  vi.useFakeTimers();

  return {
    setTimeout: vi.spyOn(globalThis, 'setTimeout'),
    clearTimeout: vi.spyOn(globalThis, 'clearTimeout'),
    setInterval: vi.spyOn(globalThis, 'setInterval'),
    clearInterval: vi.spyOn(globalThis, 'clearInterval'),

    advanceTimersByTime(ms: number): void {
      vi.advanceTimersByTime(ms);
    },

    async advanceTimersByTimeAsync(ms: number): Promise<void> {
      await vi.advanceTimersByTimeAsync(ms);
    },

    advanceTimersToNextTimer(): void {
      vi.advanceTimersToNextTimer();
    },

    async advanceTimersToNextTimerAsync(): Promise<void> {
      await vi.advanceTimersToNextTimerAsync();
    },

    runAllTimers(): void {
      vi.runAllTimers();
    },

    async runAllTimersAsync(): Promise<void> {
      await vi.runAllTimersAsync();
    },

    runOnlyPendingTimers(): void {
      vi.runOnlyPendingTimers();
    },

    async runOnlyPendingTimersAsync(): Promise<void> {
      await vi.runOnlyPendingTimersAsync();
    },

    getTimerCount(): number {
      return vi.getTimerCount();
    },

    cleanup(): void {
      vi.useRealTimers();
      vi.restoreAllMocks();
    },
  };
}

/**
 * Helper to wait for next tick while using fake timers.
 */
export function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/**
 * Helper to flush all pending promises/microtasks.
 */
export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Calculate expected backoff delays with exponential growth.
 */
export function calculateBackoffDelays(
  initial: number,
  max: number,
  multiplier: number,
  count: number
): number[] {
  const delays: number[] = [];
  let delay = initial;
  for (let i = 0; i < count; i++) {
    delays.push(delay);
    delay = Math.min(delay * multiplier, max);
  }
  return delays;
}
