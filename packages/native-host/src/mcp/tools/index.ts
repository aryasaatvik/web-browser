/**
 * MCP Tool definitions and execution.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BrowserBackend, ToolResult } from '../../backends/types.js';
import { findElements } from '../../ai/find.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Get all tool definitions.
 */
export function getToolDefinitions(): ToolDefinition[] {
  return [
    // Navigation
    {
      name: 'navigate',
      description: 'Navigate to a URL in the browser',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to navigate to',
          },
        },
        required: ['url'],
      },
    },

    // Computer tool (mouse, keyboard, screenshot)
    {
      name: 'computer',
      description: 'Control the browser with mouse, keyboard, and screenshot actions',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'click',
              'double_click',
              'triple_click',
              'right_click',
              'hover',
              'scroll',
              'drag',
              'type',
              'key',
              'screenshot',
              'wait',
            ],
            description: 'The action to perform',
          },
          ref: {
            type: 'string',
            description: 'Element reference ID (from read_page)',
          },
          x: {
            type: 'number',
            description: 'X coordinate (if not using ref)',
          },
          y: {
            type: 'number',
            description: 'Y coordinate (if not using ref)',
          },
          text: {
            type: 'string',
            description: 'Text to type (for type action)',
          },
          key: {
            type: 'string',
            description: 'Key to press (for key action)',
          },
          direction: {
            type: 'string',
            enum: ['up', 'down', 'left', 'right'],
            description: 'Scroll direction',
          },
          amount: {
            type: 'number',
            description: 'Scroll amount in pixels',
          },
          duration: {
            type: 'number',
            description: 'Wait duration in milliseconds',
          },
        },
        required: ['action'],
      },
    },

    // Read page (accessibility tree)
    {
      name: 'read_page',
      description: 'Get the accessibility tree of the current page with element references',
      inputSchema: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector to scope the tree to (optional)',
          },
          interactiveOnly: {
            type: 'boolean',
            description: 'Only include interactive elements',
          },
        },
      },
    },

    // Get page text
    {
      name: 'get_page_text',
      description: 'Get the plain text content of the current page',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },

    // Form input
    {
      name: 'form_input',
      description: 'Set the value of a form field',
      inputSchema: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'Element reference ID',
          },
          value: {
            type: 'string',
            description: 'Value to set',
          },
        },
        required: ['ref', 'value'],
      },
    },

    // JavaScript execution
    {
      name: 'javascript',
      description: 'Execute JavaScript in the page context',
      inputSchema: {
        type: 'object',
        properties: {
          script: {
            type: 'string',
            description: 'JavaScript code to execute',
          },
        },
        required: ['script'],
      },
    },

    // Tabs
    {
      name: 'tabs_list',
      description: 'List all managed browser tabs',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },

    // MCP bootstrap aliases (Claude-style tab context)
    {
      name: 'tabs_context_mcp',
      description:
        'Get context information about the current MCP session tab group. Use this at least once before other browser tools. If createIfEmpty is true and no managed tabs exist, a new tab will be created.',
      inputSchema: {
        type: 'object',
        properties: {
          createIfEmpty: {
            type: 'boolean',
            description: 'Create a new managed tab (and tab group) if none exist for this session.',
          },
        },
      },
    },

    {
      name: 'tabs_create',
      description: 'Create a new browser tab',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL to open in the new tab',
          },
        },
      },
    },

    {
      name: 'tabs_create_mcp',
      description: 'Create a new empty tab in the MCP session tab group',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL to open in the new tab',
          },
        },
      },
    },

    {
      name: 'tabs_close',
      description: 'Close a browser tab',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: {
            type: 'number',
            description: 'ID of the tab to close',
          },
        },
      },
    },

    // Cookies
    {
      name: 'cookies_get',
      description: 'Get cookies for a URL or domain',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL to get cookies for',
          },
        },
      },
    },

    {
      name: 'cookies_set',
      description: 'Set a cookie',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Cookie name',
          },
          value: {
            type: 'string',
            description: 'Cookie value',
          },
          domain: {
            type: 'string',
            description: 'Cookie domain',
          },
          path: {
            type: 'string',
            description: 'Cookie path',
          },
        },
        required: ['name', 'value'],
      },
    },

    // Storage
    {
      name: 'storage_get',
      description: 'Get localStorage or sessionStorage values',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['local', 'session'],
            description: 'Storage type',
          },
          key: {
            type: 'string',
            description: 'Key to get (omit to get all)',
          },
        },
        required: ['type'],
      },
    },

    {
      name: 'storage_set',
      description: 'Set localStorage or sessionStorage value',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['local', 'session'],
            description: 'Storage type',
          },
          key: {
            type: 'string',
            description: 'Key to set',
          },
          value: {
            type: 'string',
            description: 'Value to set',
          },
        },
        required: ['type', 'key', 'value'],
      },
    },

    // Recording
    {
      name: 'recording_start',
      description: 'Start recording the browser tab',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to save the recording',
          },
        },
        required: ['path'],
      },
    },

    {
      name: 'recording_stop',
      description: 'Stop recording and save the video',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },

    {
      name: 'gif_export',
      description: 'Export recent frames as a GIF',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to save the GIF',
          },
          duration: {
            type: 'number',
            description: 'Duration in seconds',
          },
        },
        required: ['path'],
      },
    },

    // AI-powered find
    {
      name: 'find',
      description: 'Find elements using natural language description. Uses AI to match elements in the accessibility tree.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language description of the element to find (e.g., "the login button", "email input field")',
          },
          includeScreenshot: {
            type: 'boolean',
            description: 'Include a screenshot for visual context (improves accuracy but slower)',
          },
        },
        required: ['query'],
      },
    },

    // Playwright-style selector query
    {
      name: 'query_selector',
      description: 'Find elements using Playwright-style selectors. Supports css=, xpath=, text=, role=, and >> chaining.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'Selector expression (e.g., "text=Login", "css=button.primary", "role=button >> text=Submit")',
          },
          all: {
            type: 'boolean',
            description: 'Return all matching elements instead of just the first',
          },
        },
        required: ['selector'],
      },
    },

    // DOM stability check
    {
      name: 'wait_for_stable',
      description: 'Wait for an element to stop moving or resizing. Useful before interacting with animated elements.',
      inputSchema: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'Element reference ID (from read_page or query_selector)',
          },
          timeout: {
            type: 'number',
            description: 'Maximum time to wait in milliseconds (default: 5000)',
          },
        },
        required: ['ref'],
      },
    },

    // Hit target verification
    {
      name: 'check_hit_target',
      description: 'Verify that a click at given coordinates will hit the expected element. Detects overlays and intercepting elements.',
      inputSchema: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'Element reference ID we expect to hit',
          },
          x: {
            type: 'number',
            description: 'X coordinate to check',
          },
          y: {
            type: 'number',
            description: 'Y coordinate to check',
          },
        },
        required: ['ref', 'x', 'y'],
      },
    },

    // Console messages
    {
      name: 'console_get',
      description: 'Read browser console messages (logs, warnings, errors). Useful for debugging JavaScript errors.',
      inputSchema: {
        type: 'object',
        properties: {
          level: {
            type: 'string',
            enum: ['log', 'warning', 'error', 'info', 'debug'],
            description: 'Filter by log level',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of messages to return',
          },
          clear: {
            type: 'boolean',
            description: 'Clear messages after retrieval',
          },
        },
      },
    },

    // Network requests
    {
      name: 'network_get',
      description: 'Read HTTP network requests made by the page. Useful for debugging API calls.',
      inputSchema: {
        type: 'object',
        properties: {
          urlPattern: {
            type: 'string',
            description: 'Regex pattern to filter requests by URL',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of requests to return',
          },
          clear: {
            type: 'boolean',
            description: 'Clear requests after retrieval',
          },
        },
      },
    },

    // Viewport resize
    {
      name: 'resize_viewport',
      description: 'Resize the browser viewport to specified dimensions. Useful for responsive testing.',
      inputSchema: {
        type: 'object',
        properties: {
          width: {
            type: 'number',
            description: 'Viewport width in pixels',
          },
          height: {
            type: 'number',
            description: 'Viewport height in pixels',
          },
          deviceScaleFactor: {
            type: 'number',
            description: 'Device scale factor (default: 1)',
          },
          mobile: {
            type: 'boolean',
            description: 'Emulate mobile device (default: false)',
          },
        },
        required: ['width', 'height'],
      },
    },

    // Tab switch
    {
      name: 'tabs_switch',
      description: 'Switch to a different browser tab',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: 'ID of the tab to switch to',
          },
        },
        required: ['tabId'],
      },
    },

    // Cookie delete
    {
      name: 'cookies_delete',
      description: 'Delete a cookie by name',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Cookie name to delete',
          },
          url: {
            type: 'string',
            description: 'URL associated with the cookie',
          },
          domain: {
            type: 'string',
            description: 'Cookie domain',
          },
        },
        required: ['name'],
      },
    },
  ];
}

/**
 * Execute a tool with the given backend.
 */
export async function executeTool(
  backend: BrowserBackend,
  tool: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  // Map MCP tool names to backend action names
  const actionMap: Record<string, string> = {
    navigate: 'navigate',
    computer: 'computer',
    read_page: 'snapshot',
    get_page_text: 'pagetext',
    form_input: 'fill',
    javascript: 'evaluate',
    tabs_list: 'tab_list',
    tabs_context_mcp: 'tab_list',
    tabs_create: 'tab_new',
    tabs_create_mcp: 'tab_new',
    tabs_close: 'tab_close',
    tabs_switch: 'tab_switch',
    cookies_get: 'cookies_get',
    cookies_set: 'cookies_set',
    cookies_delete: 'cookies_delete',
    storage_get: 'storage_get',
    storage_set: 'storage_set',
    recording_start: 'recording_start',
    recording_stop: 'recording_stop',
    gif_export: 'gif_export',
    query_selector: 'querySelector',
    wait_for_stable: 'waitForStable',
    check_hit_target: 'checkHitTarget',
    console_get: 'console_get',
    network_get: 'network_get',
    resize_viewport: 'resize_viewport',
  };

  const action = actionMap[tool];
  if (!action) {
    return { success: false, error: `Unknown tool: ${tool}` };
  }

  // Special handling for tabs_context_mcp: optionally create a tab when empty.
  if (tool === 'tabs_context_mcp') {
    const createIfEmpty = args.createIfEmpty === true;
    const list1 = await backend.execute(action, args);
    if (!createIfEmpty) return list1;

    const tabs = (list1.success && list1.data && typeof list1.data === 'object')
      ? (list1.data as { tabs?: unknown[] }).tabs
      : undefined;

    if (Array.isArray(tabs) && tabs.length > 0) return list1;

    // Create a new tab for this MCP session, then re-list.
    await backend.execute('tab_new', { sessionId: args.sessionId });
    return backend.execute(action, args);
  }

  // Special handling for computer tool
  if (tool === 'computer') {
    return handleComputerTool(backend, args);
  }

  // Special handling for find tool
  if (tool === 'find') {
    return handleFindTool(backend, args);
  }

  // Special handling for recording tools: persist to disk (path comes from MCP args).
  if (tool === 'recording_start') {
    return handleRecordingStart(backend, action, args);
  }

  if (tool === 'recording_stop') {
    return handleRecordingStop(backend, action, args);
  }

  if (tool === 'gif_export') {
    return handleGifExport(backend, action, args);
  }

  return backend.execute(action, args);
}

let recordingOutputPath: string | null = null;

function extractBase64(data: unknown, keys: string[]): string | null {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'string' && val) return val;
  }
  return null;
}

async function writeBase64File(filePath: string, base64: string): Promise<number> {
  // Ensure parent dir exists when a nested path is provided.
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const buf = Buffer.from(base64, 'base64');
  await fs.writeFile(filePath, buf);
  return buf.byteLength;
}

async function handleRecordingStart(
  backend: BrowserBackend,
  action: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const outPath = args.path;
  if (typeof outPath !== 'string' || !outPath.trim()) {
    return { success: false, error: 'recording_start requires a non-empty "path"' };
  }

  recordingOutputPath = outPath;
  return backend.execute(action, args);
}

async function handleRecordingStop(
  backend: BrowserBackend,
  action: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const result = await backend.execute(action, args);
  if (!result.success) return result;

  const outPath = recordingOutputPath;
  const base64 = extractBase64(result.data, ['recording', 'base64', 'data']);

  // If we don't have a path or base64, just return backend output.
  if (!outPath || !base64) {
    recordingOutputPath = null;
    return result;
  }

  const bytes = await writeBase64File(outPath, base64);
  recordingOutputPath = null;
  return { success: true, data: { saved: true, path: outPath, bytes } };
}

async function handleGifExport(
  backend: BrowserBackend,
  action: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const outPath = args.path;
  if (typeof outPath !== 'string' || !outPath.trim()) {
    return { success: false, error: 'gif_export requires a non-empty "path"' };
  }

  const result = await backend.execute(action, args);
  if (!result.success) return result;

  const base64 = extractBase64(result.data, ['gif', 'base64', 'data']);
  if (!base64) return result;

  const bytes = await writeBase64File(outPath, base64);
  return { success: true, data: { saved: true, path: outPath, bytes } };
}

async function handleFindTool(
  backend: BrowserBackend,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    // Get the accessibility tree
    const treeResult = await backend.execute('snapshot', {});
    if (!treeResult.success || !treeResult.data) {
      return { success: false, error: 'Failed to get accessibility tree' };
    }

    const accessibilityTree = typeof treeResult.data === 'string'
      ? treeResult.data
      : (treeResult.data as { snapshot?: string }).snapshot || JSON.stringify(treeResult.data);

    // Optionally get screenshot
    let screenshot: string | undefined;
    if (args.includeScreenshot) {
      const screenshotResult = await backend.execute('screenshot', {});
      if (screenshotResult.success && screenshotResult.data) {
        screenshot = (screenshotResult.data as { base64?: string }).base64;
      }
    }

    // Find elements using AI
    const result = await findElements({
      query: args.query as string,
      accessibilityTree,
      screenshot,
    });

    return {
      success: true,
      data: {
        refs: result.refs,
        confidence: result.confidence,
        reasoning: result.reasoning,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

async function handleComputerTool(
  backend: BrowserBackend,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const action = args.action as string;

  switch (action) {
    case 'click':
      return backend.execute('click', {
        ref: args.ref,
        x: args.x,
        y: args.y,
      });

    case 'double_click':
      return backend.execute('dblclick', {
        ref: args.ref,
        x: args.x,
        y: args.y,
      });

    case 'triple_click':
      return backend.execute('click', {
        ref: args.ref,
        x: args.x,
        y: args.y,
        clickCount: 3,
      });

    case 'right_click':
      return backend.execute('click', {
        ref: args.ref,
        x: args.x,
        y: args.y,
        button: 'right',
      });

    case 'hover':
      return backend.execute('hover', {
        ref: args.ref,
        x: args.x,
        y: args.y,
      });

    case 'type':
      return backend.execute('type', {
        ref: args.ref,
        text: args.text,
      });

    case 'key':
      return backend.execute('keyboard', {
        key: args.key,
      });

    case 'scroll': {
      // Convert direction to deltaX/deltaY
      const amount = (args.amount as number) || 100;
      let deltaX = 0;
      let deltaY = 0;

      switch (args.direction) {
        case 'up':
          deltaY = -amount;
          break;
        case 'down':
          deltaY = amount;
          break;
        case 'left':
          deltaX = -amount;
          break;
        case 'right':
          deltaX = amount;
          break;
      }

      return backend.execute('scroll', {
        deltaX,
        deltaY,
        x: args.x,
        y: args.y,
      });
    }

    case 'drag':
      // Drag from start to end coordinates
      return backend.execute('drag', {
        startX: args.startX || args.x,
        startY: args.startY || args.y,
        endX: args.endX,
        endY: args.endY,
      });

    case 'screenshot':
      return backend.execute('screenshot', {
        fullPage: args.fullPage,
      });

    case 'wait':
      await new Promise((resolve) => setTimeout(resolve, (args.duration as number) || 1000));
      return { success: true, data: { waited: args.duration } };

    default:
      return { success: false, error: `Unknown computer action: ${action}` };
  }
}
