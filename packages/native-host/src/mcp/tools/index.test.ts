/**
 * Tests for MCP tool definitions and execution.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getToolDefinitions, executeTool } from './index.js';
import type { BrowserBackend, ToolResult } from '../../backends/types.js';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

// Create a mock backend for testing
function createMockBackend(overrides: Partial<BrowserBackend> = {}): BrowserBackend {
  return {
    name: 'extension',
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    execute: vi.fn().mockResolvedValue({ success: true, data: {} }),
    ...overrides,
  };
}

describe('getToolDefinitions', () => {
  it('should return array of tool definitions', () => {
    const tools = getToolDefinitions();

    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('should include required tool properties', () => {
    const tools = getToolDefinitions();

    for (const tool of tools) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema).toHaveProperty('properties');
    }
  });

  it('should include navigate tool', () => {
    const tools = getToolDefinitions();
    const navigate = tools.find((t) => t.name === 'navigate');

    expect(navigate).toBeDefined();
    expect(navigate?.inputSchema.properties).toHaveProperty('url');
    expect(navigate?.inputSchema.required).toContain('url');
  });

  it('should include computer tool', () => {
    const tools = getToolDefinitions();
    const computer = tools.find((t) => t.name === 'computer');

    expect(computer).toBeDefined();
    expect(computer?.inputSchema.properties).toHaveProperty('action');
    expect(computer?.inputSchema.required).toContain('action');
  });

  it('should include read_page tool', () => {
    const tools = getToolDefinitions();
    const readPage = tools.find((t) => t.name === 'read_page');

    expect(readPage).toBeDefined();
  });

  it('should include form_input tool', () => {
    const tools = getToolDefinitions();
    const formInput = tools.find((t) => t.name === 'form_input');

    expect(formInput).toBeDefined();
    expect(formInput?.inputSchema.required).toContain('ref');
    expect(formInput?.inputSchema.required).toContain('value');
  });

  it('should include javascript tool', () => {
    const tools = getToolDefinitions();
    const javascript = tools.find((t) => t.name === 'javascript');

    expect(javascript).toBeDefined();
    expect(javascript?.inputSchema.required).toContain('script');
  });

  it('should include tab management tools', () => {
    const tools = getToolDefinitions();

    expect(tools.find((t) => t.name === 'tabs_list')).toBeDefined();
    expect(tools.find((t) => t.name === 'tabs_create')).toBeDefined();
    expect(tools.find((t) => t.name === 'tabs_close')).toBeDefined();
    expect(tools.find((t) => t.name === 'tabs_switch')).toBeDefined();
  });

  it('should include cookie tools', () => {
    const tools = getToolDefinitions();

    expect(tools.find((t) => t.name === 'cookies_get')).toBeDefined();
    expect(tools.find((t) => t.name === 'cookies_set')).toBeDefined();
    expect(tools.find((t) => t.name === 'cookies_delete')).toBeDefined();
  });

  it('should include storage tools', () => {
    const tools = getToolDefinitions();

    expect(tools.find((t) => t.name === 'storage_get')).toBeDefined();
    expect(tools.find((t) => t.name === 'storage_set')).toBeDefined();
  });

  it('should include recording tools', () => {
    const tools = getToolDefinitions();

    expect(tools.find((t) => t.name === 'recording_start')).toBeDefined();
    expect(tools.find((t) => t.name === 'recording_stop')).toBeDefined();
    expect(tools.find((t) => t.name === 'gif_export')).toBeDefined();
  });

  it('should include find tool', () => {
    const tools = getToolDefinitions();
    const find = tools.find((t) => t.name === 'find');

    expect(find).toBeDefined();
    expect(find?.inputSchema.required).toContain('query');
  });

  it('should include query_selector tool', () => {
    const tools = getToolDefinitions();
    const querySelector = tools.find((t) => t.name === 'query_selector');

    expect(querySelector).toBeDefined();
    expect(querySelector?.inputSchema.required).toContain('selector');
  });

  it('should include console and network tools', () => {
    const tools = getToolDefinitions();

    expect(tools.find((t) => t.name === 'console_get')).toBeDefined();
    expect(tools.find((t) => t.name === 'network_get')).toBeDefined();
  });
});

describe('executeTool', () => {
  describe('tool routing', () => {
    it('should route navigate to backend', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'navigate', { url: 'https://example.com' });

      expect(backend.execute).toHaveBeenCalledWith('navigate', { url: 'https://example.com' });
    });

    it('should route read_page to snapshot', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'read_page', {});

      expect(backend.execute).toHaveBeenCalledWith('snapshot', {});
    });

    it('should route get_page_text to pagetext', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'get_page_text', {});

      expect(backend.execute).toHaveBeenCalledWith('pagetext', {});
    });

    it('should route form_input to fill', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'form_input', { ref: 'ref_1', value: 'test' });

      expect(backend.execute).toHaveBeenCalledWith('fill', { ref: 'ref_1', value: 'test' });
    });

    it('should route javascript to evaluate', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'javascript', { script: 'return 1' });

      expect(backend.execute).toHaveBeenCalledWith('evaluate', { script: 'return 1' });
    });

    it('should route tabs_list to tab_list', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'tabs_list', {});

      expect(backend.execute).toHaveBeenCalledWith('tab_list', {});
    });

    it('should route tabs_create to tab_new', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'tabs_create', { url: 'https://example.com' });

      expect(backend.execute).toHaveBeenCalledWith('tab_new', { url: 'https://example.com' });
    });

    it('should return error for unknown tool', async () => {
      const backend = createMockBackend();

      const result = await executeTool(backend, 'unknown_tool', {});

      expect(result).toEqual({ success: false, error: 'Unknown tool: unknown_tool' });
      expect(backend.execute).not.toHaveBeenCalled();
    });
  });

  describe('handleComputerTool', () => {
    it('should route click action', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'computer', { action: 'click', ref: 'ref_1' });

      expect(backend.execute).toHaveBeenCalledWith('click', {
        ref: 'ref_1',
        x: undefined,
        y: undefined,
      });
    });

    it('should route click with coordinates', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'computer', { action: 'click', x: 100, y: 200 });

      expect(backend.execute).toHaveBeenCalledWith('click', {
        ref: undefined,
        x: 100,
        y: 200,
      });
    });

    it('should route double_click action', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'computer', { action: 'double_click', ref: 'ref_1' });

      expect(backend.execute).toHaveBeenCalledWith('dblclick', {
        ref: 'ref_1',
        x: undefined,
        y: undefined,
      });
    });

    it('should route triple_click action', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'computer', { action: 'triple_click', ref: 'ref_1' });

      expect(backend.execute).toHaveBeenCalledWith('click', {
        ref: 'ref_1',
        x: undefined,
        y: undefined,
        clickCount: 3,
      });
    });

    it('should route right_click action', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'computer', { action: 'right_click', x: 50, y: 75 });

      expect(backend.execute).toHaveBeenCalledWith('click', {
        ref: undefined,
        x: 50,
        y: 75,
        button: 'right',
      });
    });

    it('should route hover action', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'computer', { action: 'hover', ref: 'ref_2' });

      expect(backend.execute).toHaveBeenCalledWith('hover', {
        ref: 'ref_2',
        x: undefined,
        y: undefined,
      });
    });

    it('should route type action', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'computer', { action: 'type', text: 'Hello World' });

      expect(backend.execute).toHaveBeenCalledWith('type', {
        ref: undefined,
        text: 'Hello World',
      });
    });

    it('should route key action', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'computer', { action: 'key', key: 'Enter' });

      expect(backend.execute).toHaveBeenCalledWith('keyboard', {
        key: 'Enter',
      });
    });

    it('should route scroll down action', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'computer', { action: 'scroll', direction: 'down', amount: 200 });

      expect(backend.execute).toHaveBeenCalledWith('scroll', {
        deltaX: 0,
        deltaY: 200,
        x: undefined,
        y: undefined,
      });
    });

    it('should route scroll up action', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'computer', { action: 'scroll', direction: 'up', amount: 150 });

      expect(backend.execute).toHaveBeenCalledWith('scroll', {
        deltaX: 0,
        deltaY: -150,
        x: undefined,
        y: undefined,
      });
    });

    it('should route scroll left action', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'computer', { action: 'scroll', direction: 'left', amount: 100 });

      expect(backend.execute).toHaveBeenCalledWith('scroll', {
        deltaX: -100,
        deltaY: 0,
        x: undefined,
        y: undefined,
      });
    });

    it('should route scroll right action', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'computer', { action: 'scroll', direction: 'right', amount: 100 });

      expect(backend.execute).toHaveBeenCalledWith('scroll', {
        deltaX: 100,
        deltaY: 0,
        x: undefined,
        y: undefined,
      });
    });

    it('should use default scroll amount', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'computer', { action: 'scroll', direction: 'down' });

      expect(backend.execute).toHaveBeenCalledWith('scroll', {
        deltaX: 0,
        deltaY: 100,
        x: undefined,
        y: undefined,
      });
    });

    it('should route drag action', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'computer', {
        action: 'drag',
        startX: 10,
        startY: 20,
        endX: 100,
        endY: 200,
      });

      expect(backend.execute).toHaveBeenCalledWith('drag', {
        startX: 10,
        startY: 20,
        endX: 100,
        endY: 200,
      });
    });

    it('should use x/y as fallback for drag start', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'computer', {
        action: 'drag',
        x: 10,
        y: 20,
        endX: 100,
        endY: 200,
      });

      expect(backend.execute).toHaveBeenCalledWith('drag', {
        startX: 10,
        startY: 20,
        endX: 100,
        endY: 200,
      });
    });

    it('should route screenshot action', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'computer', { action: 'screenshot' });

      expect(backend.execute).toHaveBeenCalledWith('screenshot', {
        fullPage: undefined,
      });
    });

    it('should route screenshot with fullPage option', async () => {
      const backend = createMockBackend();

      await executeTool(backend, 'computer', { action: 'screenshot', fullPage: true });

      expect(backend.execute).toHaveBeenCalledWith('screenshot', {
        fullPage: true,
      });
    });

    it('should handle wait action', async () => {
      vi.useFakeTimers();

      const backend = createMockBackend();
      const resultPromise = executeTool(backend, 'computer', { action: 'wait', duration: 500 });

      vi.advanceTimersByTime(500);

      const result = await resultPromise;

      expect(result).toEqual({ success: true, data: { waited: 500 } });
      expect(backend.execute).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should use default wait duration', async () => {
      vi.useFakeTimers();

      const backend = createMockBackend();
      const resultPromise = executeTool(backend, 'computer', { action: 'wait' });

      vi.advanceTimersByTime(1000);

      const result = await resultPromise;

      expect(result).toEqual({ success: true, data: { waited: undefined } });

      vi.useRealTimers();
    });

    it('should return error for unknown computer action', async () => {
      const backend = createMockBackend();

      const result = await executeTool(backend, 'computer', { action: 'unknown_action' });

      expect(result).toEqual({ success: false, error: 'Unknown computer action: unknown_action' });
    });
  });

  describe('backend result handling', () => {
    it('should return backend success result', async () => {
      const backend = createMockBackend({
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { url: 'https://example.com', title: 'Example' },
        }),
      });

      const result = await executeTool(backend, 'navigate', { url: 'https://example.com' });

      expect(result).toEqual({
        success: true,
        data: { url: 'https://example.com', title: 'Example' },
      });
    });

    it('should return backend error result', async () => {
      const backend = createMockBackend({
        execute: vi.fn().mockResolvedValue({
          success: false,
          error: 'Navigation failed',
        }),
      });

      const result = await executeTool(backend, 'navigate', { url: 'https://example.com' });

      expect(result).toEqual({
        success: false,
        error: 'Navigation failed',
      });
    });
  });

  describe('recording/gif persistence', () => {
    it('should save recording_stop base64 to the path from recording_start', async () => {
      const tmp = path.join(os.tmpdir(), `web-browser-mcp-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const outPath = path.join(tmp, 'recording.webm');
      const payload = Buffer.from('hello-recording');
      const base64 = payload.toString('base64');

      const backend = createMockBackend({
        execute: vi.fn(async (action: string): Promise<ToolResult> => {
          if (action === 'recording_stop') {
            return { success: true, data: { recording: base64 } };
          }
          return { success: true, data: { ok: true } };
        }),
      });

      await executeTool(backend, 'recording_start', { path: outPath });
      const stop = await executeTool(backend, 'recording_stop', {});

      expect(stop.success).toBe(true);

      const written = await fs.readFile(outPath);
      expect(written.equals(payload)).toBe(true);
    });

    it('should save gif_export base64 to the provided path', async () => {
      const tmp = path.join(os.tmpdir(), `web-browser-mcp-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const outPath = path.join(tmp, 'capture.gif');
      const payload = Buffer.from('gif-bytes');
      const base64 = payload.toString('base64');

      const backend = createMockBackend({
        execute: vi.fn(async (action: string): Promise<ToolResult> => {
          if (action === 'gif_export') {
            return { success: true, data: { gif: base64 } };
          }
          return { success: true, data: {} };
        }),
      });

      const res = await executeTool(backend, 'gif_export', { path: outPath, duration: 1 });
      expect(res.success).toBe(true);

      const written = await fs.readFile(outPath);
      expect(written.equals(payload)).toBe(true);
    });
  });
});

describe('Tool action mappings', () => {
  const tmp = path.join(os.tmpdir(), `web-browser-mcp-mapping-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const argsForTool: Record<string, Record<string, unknown>> = {
    navigate: { url: 'https://example.com' },
    read_page: {},
    get_page_text: {},
    form_input: { ref: 'ref_1', value: 'x' },
    javascript: { script: '1 + 1' },
    tabs_list: {},
    tabs_create: { url: 'https://example.com' },
    tabs_close: { tabId: 1 },
    tabs_switch: { tabId: '1' },
    cookies_get: { url: 'https://example.com' },
    cookies_set: { name: 'a', value: 'b', url: 'https://example.com' },
    cookies_delete: { name: 'a', url: 'https://example.com' },
    storage_get: { type: 'local' },
    storage_set: { type: 'local', key: 'k', value: 'v' },
    recording_start: { path: path.join(tmp, 'recording.webm') },
    recording_stop: {},
    gif_export: { path: path.join(tmp, 'capture.gif'), duration: 1 },
    query_selector: { selector: 'css=body' },
    wait_for_stable: { ref: 'ref_1' },
    check_hit_target: { ref: 'ref_1', x: 1, y: 1 },
    console_get: {},
    network_get: {},
    resize_viewport: { width: 800, height: 600 },
  };

  const actionMappings = [
    ['navigate', 'navigate'],
    ['read_page', 'snapshot'],
    ['get_page_text', 'pagetext'],
    ['form_input', 'fill'],
    ['javascript', 'evaluate'],
    ['tabs_list', 'tab_list'],
    ['tabs_create', 'tab_new'],
    ['tabs_close', 'tab_close'],
    ['tabs_switch', 'tab_switch'],
    ['cookies_get', 'cookies_get'],
    ['cookies_set', 'cookies_set'],
    ['cookies_delete', 'cookies_delete'],
    ['storage_get', 'storage_get'],
    ['storage_set', 'storage_set'],
    ['recording_start', 'recording_start'],
    ['recording_stop', 'recording_stop'],
    ['gif_export', 'gif_export'],
    ['query_selector', 'querySelector'],
    ['wait_for_stable', 'waitForStable'],
    ['check_hit_target', 'checkHitTarget'],
    ['console_get', 'console_get'],
    ['network_get', 'network_get'],
    ['resize_viewport', 'resize_viewport'],
  ] as const;

  for (const [toolName, expectedAction] of actionMappings) {
    it(`should map ${toolName} to ${expectedAction}`, async () => {
      const backend = createMockBackend();

      const toolArgs = argsForTool[toolName] || {};
      await executeTool(backend, toolName, toolArgs);

      expect(backend.execute).toHaveBeenCalledWith(expectedAction, expect.anything());
    });
  }
});
