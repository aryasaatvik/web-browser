import { describe, expect, it } from 'vitest';
import { __test__ } from './daemon.js';

describe('daemon helpers', () => {
  it('isAllowedHost should accept localhost/127.0.0.1 with exact port', () => {
    expect(__test__.isAllowedHost('127.0.0.1:49321', 49321)).toBe(true);
    expect(__test__.isAllowedHost('localhost:49321', 49321)).toBe(true);
  });

  it('isAllowedHost should reject unexpected hosts', () => {
    expect(__test__.isAllowedHost(undefined, 49321)).toBe(false);
    expect(__test__.isAllowedHost('example.com:49321', 49321)).toBe(false);
    expect(__test__.isAllowedHost('127.0.0.1:1', 49321)).toBe(false);
  });

  it('injectSessionId should copy args and add sessionId from extra headers', () => {
    const extra = {
      requestInfo: {
        headers: new Headers({ 'mcp-session-id': 'sess_123' }),
      },
    } as any;

    expect(__test__.injectSessionId({ foo: 1 }, extra)).toEqual({ foo: 1, sessionId: 'sess_123' });
    expect(__test__.injectSessionId(undefined, extra)).toEqual({ sessionId: 'sess_123' });
  });
});

