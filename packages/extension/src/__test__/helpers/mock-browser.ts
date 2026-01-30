/**
 * Mock browser API for testing Chrome extension code.
 */

import { vi } from 'vitest';

type Mock = ReturnType<typeof vi.fn>;

interface MockPort {
  name: string;
  onMessage: {
    addListener: Mock;
    removeListener: Mock;
    hasListener: Mock;
    _listeners: Set<(message: unknown) => void>;
    _triggerMessage: (message: unknown) => void;
  };
  onDisconnect: {
    addListener: Mock;
    removeListener: Mock;
    hasListener: Mock;
    _listeners: Set<() => void>;
    _triggerDisconnect: () => void;
  };
  postMessage: Mock;
  disconnect: Mock;
}

interface MockTab {
  id: number;
  url?: string;
  title?: string;
  active?: boolean;
  windowId?: number;
  groupId?: number;
}

interface MockDebugger {
  attach: Mock;
  detach: Mock;
  sendCommand: Mock;
  onDetach: {
    addListener: Mock;
    removeListener: Mock;
    _listeners: Set<(source: { tabId: number }, reason?: string) => void>;
    _triggerDetach: (tabId: number, reason?: string) => void;
  };
  onEvent: {
    addListener: Mock;
    removeListener: Mock;
    _listeners: Set<(source: { tabId: number }, method: string, params?: unknown) => void>;
    _triggerEvent: (tabId: number, method: string, params?: unknown) => void;
  };
}

export interface MockBrowserAPI {
  runtime: {
    connectNative: Mock;
    connect: Mock;
    sendMessage: Mock;
    getContexts: Mock;
    onMessage: {
      addListener: Mock;
      removeListener: Mock;
    };
    lastError: { message: string } | undefined;
    ContextType: {
      OFFSCREEN_DOCUMENT: string;
    };
  };
  tabs: {
    get: Mock;
    create: Mock;
    remove: Mock;
    update: Mock;
    group: Mock;
    captureVisibleTab: Mock;
    query: Mock;
    _tabs: Map<number, MockTab>;
    _nextId: number;
    _createTab: (props?: Partial<MockTab>) => MockTab;
    _removeTab: (tabId: number) => void;
  };
  tabGroups: {
    update: Mock;
    get: Mock;
    query: Mock;
  };
  debugger: MockDebugger;
  cookies: {
    get: Mock;
    getAll: Mock;
    set: Mock;
    remove: Mock;
  };
  tabCapture: {
    getMediaStreamId: Mock;
  };
  offscreen: {
    createDocument: Mock;
    Reason: {
      USER_MEDIA: string;
    };
  };
  _reset: () => void;
  _setLastError: (message: string | undefined) => void;
}

/**
 * Create a mock browser API for testing.
 */
export function createMockBrowserAPI(): MockBrowserAPI {
  let lastError: { message: string } | undefined;
  const tabs = new Map<number, MockTab>();
  let nextTabId = 1;

  function createMockPort(name: string): MockPort {
    const messageListeners = new Set<(message: unknown) => void>();
    const disconnectListeners = new Set<() => void>();

    return {
      name,
      onMessage: {
        addListener: vi.fn((listener: (message: unknown) => void) => {
          messageListeners.add(listener);
        }),
        removeListener: vi.fn((listener: (message: unknown) => void) => {
          messageListeners.delete(listener);
        }),
        hasListener: vi.fn((listener: (message: unknown) => void) => messageListeners.has(listener)),
        _listeners: messageListeners,
        _triggerMessage: (message: unknown) => {
          for (const listener of messageListeners) {
            listener(message);
          }
        },
      },
      onDisconnect: {
        addListener: vi.fn((listener: () => void) => {
          disconnectListeners.add(listener);
        }),
        removeListener: vi.fn((listener: () => void) => {
          disconnectListeners.delete(listener);
        }),
        hasListener: vi.fn((listener: () => void) => disconnectListeners.has(listener)),
        _listeners: disconnectListeners,
        _triggerDisconnect: () => {
          for (const listener of disconnectListeners) {
            listener();
          }
        },
      },
      postMessage: vi.fn(),
      disconnect: vi.fn(),
    };
  }

  const mockDebugger: MockDebugger = {
    attach: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn().mockResolvedValue({}),
    onDetach: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      _listeners: new Set(),
      _triggerDetach: (tabId: number, reason?: string) => {
        for (const listener of mockDebugger.onDetach._listeners) {
          listener({ tabId }, reason);
        }
      },
    },
    onEvent: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      _listeners: new Set(),
      _triggerEvent: (tabId: number, method: string, params?: unknown) => {
        for (const listener of mockDebugger.onEvent._listeners) {
          listener({ tabId }, method, params);
        }
      },
    },
  };

  mockDebugger.onDetach.addListener.mockImplementation((listener) => {
    mockDebugger.onDetach._listeners.add(listener);
  });
  mockDebugger.onDetach.removeListener.mockImplementation((listener) => {
    mockDebugger.onDetach._listeners.delete(listener);
  });
  mockDebugger.onEvent.addListener.mockImplementation((listener) => {
    mockDebugger.onEvent._listeners.add(listener);
  });
  mockDebugger.onEvent.removeListener.mockImplementation((listener) => {
    mockDebugger.onEvent._listeners.delete(listener);
  });

  const mockBrowser: MockBrowserAPI = {
    runtime: {
      connectNative: vi.fn((name: string) => createMockPort(name)),
      connect: vi.fn(),
      sendMessage: vi.fn(),
      getContexts: vi.fn().mockResolvedValue([]),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      get lastError() {
        return lastError;
      },
      ContextType: {
        OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT',
      },
    },
    tabs: {
      get: vi.fn(async (tabId: number) => {
        const tab = tabs.get(tabId);
        if (!tab) {
          throw new Error(`Tab ${tabId} not found`);
        }
        return tab;
      }),
      create: vi.fn(async (props?: Partial<MockTab>) => {
        const tab: MockTab = {
          id: nextTabId++,
          url: 'about:blank',
          active: true,
          ...props,
        };
        tabs.set(tab.id, tab);
        return tab;
      }),
      remove: vi.fn(async (tabId: number | number[]) => {
        const ids = Array.isArray(tabId) ? tabId : [tabId];
        for (const id of ids) {
          tabs.delete(id);
        }
      }),
      update: vi.fn(async (tabId: number, props: Partial<MockTab>) => {
        const tab = tabs.get(tabId);
        if (tab) {
          Object.assign(tab, props);
        }
        return tab;
      }),
      group: vi.fn(async () => 1),
      captureVisibleTab: vi.fn(async () => 'data:image/png;base64,iVBORw0KGgo='),
      query: vi.fn(async () => Array.from(tabs.values())),
      _tabs: tabs,
      _nextId: nextTabId,
      _createTab: (props?: Partial<MockTab>) => {
        const tab: MockTab = {
          id: nextTabId++,
          url: 'about:blank',
          active: true,
          ...props,
        };
        tabs.set(tab.id, tab);
        return tab;
      },
      _removeTab: (tabId: number) => {
        tabs.delete(tabId);
      },
    },
    tabGroups: {
      update: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ id: 1, title: 'Test', color: 'blue' }),
      query: vi.fn().mockResolvedValue([]),
    },
    debugger: mockDebugger,
    cookies: {
      get: vi.fn().mockResolvedValue(null),
      getAll: vi.fn().mockResolvedValue([]),
      set: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue({}),
    },
    tabCapture: {
      getMediaStreamId: vi.fn((_options, callback) => {
        callback('mock-stream-id');
      }),
    },
    offscreen: {
      createDocument: vi.fn().mockResolvedValue(undefined),
      Reason: {
        USER_MEDIA: 'USER_MEDIA',
      },
    },
    _reset: () => {
      lastError = undefined;
      tabs.clear();
      nextTabId = 1;
      vi.clearAllMocks();
    },
    _setLastError: (message: string | undefined) => {
      lastError = message ? { message } : undefined;
    },
  };

  return mockBrowser;
}

/**
 * Install mock browser API as global `browser` object.
 */
export function installMockBrowser(): MockBrowserAPI {
  const mock = createMockBrowserAPI();
  (globalThis as unknown as { browser: MockBrowserAPI }).browser = mock;
  return mock;
}

/**
 * Uninstall mock browser API.
 */
export function uninstallMockBrowser(): void {
  delete (globalThis as unknown as { browser?: MockBrowserAPI }).browser;
}
