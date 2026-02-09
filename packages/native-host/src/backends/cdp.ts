/**
 * CDP (Chrome DevTools Protocol) backend.
 * Connects directly to a Chrome instance via CDP WebSocket.
 *
 * This backend injects @web-browser/core into pages for full DOM operations,
 * using CDP only for input dispatch and screenshots.
 */

import WebSocket from 'ws';
import type { BrowserBackend, ToolResult, ConnectOptions } from './types.js';
import { coreBundleSource } from '@web-browser/core/browser-bundle';

/**
 * Resolve a CDP WebSocket URL from common user inputs.
 *
 * Chrome's remote debugging port is an HTTP server. A bare `ws://host:port`
 * is not a valid CDP websocket endpoint. When given a bare host:port (either
 * as `ws://host:port` or `http://host:port`), resolve it via `/json/version`.
 */
async function resolveCdpWebSocketUrl(input: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(input);
  } catch (err) {
    throw new Error(
      `Invalid CDP URL "${input}". Expected a full CDP websocket URL like ` +
        `"ws://127.0.0.1:9222/devtools/browser/<id>" or a remote-debugging ` +
        `origin like "http://127.0.0.1:9222".`
    );
  }

  // Already a full CDP websocket URL.
  if ((url.protocol === 'ws:' || url.protocol === 'wss:') && url.pathname && url.pathname !== '/') {
    return url.toString();
  }

  // For http(s) origins, also resolve via /json/version.
  const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
  const isWsOrigin = (url.protocol === 'ws:' || url.protocol === 'wss:') && (url.pathname === '' || url.pathname === '/');

  if (!isHttp && !isWsOrigin) {
    // ws://... with a non-root pathname was handled above; anything else is unexpected.
    return url.toString();
  }

  const versionUrl = new URL(url.toString());
  // Map ws -> http and wss -> https for the version endpoint.
  if (versionUrl.protocol === 'ws:') versionUrl.protocol = 'http:';
  if (versionUrl.protocol === 'wss:') versionUrl.protocol = 'https:';
  versionUrl.pathname = '/json/version';
  versionUrl.search = '';
  versionUrl.hash = '';

  const res = await fetch(versionUrl.toString());
  if (!res.ok) {
    throw new Error(`Failed to fetch CDP version metadata from ${versionUrl} (${res.status})`);
  }

  const meta = (await res.json()) as { webSocketDebuggerUrl?: unknown };
  const wsUrl = meta.webSocketDebuggerUrl;
  if (typeof wsUrl !== 'string' || !wsUrl) {
    throw new Error(`CDP version metadata from ${versionUrl} did not include "webSocketDebuggerUrl"`);
  }

  return wsUrl;
}

interface ConsoleMessage {
  level: 'log' | 'warning' | 'error' | 'info' | 'debug';
  text: string;
  timestamp: number;
  url?: string;
  lineNumber?: number;
}

interface NetworkRequest {
  requestId: string;
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  type?: string;
  timestamp: number;
  responseTimestamp?: number;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

interface CoreResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  size: number;
  httpOnly: boolean;
  secure: boolean;
  session: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

interface CDPCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  size: number;
  httpOnly: boolean;
  secure: boolean;
  session: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

interface TabInfo {
  id: string;
  url: string;
  title: string;
}

interface TargetInfo {
  targetId: string;
  type: string;
  url: string;
  title: string;
}

interface TabData {
  targetId: string;
  sessionId: string;
  url: string;
  title: string;
}

export class CdpBackend implements BrowserBackend {
  readonly name = 'cdp' as const;

  private ws: WebSocket | null = null;
  private pending = new Map<number, PendingRequest>();
  private requestId = 0;
  private sessionId: string | null = null;
  private targetId: string | null = null;
  private coreInjected = false;

  // Console monitoring
  private consoleMessages: ConsoleMessage[] = [];
  private consoleEnabled = false;

  // Network monitoring
  private networkRequests: NetworkRequest[] = [];
  private networkEnabled = false;

  // Tab management
  private tabs = new Map<string, TabData>();
  private activeTargetId: string | null = null;

  async connect(options?: ConnectOptions): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    if (!options?.url) {
      throw new Error('CDP URL is required');
    }

    const resolvedUrl = await resolveCdpWebSocketUrl(options.url);
    await this.connectWebSocket(resolvedUrl);
    await this.attachToTarget();
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    for (const [id, pending] of this.pending.entries()) {
      pending.reject(new Error('Disconnected'));
      this.pending.delete(id);
    }

    this.sessionId = null;
    this.targetId = null;
    this.coreInjected = false;
    this.consoleMessages = [];
    this.consoleEnabled = false;
    this.networkRequests = [];
    this.networkEnabled = false;
    this.tabs.clear();
    this.activeTargetId = null;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async execute(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const result = await this.handleTool(tool, args);
      return { success: true, data: result };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async connectWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);

      ws.on('open', () => {
        this.ws = ws;
        resolve();
      });

      ws.on('error', reject);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch {
          // Ignore parse errors
        }
      });

      ws.on('close', () => {
        if (this.ws === ws) {
          this.ws = null;
        }
      });
    });
  }

  private handleMessage(message: Record<string, unknown>): void {
    // Handle response to a request
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;

      this.pending.delete(message.id);

      if (message.error) {
        const err = message.error as { message?: string };
        pending.reject(new Error(err.message || 'CDP error'));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    // Handle CDP events (no id field)
    if (typeof message.method === 'string') {
      this.handleEvent(message.method, (message.params as Record<string, unknown>) || {});
    }
  }

  private handleEvent(method: string, params: Record<string, unknown>): void {
    switch (method) {
      case 'Log.entryAdded':
        this.handleLogEntry(params);
        break;
      case 'Network.requestWillBeSent':
        this.handleNetworkRequest(params);
        break;
      case 'Network.responseReceived':
        this.handleNetworkResponse(params);
        break;
    }
  }

  private handleLogEntry(params: Record<string, unknown>): void {
    const entry = params.entry as
      | {
          level?: string;
          text?: string;
          timestamp?: number;
          url?: string;
          lineNumber?: number;
        }
      | undefined;

    if (!entry) return;

    const levelMap: Record<string, ConsoleMessage['level']> = {
      verbose: 'debug',
      info: 'info',
      warning: 'warning',
      error: 'error',
    };

    this.consoleMessages.push({
      level: levelMap[entry.level || 'info'] || 'log',
      text: entry.text || '',
      timestamp: entry.timestamp || Date.now(),
      url: entry.url,
      lineNumber: entry.lineNumber,
    });
  }

  private handleNetworkRequest(params: Record<string, unknown>): void {
    const request = params.request as
      | {
          url?: string;
          method?: string;
        }
      | undefined;

    if (!request) return;

    this.networkRequests.push({
      requestId: params.requestId as string,
      url: request.url || '',
      method: request.method || 'GET',
      type: params.type as string | undefined,
      timestamp: (params.timestamp as number) || Date.now(),
    });
  }

  private handleNetworkResponse(params: Record<string, unknown>): void {
    const requestId = params.requestId as string;
    const response = params.response as
      | {
          status?: number;
          statusText?: string;
        }
      | undefined;

    if (!response) return;

    // Find and update the matching request
    const request = this.networkRequests.find((r) => r.requestId === requestId);
    if (request) {
      request.status = response.status;
      request.statusText = response.statusText;
      request.responseTimestamp = (params.timestamp as number) || Date.now();
    }
  }

  private async sendCommand(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }

    const id = ++this.requestId;
    const message: Record<string, unknown> = { id, method };

    if (params) {
      message.params = params;
    }

    if (this.sessionId) {
      message.sessionId = this.sessionId;
    }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(message));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Send a command without using any session (for browser-level commands)
   */
  private async sendBrowserCommand(
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }

    const id = ++this.requestId;
    const message: Record<string, unknown> = { id, method };

    if (params) {
      message.params = params;
    }

    // Don't include sessionId for browser-level commands

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(message));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  private async attachToTarget(): Promise<void> {
    // Get list of targets
    const result = (await this.sendBrowserCommand('Target.getTargets')) as {
      targetInfos: Array<{ targetId: string; type: string; url: string; title: string }>;
    };

    // Find a page target
    const pageTarget = result.targetInfos.find((t) => t.type === 'page');
    if (!pageTarget) {
      // Create a new page
      const created = (await this.sendBrowserCommand('Target.createTarget', {
        url: 'about:blank',
      })) as { targetId: string };
      this.targetId = created.targetId;
    } else {
      this.targetId = pageTarget.targetId;
    }

    // Attach to the target
    const attached = (await this.sendBrowserCommand('Target.attachToTarget', {
      targetId: this.targetId,
      flatten: true,
    })) as { sessionId: string };

    this.sessionId = attached.sessionId;
    this.activeTargetId = this.targetId;

    // Store the initial tab in the tabs map
    const targetInfo = pageTarget || { url: 'about:blank', title: '' };
    this.tabs.set(this.targetId!, {
      targetId: this.targetId!,
      sessionId: this.sessionId,
      url: targetInfo.url || 'about:blank',
      title: targetInfo.title || '',
    });

    // Auto-enable console and network monitoring
    await this.enableConsole();
    await this.enableNetwork();
  }

  private async enableConsole(): Promise<void> {
    if (this.consoleEnabled) return;

    await this.sendCommand('Log.enable');
    this.consoleEnabled = true;
  }

  private async enableNetwork(): Promise<void> {
    if (this.networkEnabled) return;

    await this.sendCommand('Network.enable');
    this.networkEnabled = true;
  }

  /**
   * Inject @web-browser/core into the page if not already injected.
   */
  private async injectCore(): Promise<void> {
    if (this.coreInjected) return;

    await this.sendCommand('Runtime.evaluate', {
      expression: coreBundleSource,
      awaitPromise: true,
    });

    this.coreInjected = true;
  }

  /**
   * Execute a core function and return the result.
   */
  private async callCore<T extends CoreResult>(script: string): Promise<T> {
    await this.injectCore();

    const result = (await this.sendCommand('Runtime.evaluate', {
      expression: `(function() { const core = window.__webBrowserMcpCore; ${script} })()`,
      returnByValue: true,
      awaitPromise: true,
    })) as { result: { value: T }; exceptionDetails?: { text: string } };

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text);
    }

    return result.result.value;
  }

  private async handleTool(tool: string, args: Record<string, unknown>): Promise<unknown> {
    switch (tool) {
      // Navigation
      case 'navigate':
        return this.navigate(args.url as string);

      // Screenshots
      case 'screenshot':
        return this.screenshot(args);

      // Input - CDP native
      case 'click':
        return this.click(args);

      case 'dblclick':
        return this.dblclick(args);

      case 'type':
        return this.type(args);

      case 'keyboard':
        return this.keyboard(args);

      case 'scroll':
        return this.scroll(args);

      // JavaScript evaluation
      case 'evaluate':
        return this.evaluate(args.script as string);

      // Core-powered tools
      case 'snapshot':
        return this.snapshot(args);

      case 'pagetext':
        return this.pageText();

      case 'fill':
        return this.fill(args);

      case 'querySelector':
        return this.querySelector(args);

      case 'waitForStable':
        return this.waitForStable(args);

      case 'checkHitTarget':
        return this.checkHitTarget(args);

      // Element operations via core
      case 'getClickablePoint':
        return this.getClickablePoint(args);

      case 'isVisible':
        return this.isVisible(args);

      case 'isInteractable':
        return this.isInteractable(args);

      case 'getText':
        return this.getText(args);

      case 'getValue':
        return this.getValue(args);

      case 'getBounds':
        return this.getBounds(args);

      case 'scrollIntoView':
        return this.scrollIntoView(args);

      case 'focus':
        return this.focusElement(args);

      case 'clearRefs':
        return this.clearRefs();

      // Console and Network monitoring
      case 'console_get':
        return this.getConsoleMessages(args);

      case 'network_get':
        return this.getNetworkRequests(args);

      // Cookie management
      case 'cookies_get':
        return this.getCookies(args);

      case 'cookies_set':
        return this.setCookie(args);

      case 'cookies_delete':
        return this.deleteCookies(args);

      // Tab management
      case 'tab_list':
        return this.listTabs();

      case 'tab_new':
        return this.createTab(args.url as string | undefined);

      case 'tab_close':
        return this.closeTab(args.tabId as string);

      case 'tab_switch':
        return this.switchTab(args.tabId as string);

      // Viewport and input
      case 'hover':
        return this.hover(args);

      case 'resize_viewport':
        return this.resizeViewport(args);

      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  }

  // ========== Tab Management ==========

  private async listTabs(): Promise<{ tabs: TabInfo[]; active: string | null }> {
    const result = (await this.sendBrowserCommand('Target.getTargets')) as {
      targetInfos: TargetInfo[];
    };
    const pageTabs = result.targetInfos
      .filter((t) => t.type === 'page')
      .map((t) => ({
        id: t.targetId,
        url: t.url,
        title: t.title,
      }));
    return { tabs: pageTabs, active: this.activeTargetId };
  }

  private async createTab(url?: string): Promise<{ tabId: string; url: string }> {
    const targetUrl = url || 'about:blank';

    // Create a new target
    const created = (await this.sendBrowserCommand('Target.createTarget', {
      url: targetUrl,
    })) as { targetId: string };

    const targetId = created.targetId;

    // Attach to the new target
    const attached = (await this.sendBrowserCommand('Target.attachToTarget', {
      targetId,
      flatten: true,
    })) as { sessionId: string };

    // Store in tabs map
    this.tabs.set(targetId, {
      targetId,
      sessionId: attached.sessionId,
      url: targetUrl,
      title: '',
    });

    // Switch to the new tab
    this.activeTargetId = targetId;
    this.targetId = targetId;
    this.sessionId = attached.sessionId;
    this.coreInjected = false; // Need to inject core into new tab

    // Re-enable console and network for new tab
    this.consoleEnabled = false;
    this.networkEnabled = false;
    await this.enableConsole();
    await this.enableNetwork();

    return { tabId: targetId, url: targetUrl };
  }

  private async closeTab(targetId: string): Promise<{ closed: boolean }> {
    // Close the target
    await this.sendBrowserCommand('Target.closeTarget', { targetId });

    // Remove from tabs map
    this.tabs.delete(targetId);

    // If closing active tab, switch to another tab or set activeTargetId to null
    if (this.activeTargetId === targetId) {
      const remainingTabs = Array.from(this.tabs.values());
      if (remainingTabs.length > 0) {
        // Switch to the first remaining tab
        const nextTab = remainingTabs[0];
        this.activeTargetId = nextTab.targetId;
        this.targetId = nextTab.targetId;
        this.sessionId = nextTab.sessionId;
        this.coreInjected = false; // Need to inject core in switched tab
      } else {
        this.activeTargetId = null;
        this.targetId = null;
        this.sessionId = null;
        this.coreInjected = false;
      }
    }

    return { closed: true };
  }

  private async switchTab(targetId: string): Promise<{ switched: boolean; tabId: string }> {
    // Get fresh list of targets to check if targetId exists
    const result = (await this.sendBrowserCommand('Target.getTargets')) as {
      targetInfos: TargetInfo[];
    };
    const targetInfo = result.targetInfos.find(
      (t) => t.targetId === targetId && t.type === 'page'
    );

    if (!targetInfo) {
      throw new Error(`Tab not found: ${targetId}`);
    }

    // Check if we have this tab in our map
    let tabData = this.tabs.get(targetId);

    if (!tabData) {
      // Need to attach to this target
      const attached = (await this.sendBrowserCommand('Target.attachToTarget', {
        targetId,
        flatten: true,
      })) as { sessionId: string };

      tabData = {
        targetId,
        sessionId: attached.sessionId,
        url: targetInfo.url,
        title: targetInfo.title,
      };
      this.tabs.set(targetId, tabData);
    }

    // Update active tab
    this.activeTargetId = targetId;
    this.targetId = targetId;
    this.sessionId = tabData.sessionId;
    this.coreInjected = false; // Need to inject core in switched tab

    // Re-enable console and network for switched tab
    this.consoleEnabled = false;
    this.networkEnabled = false;
    await this.enableConsole();
    await this.enableNetwork();

    return { switched: true, tabId: targetId };
  }

  // ========== Console and Network Monitoring ==========

  private getConsoleMessages(args: Record<string, unknown>): {
    messages: ConsoleMessage[];
    count: number;
  } {
    const clear = args.clear as boolean | undefined;
    const level = args.level as string | undefined;
    const limit = args.limit as number | undefined;

    let messages = [...this.consoleMessages];

    // Filter by level if specified
    if (level) {
      messages = messages.filter((m) => m.level === level);
    }

    // Apply limit if specified
    if (limit && limit > 0) {
      messages = messages.slice(-limit);
    }

    // Clear if requested
    if (clear) {
      this.consoleMessages = [];
    }

    return { messages, count: messages.length };
  }

  private getNetworkRequests(args: Record<string, unknown>): {
    requests: NetworkRequest[];
    count: number;
  } {
    const clear = args.clear as boolean | undefined;
    const urlPattern = args.urlPattern as string | undefined;
    const limit = args.limit as number | undefined;

    let requests = [...this.networkRequests];

    // Filter by URL pattern if specified
    if (urlPattern) {
      const regex = new RegExp(urlPattern);
      requests = requests.filter((r) => regex.test(r.url));
    }

    // Apply limit if specified
    if (limit && limit > 0) {
      requests = requests.slice(-limit);
    }

    // Clear if requested
    if (clear) {
      this.networkRequests = [];
    }

    return { requests, count: requests.length };
  }

  // ========== Cookie Management ==========

  private async getCookies(args: Record<string, unknown>): Promise<{ cookies: Cookie[] }> {
    const urls = args.urls as string[] | undefined;

    const params: Record<string, unknown> = {};
    if (urls && urls.length > 0) {
      params.urls = urls;
    }

    const result = (await this.sendCommand('Network.getCookies', params)) as {
      cookies: CDPCookie[];
    };

    return {
      cookies: result.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        size: c.size,
        httpOnly: c.httpOnly,
        secure: c.secure,
        session: c.session,
        sameSite: c.sameSite,
      })),
    };
  }

  private async setCookie(args: Record<string, unknown>): Promise<{ success: boolean }> {
    const cookie = args.cookie as {
      name: string;
      value: string;
      url?: string;
      domain?: string;
      path?: string;
      secure?: boolean;
      httpOnly?: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
      expires?: number;
    };

    const result = (await this.sendCommand('Network.setCookie', cookie)) as { success: boolean };
    return { success: result.success };
  }

  private async deleteCookies(args: Record<string, unknown>): Promise<{ deleted: boolean }> {
    const name = args.name as string;
    const url = args.url as string | undefined;
    const domain = args.domain as string | undefined;
    const path = args.path as string | undefined;

    const params: Record<string, unknown> = { name };
    if (url) params.url = url;
    if (domain) params.domain = domain;
    if (path) params.path = path;

    await this.sendCommand('Network.deleteCookies', params);
    return { deleted: true };
  }

  // ========== Viewport and Input ==========

  private async hover(args: Record<string, unknown>): Promise<{ hovered: true; x: number; y: number }> {
    let x = args.x as number | undefined;
    let y = args.y as number | undefined;

    // If ref is provided, get element center
    if (args.ref && (x === undefined || y === undefined)) {
      const bounds = await this.getBounds({ ref: args.ref });
      x = bounds.bounds.x + bounds.bounds.width / 2;
      y = bounds.bounds.y + bounds.bounds.height / 2;
    }

    if (x === undefined || y === undefined) {
      throw new Error('Hover requires x,y coordinates or a ref');
    }

    await this.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
    });

    return { hovered: true, x, y };
  }

  private async resizeViewport(
    args: Record<string, unknown>
  ): Promise<{ resized: true; width: number; height: number }> {
    const width = args.width as number;
    const height = args.height as number;
    const deviceScaleFactor = (args.deviceScaleFactor as number) || 1;
    const mobile = (args.mobile as boolean) || false;

    await this.sendCommand('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile,
    });

    return { resized: true, width, height };
  }

  // ========== Navigation ==========

  private async navigate(url: string): Promise<{ url: string; title: string }> {
    this.coreInjected = false; // Reset on navigation

    await this.sendCommand('Page.enable');
    await this.sendCommand('Page.navigate', { url });

    // Wait for load
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Simple wait for now

    const result = (await this.evaluate('({ url: location.href, title: document.title })')) as {
      url: string;
      title: string;
    };

    // Update tab info
    if (this.activeTargetId) {
      const tabData = this.tabs.get(this.activeTargetId);
      if (tabData) {
        tabData.url = result.url;
        tabData.title = result.title;
      }
    }

    return result;
  }

  // ========== Screenshots ==========

  private async screenshot(args: Record<string, unknown>): Promise<{ base64: string }> {
    const format = (args.format as string) || 'png';
    const quality = args.quality as number | undefined;
    const fullPage = args.fullPage as boolean | undefined;

    const params: Record<string, unknown> = {
      format,
      captureBeyondViewport: fullPage ?? false,
    };

    if (format === 'jpeg' && quality !== undefined) {
      params.quality = quality;
    }

    const result = (await this.sendCommand('Page.captureScreenshot', params)) as { data: string };
    return { base64: result.data };
  }

  // ========== Input (CDP Native) ==========

  private async click(args: Record<string, unknown>): Promise<{ clicked: true }> {
    let x = args.x as number | undefined;
    let y = args.y as number | undefined;

    // If ref is provided, get coordinates from core
    if (args.ref && (x === undefined || y === undefined)) {
      const coords = await this.getClickablePoint({ ref: args.ref });
      x = coords.x;
      y = coords.y;
    }

    if (x === undefined || y === undefined) {
      throw new Error('Click requires x,y coordinates or a ref');
    }

    const button = (args.button as string) || 'left';
    const clickCount = (args.clickCount as number) || 1;

    const buttonMap: Record<string, string> = { left: 'left', right: 'right', middle: 'middle' };
    const cdpButton = buttonMap[button] || 'left';

    // Move mouse first
    await this.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
    });

    // Mouse down
    await this.sendCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: cdpButton,
      clickCount,
    });

    // Mouse up
    await this.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: cdpButton,
      clickCount,
    });

    return { clicked: true };
  }

  private async dblclick(args: Record<string, unknown>): Promise<{ clicked: true }> {
    return this.click({ ...args, clickCount: 2 });
  }

  private async type(args: Record<string, unknown>): Promise<{ typed: string }> {
    const text = args.text as string;

    // If ref is provided, focus the element first
    if (args.ref) {
      await this.focusElement({ ref: args.ref });
    }

    // Use Input.insertText for simpler text input
    await this.sendCommand('Input.insertText', { text });

    return { typed: text };
  }

  private async keyboard(args: Record<string, unknown>): Promise<{ pressed: string }> {
    const key = args.key as string;

    // Get key definition from core
    const keyDef = await this.callCore<{
      success: boolean;
      key?: string;
      code?: string;
      keyCode?: number;
      location?: number;
      text?: string;
      error?: string;
    }>(`
      const keyDef = core.getKeyDefinition(${JSON.stringify(key)});
      if (!keyDef) {
        return { success: false, error: 'Unknown key: ${key}' };
      }
      return {
        success: true,
        key: keyDef.key,
        code: keyDef.code,
        keyCode: keyDef.keyCode,
        location: keyDef.location || 0,
        text: keyDef.text,
      };
    `);

    if (!keyDef.success) {
      throw new Error(keyDef.error || `Unknown key: ${key}`);
    }

    // Build modifiers
    let modifiers = 0;
    if (args.ctrl) modifiers |= 1;
    if (args.alt) modifiers |= 2;
    if (args.meta) modifiers |= 4;
    if (args.shift) modifiers |= 8;

    // Key down
    await this.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: keyDef.key,
      code: keyDef.code,
      windowsVirtualKeyCode: keyDef.keyCode,
      nativeVirtualKeyCode: keyDef.keyCode,
      modifiers,
      location: keyDef.location,
    });

    // For printable characters, also dispatch char event
    if (keyDef.text) {
      await this.sendCommand('Input.dispatchKeyEvent', {
        type: 'char',
        text: keyDef.text,
        key: keyDef.key,
        code: keyDef.code,
        modifiers,
      });
    }

    // Key up
    await this.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: keyDef.key,
      code: keyDef.code,
      windowsVirtualKeyCode: keyDef.keyCode,
      nativeVirtualKeyCode: keyDef.keyCode,
      modifiers,
      location: keyDef.location,
    });

    return { pressed: key };
  }

  private async scroll(args: Record<string, unknown>): Promise<{ scrolled: true }> {
    const deltaX = (args.deltaX as number) || 0;
    const deltaY = (args.deltaY as number) || 0;
    let x = (args.x as number) || 0;
    let y = (args.y as number) || 0;

    // If ref provided, scroll at element center
    if (args.ref) {
      const bounds = await this.getBounds({ ref: args.ref });
      x = bounds.bounds.x + bounds.bounds.width / 2;
      y = bounds.bounds.y + bounds.bounds.height / 2;
    }

    await this.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x,
      y,
      deltaX,
      deltaY,
    });

    return { scrolled: true };
  }

  // ========== JavaScript Evaluation ==========

  private async evaluate(expression: string): Promise<unknown> {
    const result = (await this.sendCommand('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as { result: { value: unknown }; exceptionDetails?: { text: string } };

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text);
    }

    return result.result.value;
  }

  // ========== Core-Powered Tools ==========

  private async snapshot(
    args: Record<string, unknown>
  ): Promise<{ snapshot: string; nodeCount: number }> {
    const selector = args.selector as string | undefined;
    const interactiveOnly = args.interactiveOnly as boolean | undefined;
    const includeBbox = args.includeBbox as boolean | undefined;

    const result = await this.callCore<{
      success: boolean;
      tree?: string;
      nodeCount?: number;
      error?: string;
    }>(`
      let root = document;
      ${
        selector
          ? `
        const element = core.querySelector(document.documentElement, ${JSON.stringify(selector)}, { piercesShadowDom: true });
        if (!element) {
          return { success: false, error: 'No elements match selector: ${selector}' };
        }
        root = element;
      `
          : ''
      }
      const nodes = core.generateA11yTree(root, {
        includeBbox: ${includeBbox ?? false},
        interactiveOnly: ${interactiveOnly ?? false},
        pierceShadowDom: true,
      });
      return { success: true, tree: core.formatA11yTree(nodes), nodeCount: nodes.length };
    `);

    if (!result.success) {
      throw new Error(result.error || 'Failed to generate accessibility tree');
    }

    return { snapshot: result.tree!, nodeCount: result.nodeCount! };
  }

  private async pageText(): Promise<{ text: string }> {
    const result = await this.callCore<{ success: boolean; text: string }>(`
      return { success: true, text: document.body?.innerText || '' };
    `);

    return { text: result.text };
  }

  private async fill(args: Record<string, unknown>): Promise<{ filled: true }> {
    const ref = args.ref as string;
    const value = args.value as string;

    const result = await this.callCore<{ success: boolean; error?: string }>(`
      const element = core.getElementByRef(${JSON.stringify(ref)});
      if (!element) {
        return { success: false, error: 'Element not found: ${ref}' };
      }

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.value = ${JSON.stringify(value)};
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true };
      }

      if (element instanceof HTMLSelectElement) {
        element.value = ${JSON.stringify(value)};
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true };
      }

      return { success: false, error: 'Element is not a form input' };
    `);

    if (!result.success) {
      throw new Error(result.error || 'Fill failed');
    }

    return { filled: true };
  }

  private async querySelector(
    args: Record<string, unknown>
  ): Promise<{ ref?: string; refs?: string[]; count?: number }> {
    const selector = args.selector as string;
    const all = args.all as boolean | undefined;

    const result = await this.callCore<{
      success: boolean;
      ref?: string;
      refs?: string[];
      count?: number;
      error?: string;
    }>(`
      try {
        if (${all ?? false}) {
          const elements = core.querySelectorAll(document.documentElement, ${JSON.stringify(selector)}, { piercesShadowDom: true });
          const refs = elements.map(el => core.getElementRef(el));
          return { success: true, refs, count: refs.length };
        } else {
          const element = core.querySelector(document.documentElement, ${JSON.stringify(selector)}, { piercesShadowDom: true });
          if (!element) {
            return { success: false, error: 'No element matches selector' };
          }
          return { success: true, ref: core.getElementRef(element) };
        }
      } catch (err) {
        return { success: false, error: err.message || String(err) };
      }
    `);

    if (!result.success) {
      throw new Error(result.error || 'Selector query failed');
    }

    return all ? { refs: result.refs, count: result.count } : { ref: result.ref };
  }

  private async waitForStable(
    args: Record<string, unknown>
  ): Promise<{ stable: boolean; reason?: string }> {
    const ref = args.ref as string;
    const timeout = (args.timeout as number) || 5000;

    const result = await this.callCore<{
      success: boolean;
      stable?: boolean;
      reason?: string;
      error?: string;
    }>(`
      const element = core.getElementByRef(${JSON.stringify(ref)});
      if (!element) {
        return { success: false, error: 'Element not found: ${ref}' };
      }

      try {
        const result = await core.waitForElementStable(element, {
          timeout: ${timeout},
          frameCount: 2,
        });
        return {
          success: result.stable,
          stable: result.stable,
          reason: result.reason,
        };
      } catch (err) {
        return { success: false, error: err.message || String(err) };
      }
    `);

    if (!result.success && result.error) {
      throw new Error(result.error);
    }

    return { stable: result.stable!, reason: result.reason };
  }

  private async checkHitTarget(
    args: Record<string, unknown>
  ): Promise<{ willHit: boolean; blocked?: boolean; blockedBy?: string }> {
    const ref = args.ref as string;
    const x = args.x as number;
    const y = args.y as number;

    const result = await this.callCore<{
      success: boolean;
      willHit?: boolean;
      blocked?: boolean;
      blockedBy?: string;
      error?: string;
    }>(`
      const element = core.getElementByRef(${JSON.stringify(ref)});
      if (!element) {
        return { success: false, error: 'Element not found: ${ref}' };
      }

      try {
        const result = core.expectHitTarget({ x: ${x}, y: ${y} }, element);
        return {
          success: true,
          willHit: result.success,
          blocked: result.blocked,
          blockedBy: result.hitTargetDescription,
        };
      } catch (err) {
        return { success: false, error: err.message || String(err) };
      }
    `);

    if (!result.success) {
      throw new Error(result.error || 'Hit target check failed');
    }

    return { willHit: result.willHit!, blocked: result.blocked, blockedBy: result.blockedBy };
  }

  // ========== Element Operations ==========

  private async getClickablePoint(args: Record<string, unknown>): Promise<{ x: number; y: number }> {
    const ref = args.ref as string;

    const result = await this.callCore<{
      success: boolean;
      x?: number;
      y?: number;
      error?: string;
    }>(`
      const element = core.getElementByRef(${JSON.stringify(ref)});
      if (!element) {
        return { success: false, error: 'Element not found: ${ref}' };
      }
      if (!core.isElementInteractable(element)) {
        return { success: false, error: 'Element not interactable' };
      }
      const point = core.getClickablePoint(element);
      if (!point) {
        return { success: false, error: 'No clickable point found' };
      }
      return { success: true, x: point.x, y: point.y };
    `);

    if (!result.success) {
      throw new Error(result.error || 'Failed to get clickable point');
    }

    return { x: result.x!, y: result.y! };
  }

  private async isVisible(args: Record<string, unknown>): Promise<{ visible: boolean }> {
    const ref = args.ref as string;

    const result = await this.callCore<{
      success: boolean;
      visible?: boolean;
      error?: string;
    }>(`
      const element = core.getElementByRef(${JSON.stringify(ref)});
      if (!element) {
        return { success: false, error: 'Element not found: ${ref}' };
      }
      return { success: true, visible: core.isElementVisible(element) };
    `);

    if (!result.success) {
      throw new Error(result.error || 'Visibility check failed');
    }

    return { visible: result.visible! };
  }

  private async isInteractable(args: Record<string, unknown>): Promise<{ interactable: boolean }> {
    const ref = args.ref as string;

    const result = await this.callCore<{
      success: boolean;
      interactable?: boolean;
      error?: string;
    }>(`
      const element = core.getElementByRef(${JSON.stringify(ref)});
      if (!element) {
        return { success: false, error: 'Element not found: ${ref}' };
      }
      return { success: true, interactable: core.isElementInteractable(element) };
    `);

    if (!result.success) {
      throw new Error(result.error || 'Interactable check failed');
    }

    return { interactable: result.interactable! };
  }

  private async getText(args: Record<string, unknown>): Promise<{ text: string }> {
    const ref = args.ref as string;

    const result = await this.callCore<{
      success: boolean;
      text?: string;
      error?: string;
    }>(`
      const element = core.getElementByRef(${JSON.stringify(ref)});
      if (!element) {
        return { success: false, error: 'Element not found: ${ref}' };
      }
      return { success: true, text: element.textContent?.trim() || '' };
    `);

    if (!result.success) {
      throw new Error(result.error || 'getText failed');
    }

    return { text: result.text! };
  }

  private async getValue(args: Record<string, unknown>): Promise<{ value: string }> {
    const ref = args.ref as string;

    const result = await this.callCore<{
      success: boolean;
      value?: string;
      error?: string;
    }>(`
      const element = core.getElementByRef(${JSON.stringify(ref)});
      if (!element) {
        return { success: false, error: 'Element not found: ${ref}' };
      }
      const value = element.value ?? element.textContent ?? '';
      return { success: true, value };
    `);

    if (!result.success) {
      throw new Error(result.error || 'getValue failed');
    }

    return { value: result.value! };
  }

  private async getBounds(
    args: Record<string, unknown>
  ): Promise<{ bounds: { x: number; y: number; width: number; height: number } }> {
    const ref = args.ref as string;

    const result = await this.callCore<{
      success: boolean;
      bounds?: { x: number; y: number; width: number; height: number };
      error?: string;
    }>(`
      const element = core.getElementByRef(${JSON.stringify(ref)});
      if (!element) {
        return { success: false, error: 'Element not found: ${ref}' };
      }
      const rect = element.getBoundingClientRect();
      return {
        success: true,
        bounds: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
      };
    `);

    if (!result.success) {
      throw new Error(result.error || 'getBounds failed');
    }

    return { bounds: result.bounds! };
  }

  private async scrollIntoView(args: Record<string, unknown>): Promise<{ scrolled: true }> {
    const ref = args.ref as string;
    const behavior = (args.behavior as string) || 'smooth';
    const block = (args.block as string) || 'center';

    const result = await this.callCore<{ success: boolean; error?: string }>(`
      const element = core.getElementByRef(${JSON.stringify(ref)});
      if (!element) {
        return { success: false, error: 'Element not found: ${ref}' };
      }
      element.scrollIntoView({
        behavior: ${JSON.stringify(behavior)},
        block: ${JSON.stringify(block)},
      });
      return { success: true };
    `);

    if (!result.success) {
      throw new Error(result.error || 'scrollIntoView failed');
    }

    return { scrolled: true };
  }

  private async focusElement(args: Record<string, unknown>): Promise<{ focused: true }> {
    const ref = args.ref as string;

    const result = await this.callCore<{ success: boolean; error?: string }>(`
      const element = core.getElementByRef(${JSON.stringify(ref)});
      if (!element) {
        return { success: false, error: 'Element not found: ${ref}' };
      }
      if (element instanceof HTMLElement) {
        element.focus();
        return { success: true };
      }
      return { success: false, error: 'Element cannot be focused' };
    `);

    if (!result.success) {
      throw new Error(result.error || 'focus failed');
    }

    return { focused: true };
  }

  private async clearRefs(): Promise<{ cleared: true }> {
    await this.callCore<{ success: boolean }>(`
      core.clearElementRefs();
      return { success: true };
    `);

    return { cleared: true };
  }
}
