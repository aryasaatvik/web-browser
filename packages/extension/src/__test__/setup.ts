/**
 * Global test setup for extension tests.
 */

import { afterEach, beforeEach, vi } from 'vitest';
import { installMockBrowser, uninstallMockBrowser, type MockBrowserAPI } from './helpers/mock-browser.js';

declare global {
  // eslint-disable-next-line no-var
  var mockBrowser: MockBrowserAPI;
}

beforeEach(() => {
  // Install fresh mock browser API before each test
  globalThis.mockBrowser = installMockBrowser();
});

afterEach(() => {
  // Clean up mock browser API after each test
  uninstallMockBrowser();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
