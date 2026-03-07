import { beforeEach, describe, expect, it, vi } from 'vitest';

let nativeMessageHandler: ((message: unknown) => void) | undefined;

const nativeMock = {
  onMessage: vi.fn((handler: (message: unknown) => void) => {
    nativeMessageHandler = handler;
    return () => {
      nativeMessageHandler = undefined;
    };
  }),
  onBridgeStatus: vi.fn(() => () => {}),
  connect: vi.fn(),
  send: vi.fn(),
};

const tabsMock = {
  isManaged: vi.fn(),
  listTabs: vi.fn(),
  createTab: vi.fn(),
  removeTab: vi.fn(),
  clearGroup: vi.fn(),
  closeTab: vi.fn(),
};

vi.mock('../src/native', async () => {
  const actual = await vi.importActual<typeof import('../src/native')>('../src/native');
  return {
    ...actual,
    native: nativeMock,
  };
});

vi.mock('../src/tabs', async () => {
  const actual = await vi.importActual<typeof import('../src/tabs')>('../src/tabs');
  return {
    ...actual,
    tabs: tabsMock,
  };
});

async function loadBackground(): Promise<void> {
  vi.resetModules();
  nativeMessageHandler = undefined;
  vi.stubGlobal('defineBackground', (config: unknown) => config);

  const mod = await import('../entrypoints/background');
  (mod.default as { main: () => void }).main();
}

function getMockBrowser(): any {
  return globalThis.mockBrowser as any;
}

describe('background network_get', () => {
  beforeEach(async () => {
    nativeMock.onMessage.mockClear();
    nativeMock.onBridgeStatus.mockClear();
    nativeMock.connect.mockClear();
    nativeMock.send.mockClear();
    tabsMock.isManaged.mockReset();
    tabsMock.listTabs.mockReset();
    tabsMock.createTab.mockReset();
    tabsMock.removeTab.mockReset();
    tabsMock.clearGroup.mockReset();
    tabsMock.closeTab.mockReset();

    tabsMock.listTabs.mockResolvedValue([{ id: 7 }]);
    tabsMock.isManaged.mockResolvedValue(true);

    const mockBrowser = getMockBrowser();
    mockBrowser.tabs.onRemoved = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    mockBrowser.tabGroups.onRemoved = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    mockBrowser.debugger.sendCommand.mockImplementation(
      async (_target: { tabId: number }, method: string) => {
        if (method === 'Network.getRequestPostData') {
          return { postData: '{"extension":true}' };
        }

        if (method === 'Network.getResponseBody') {
          return {
            body: 'ZXh0ZW5zaW9uLWJpbmFyeQ==',
            base64Encoded: true,
          };
        }

        return {};
      }
    );

    await loadBackground();
  });

  it('returns enriched network entries and clears history when requested', async () => {
    expect(nativeMessageHandler).toBeTypeOf('function');

    const mockBrowser = getMockBrowser();

    mockBrowser.debugger.onEvent._triggerEvent(7, 'Network.requestWillBeSent', {
      requestId: 'req-1',
      request: {
        url: 'https://example.com/api',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      type: 'Fetch',
      timestamp: 10,
    });
    mockBrowser.debugger.onEvent._triggerEvent(7, 'Network.requestWillBeSentExtraInfo', {
      requestId: 'req-1',
      headers: {
        Authorization: 'Bearer extension',
      },
    });
    mockBrowser.debugger.onEvent._triggerEvent(7, 'Network.responseReceived', {
      requestId: 'req-1',
      response: {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        mimeType: 'application/octet-stream',
        timing: {
          receiveHeadersEnd: 33,
        },
      },
      timestamp: 14,
    });
    mockBrowser.debugger.onEvent._triggerEvent(7, 'Network.responseReceivedExtraInfo', {
      requestId: 'req-1',
      headers: {
        'Set-Cookie': 'session=1',
      },
    });
    mockBrowser.debugger.onEvent._triggerEvent(7, 'Network.loadingFinished', {
      requestId: 'req-1',
      timestamp: 18,
      encodedDataLength: 1024,
    });

    nativeMessageHandler?.({
      type: 'command_request',
      id: 'bridge-1',
      command: {
        id: 'cmd-1',
        action: 'network_get',
        sessionId: 'session-1',
        includeRequestBody: true,
        includeResponseBody: true,
        includeHeaders: true,
        includeTiming: true,
        clear: true,
      },
    });

    await vi.waitFor(() => {
      expect(nativeMock.send).toHaveBeenCalledTimes(1);
    });

    expect(nativeMock.send).toHaveBeenLastCalledWith({
      type: 'command_response',
      id: 'bridge-1',
      response: {
        id: 'cmd-1',
        success: true,
        data: {
          requests: [
            {
              requestId: 'req-1',
              url: 'https://example.com/api',
              method: 'POST',
              status: 200,
              statusText: 'OK',
              type: 'Fetch',
              timestamp: 10,
              responseTimestamp: 14,
              requestHeaders: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer extension',
              },
              responseHeaders: {
                'Content-Type': 'application/octet-stream',
                'Set-Cookie': 'session=1',
              },
              requestBody: {
                content: '{"extension":true}',
                base64Encoded: false,
                mimeType: 'application/json',
                size: new TextEncoder().encode('{"extension":true}').byteLength,
              },
              responseBody: {
                content: 'ZXh0ZW5zaW9uLWJpbmFyeQ==',
                base64Encoded: true,
                mimeType: 'application/octet-stream',
                size: 'extension-binary'.length,
              },
              mimeType: 'application/octet-stream',
              endTimestamp: 18,
              durationMs: 8,
              encodedDataLength: 1024,
              failed: undefined,
              failureReason: undefined,
              timing: {
                receiveHeadersEnd: 33,
              },
            },
          ],
          count: 1,
        },
      },
    });

    nativeMock.send.mockClear();
    nativeMessageHandler?.({
      type: 'command_request',
      id: 'bridge-2',
      command: {
        id: 'cmd-2',
        action: 'network_get',
        sessionId: 'session-1',
      },
    });

    await vi.waitFor(() => {
      expect(nativeMock.send).toHaveBeenCalledTimes(1);
    });

    expect(nativeMock.send).toHaveBeenLastCalledWith({
      type: 'command_response',
      id: 'bridge-2',
      response: {
        id: 'cmd-2',
        success: true,
        data: {
          requests: [],
          count: 0,
        },
      },
    });
  });

  it('keeps partial results when body retrieval fails', async () => {
    const mockBrowser = getMockBrowser();
    mockBrowser.debugger.sendCommand.mockImplementation(
      async (_target: { tabId: number }, method: string) => {
        if (method === 'Network.getResponseBody') {
          throw new Error('response body unavailable');
        }

        return {};
      }
    );

    mockBrowser.debugger.onEvent._triggerEvent(7, 'Network.requestWillBeSent', {
      requestId: 'req-2',
      request: {
        url: 'https://example.com/fail',
        method: 'GET',
      },
      timestamp: 1,
    });
    mockBrowser.debugger.onEvent._triggerEvent(7, 'Network.responseReceived', {
      requestId: 'req-2',
      response: {
        status: 404,
        statusText: 'Not Found',
        mimeType: 'text/plain',
      },
      timestamp: 2,
    });
    mockBrowser.debugger.onEvent._triggerEvent(7, 'Network.loadingFailed', {
      requestId: 'req-2',
      timestamp: 3,
      errorText: 'net::ERR_HTTP_RESPONSE_CODE_FAILURE',
    });

    nativeMessageHandler?.({
      type: 'command_request',
      id: 'bridge-3',
      command: {
        id: 'cmd-3',
        action: 'network_get',
        sessionId: 'session-1',
        includeResponseBody: true,
        includeTiming: true,
      },
    });

    await vi.waitFor(() => {
      expect(nativeMock.send).toHaveBeenCalledTimes(1);
    });

    expect(nativeMock.send).toHaveBeenLastCalledWith({
      type: 'command_response',
      id: 'bridge-3',
      response: {
        id: 'cmd-3',
        success: true,
        data: {
          requests: [
            {
              requestId: 'req-2',
              url: 'https://example.com/fail',
              method: 'GET',
              status: 404,
              statusText: 'Not Found',
              type: undefined,
              timestamp: 1,
              responseTimestamp: 2,
              responseBody: {
                content: '',
                base64Encoded: false,
                mimeType: 'text/plain',
                error: 'response body unavailable',
              },
              mimeType: 'text/plain',
              endTimestamp: 3,
              durationMs: 2,
              encodedDataLength: undefined,
              failed: true,
              failureReason: 'net::ERR_HTTP_RESPONSE_CODE_FAILURE',
              timing: undefined,
            },
          ],
          count: 1,
        },
      },
    });
  });
});
