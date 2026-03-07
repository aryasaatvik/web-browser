import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CdpBackend } from './cdp.js';

describe('CdpBackend network_get', () => {
  let backend: CdpBackend;

  beforeEach(() => {
    backend = new CdpBackend();
  });

  it('returns the legacy metadata-only shape by default', async () => {
    const internal = backend as any;

    internal.handleEvent('Network.requestWillBeSent', {
      requestId: 'req-1',
      request: {
        url: 'https://example.com/api',
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      },
      type: 'Fetch',
      timestamp: 10,
    });
    internal.handleEvent('Network.responseReceived', {
      requestId: 'req-1',
      response: {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'application/json',
        },
        mimeType: 'application/json',
        timing: {
          receiveHeadersEnd: 5,
        },
      },
      timestamp: 15,
    });
    internal.handleEvent('Network.loadingFinished', {
      requestId: 'req-1',
      timestamp: 20,
      encodedDataLength: 256,
    });

    const result = await internal.getNetworkRequests({});

    expect(result).toEqual({
      requests: [
        {
          requestId: 'req-1',
          url: 'https://example.com/api',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          type: 'Fetch',
          timestamp: 10,
          responseTimestamp: 15,
        },
      ],
      count: 1,
    });
  });

  it('enriches requests with headers, bodies, and timing data on demand', async () => {
    const internal = backend as any;
    internal.sendCommand = vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === 'Network.getRequestPostData') {
        expect(params).toEqual({ requestId: 'req-1' });
        return { postData: '{"hello":"world"}' };
      }

      if (method === 'Network.getResponseBody') {
        expect(params).toEqual({ requestId: 'req-1' });
        return { body: '{"ok":true}', base64Encoded: false };
      }

      throw new Error(`Unexpected method: ${method}`);
    });

    internal.handleEvent('Network.requestWillBeSent', {
      requestId: 'req-1',
      request: {
        url: 'https://example.com/api',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      type: 'XHR',
      timestamp: 100,
    });
    internal.handleEvent('Network.requestWillBeSentExtraInfo', {
      requestId: 'req-1',
      headers: {
        Authorization: 'Bearer test',
      },
    });
    internal.handleEvent('Network.responseReceived', {
      requestId: 'req-1',
      response: {
        status: 201,
        statusText: 'Created',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        mimeType: 'application/json',
        timing: {
          receiveHeadersEnd: 42,
        },
      },
      timestamp: 150,
    });
    internal.handleEvent('Network.responseReceivedExtraInfo', {
      requestId: 'req-1',
      headers: {
        'Set-Cookie': 'session=1',
      },
    });
    internal.handleEvent('Network.loadingFinished', {
      requestId: 'req-1',
      timestamp: 200,
      encodedDataLength: 512,
    });

    const result = await internal.getNetworkRequests({
      includeRequestBody: true,
      includeResponseBody: true,
      includeHeaders: true,
      includeTiming: true,
    });

    expect(result.count).toBe(1);
    expect(result.requests[0]).toEqual({
      requestId: 'req-1',
      url: 'https://example.com/api',
      method: 'POST',
      status: 201,
      statusText: 'Created',
      type: 'XHR',
      timestamp: 100,
      responseTimestamp: 150,
      requestHeaders: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test',
      },
      responseHeaders: {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': 'session=1',
      },
      requestBody: {
        content: '{"hello":"world"}',
        base64Encoded: false,
        mimeType: 'application/json',
        size: Buffer.byteLength('{"hello":"world"}', 'utf8'),
      },
      responseBody: {
        content: '{"ok":true}',
        base64Encoded: false,
        mimeType: 'application/json',
        size: Buffer.byteLength('{"ok":true}', 'utf8'),
      },
      mimeType: 'application/json',
      endTimestamp: 200,
      durationMs: 100,
      encodedDataLength: 512,
      failed: undefined,
      failureReason: undefined,
      timing: {
        receiveHeadersEnd: 42,
      },
    });
  });

  it('returns per-request body errors and binary payloads without failing the call', async () => {
    const internal = backend as any;
    internal.sendCommand = vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === 'Network.getRequestPostData') {
        throw new Error(`missing request body for ${String(params?.requestId)}`);
      }

      if (method === 'Network.getResponseBody') {
        return {
          body: Buffer.from('binary-response').toString('base64'),
          base64Encoded: true,
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    });

    internal.handleEvent('Network.requestWillBeSent', {
      requestId: 'req-2',
      request: {
        url: 'https://example.com/upload',
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      },
      timestamp: 1,
    });
    internal.handleEvent('Network.responseReceived', {
      requestId: 'req-2',
      response: {
        status: 500,
        statusText: 'Server Error',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        mimeType: 'application/octet-stream',
      },
      timestamp: 2,
    });
    internal.handleEvent('Network.loadingFailed', {
      requestId: 'req-2',
      timestamp: 3,
      errorText: 'net::ERR_ABORTED',
    });

    const result = await internal.getNetworkRequests({
      includeRequestBody: true,
      includeResponseBody: true,
      includeTiming: true,
    });

    expect(result).toEqual({
      requests: [
        {
          requestId: 'req-2',
          url: 'https://example.com/upload',
          method: 'POST',
          status: 500,
          statusText: 'Server Error',
          type: undefined,
          timestamp: 1,
          responseTimestamp: 2,
          requestBody: {
            content: '',
            base64Encoded: false,
            mimeType: 'application/octet-stream',
            error: 'missing request body for req-2',
          },
          responseBody: {
            content: Buffer.from('binary-response').toString('base64'),
            base64Encoded: true,
            mimeType: 'application/octet-stream',
            size: Buffer.byteLength('binary-response', 'utf8'),
          },
          mimeType: 'application/octet-stream',
          endTimestamp: 3,
          durationMs: 2,
          encodedDataLength: undefined,
          failed: true,
          failureReason: 'net::ERR_ABORTED',
          timing: undefined,
        },
      ],
      count: 1,
    });
  });
});
