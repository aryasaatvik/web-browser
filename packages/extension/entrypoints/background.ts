/**
 * Background service worker for Browser MCP extension.
 * Handles native messaging and coordinates browser automation.
 */

import { native } from "../src/native";
import { cdp } from "../src/cdp";
import { tabs } from "../src/tabs";

// Types
interface Command {
  id: string;
  action: string;
  sessionId?: string;
  [key: string]: unknown;
}

interface Response<T = unknown> {
  id: string;
  success: boolean;
  data?: T;
  error?: string;
}

interface NativeMessage {
  type?: string;
  id?: string;
  command?: Command;
}

interface CoreBridgeResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

// Current active tab for commands
const activeTabIdBySession = new Map<string, number>();

function getSessionId(cmd: Command): string {
  const raw = cmd.sessionId;
  if (typeof raw === "string" && raw.trim()) return raw;
  return "default";
}

interface ConsoleMessage {
  level: "log" | "warning" | "error" | "info" | "debug";
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

const MAX_CONSOLE_MESSAGES = 500;
const MAX_NETWORK_REQUESTS = 500;
const consoleMessagesByTab = new Map<number, ConsoleMessage[]>();
const networkRequestsByTab = new Map<number, NetworkRequest[]>();
const monitoringEnabledTabs = new Set<number>();

function pushBounded<T>(arr: T[], item: T, max: number): void {
  arr.push(item);
  if (arr.length > max) arr.splice(0, arr.length - max);
}

async function ensureMonitoring(tabId: number): Promise<void> {
  if (monitoringEnabledTabs.has(tabId)) return;

  // Enable domains that power console/network tooling.
  await cdp.sendCommand(tabId, "Log.enable");
  await cdp.sendCommand(tabId, "Network.enable");
  // Runtime events are sometimes needed to capture console output depending on browser behavior.
  await cdp.sendCommand(tabId, "Runtime.enable");

  monitoringEnabledTabs.add(tabId);
}

// Response helpers
function success<T>(id: string, data: T): Response<T> {
  return { id, success: true, data };
}

function failure(id: string, error: string): Response<never> {
  return { id, success: false, error };
}

// Helper to call content script -> core bridge
async function callCoreBridge<T extends CoreBridgeResult>(
  tabId: number,
  action: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  try {
    const result = await browser.tabs.sendMessage(tabId, { action, params });
    if (!result.success) {
      throw new Error(result.error || "Unknown error from core bridge");
    }
    return result as T;
  } catch (err) {
    // Content script may not be loaded yet, wait and retry once
    await new Promise((r) => setTimeout(r, 200));
    try {
      const result = await browser.tabs.sendMessage(tabId, { action, params });
      if (!result.success) {
        throw new Error(result.error || "Unknown error from core bridge");
      }
      return result as T;
    } catch (retryErr) {
      throw new Error(
        `Failed to communicate with content script: ${
          retryErr instanceof Error ? retryErr.message : String(retryErr)
        }`
      );
    }
  }
}

// Get or create the active managed tab
async function ensureActiveTab(sessionId: string): Promise<number> {
  const existingActive = activeTabIdBySession.get(sessionId);
  if (typeof existingActive === "number") {
    if (await tabs.isManaged(sessionId, existingActive)) {
      return existingActive;
    }
    activeTabIdBySession.delete(sessionId);
  }

  // Check existing managed tabs for this session.
  const managedTabs = await tabs.listTabs(sessionId);
  if (managedTabs.length > 0 && managedTabs[0].id) {
    const tabId = managedTabs[0].id;
    activeTabIdBySession.set(sessionId, tabId);
    return tabId;
  }

  // Create new tab (and ensure tab group).
  const tab = await tabs.createTab(sessionId);
  if (!tab.id) throw new Error("Failed to create tab");
  activeTabIdBySession.set(sessionId, tab.id);
  return tab.id;
}

// Wait for tab to finish loading
async function waitForTabLoad(tabId: number, timeoutMs: number = 30000): Promise<void> {
  const existing = await browser.tabs.get(tabId);
  if (existing.status === "complete") return;

  return new Promise((resolve, reject) => {
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === "complete") {
        browser.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);

    const timeout = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Timed out waiting for tab ${tabId} to load`));
    }, timeoutMs);
  });
}

// Command handlers
async function handleNavigate(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);
  const url = cmd.url as string;

  await browser.tabs.update(tabId, { url });
  await waitForTabLoad(tabId);

  const tab = await browser.tabs.get(tabId);
  return success(cmd.id, { url: tab.url, title: tab.title });
}

async function handleClick(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);
  let x = cmd.x as number | undefined;
  let y = cmd.y as number | undefined;

  // If ref is provided, get coordinates from core bridge
  if (cmd.ref) {
    const point = await callCoreBridge<{ success: boolean; x: number; y: number }>(
      tabId,
      "getClickablePoint",
      { ref: cmd.ref }
    );
    x = point.x;
    y = point.y;
  }

  if (x === undefined || y === undefined) {
    return failure(cmd.id, "No coordinates or ref provided for click");
  }

  const button = (cmd.button as string) || "left";
  const clickCount = (cmd.clickCount as number) || 1;

  await cdp.sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button,
    clickCount,
  });

  await cdp.sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button,
    clickCount,
  });

  return success(cmd.id, { clicked: true, x, y });
}

async function handleType(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);
  const text = cmd.text as string;

  // If ref is provided, click to focus first
  if (cmd.ref) {
    const center = await callCoreBridge<{ success: boolean; x: number; y: number }>(
      tabId,
      "getElementCenter",
      { ref: cmd.ref }
    );

    // Click to focus
    await cdp.sendCommand(tabId, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: center.x,
      y: center.y,
      button: "left",
      clickCount: 1,
    });
    await cdp.sendCommand(tabId, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: center.x,
      y: center.y,
      button: "left",
      clickCount: 1,
    });

    // Small delay after click for focus
    await new Promise((r) => setTimeout(r, 50));
  }

  await cdp.sendCommand(tabId, "Input.insertText", { text });

  return success(cmd.id, { typed: true });
}

async function handleKeyboard(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);
  const key = cmd.key as string;

  // Get proper key definition from core (supports 200+ keys)
  const keyDef = await callCoreBridge<{
    success: boolean;
    key?: string;
    code?: string;
    keyCode?: number;
    location?: number;
    error?: string;
  }>(tabId, "getKeyDefinition", { key });

  if (!keyDef.success) {
    return failure(cmd.id, keyDef.error || `Unknown key: ${key}`);
  }

  // Build CDP modifiers from command
  let modifiers = 0;
  if (cmd.ctrl) modifiers |= 1; // Ctrl
  if (cmd.alt) modifiers |= 2; // Alt
  if (cmd.meta) modifiers |= 4; // Meta
  if (cmd.shift) modifiers |= 8; // Shift

  await cdp.sendCommand(tabId, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key: keyDef.key,
    code: keyDef.code,
    windowsVirtualKeyCode: keyDef.keyCode,
    nativeVirtualKeyCode: keyDef.keyCode,
    modifiers,
    location: keyDef.location,
  });

  await cdp.sendCommand(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: keyDef.key,
    code: keyDef.code,
    windowsVirtualKeyCode: keyDef.keyCode,
    nativeVirtualKeyCode: keyDef.keyCode,
    modifiers,
    location: keyDef.location,
  });

  return success(cmd.id, { pressed: key });
}

async function handleScreenshot(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);
  const format = (cmd.format as string) || "png";
  const quality = cmd.quality as number | undefined;

  const result = await cdp.sendCommand<{ data: string }>(
    tabId,
    "Page.captureScreenshot",
    {
      format,
      quality: format === "jpeg" ? quality : undefined,
    }
  );

  return success(cmd.id, { base64: result.data });
}

async function handleSnapshot(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);

  const result = await callCoreBridge<{
    success: boolean;
    tree: string;
    nodeCount: number;
    error?: string;
  }>(tabId, "snapshot", {
    includeBbox: cmd.includeBbox ?? false,
    interactiveOnly: cmd.interactiveOnly ?? false,
    selector: cmd.selector, // Support selector scoping
  });

  if (!result.success) {
    return failure(cmd.id, result.error || "Failed to generate snapshot");
  }

  return success(cmd.id, { snapshot: result.tree, nodeCount: result.nodeCount });
}

async function handleEvaluate(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);
  const script = cmd.script as string;

  const result = await cdp.sendCommand<{
    result: { value: unknown };
    exceptionDetails?: { text: string };
  }>(tabId, "Runtime.evaluate", {
    expression: script,
    returnByValue: true,
    awaitPromise: true,
  });

  if (result.exceptionDetails) {
    return failure(cmd.id, result.exceptionDetails.text);
  }

  return success(cmd.id, { result: result.result.value });
}

async function handleTabList(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const managedTabs = await tabs.listTabs(sessionId);
  const tabInfos = managedTabs.map((tab, index) => ({
    index,
    id: tab.id,
    url: tab.url || "",
    title: tab.title || "",
    active: tab.active,
  }));

  return success(cmd.id, { tabs: tabInfos, active: activeTabIdBySession.get(sessionId) });
}

async function handleTabNew(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const url = cmd.url as string | undefined;
  const tab = await tabs.createTab(sessionId, url);
  if (typeof tab.id === "number") {
    activeTabIdBySession.set(sessionId, tab.id);
  }

  return success(cmd.id, { tabId: tab.id, url: tab.url });
}

async function handleTabClose(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = (cmd.tabId as number) || activeTabIdBySession.get(sessionId);
  if (typeof tabId !== "number") {
    return failure(cmd.id, "No tab to close");
  }

  await tabs.closeTab(sessionId, tabId);
  if (activeTabIdBySession.get(sessionId) === tabId) activeTabIdBySession.delete(sessionId);

  return success(cmd.id, { closed: tabId });
}

async function handleTabSwitch(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const raw = cmd.tabId as unknown;
  const tabId = typeof raw === "string" ? Number.parseInt(raw, 10) : (raw as number);

  if (!Number.isFinite(tabId)) {
    return failure(cmd.id, "tabId is required");
  }

  // Make this tab the active managed tab.
  await browser.tabs.update(tabId, { active: true });
  await tabs.ensureGroup(sessionId, tabId);
  activeTabIdBySession.set(sessionId, tabId);

  // Enable monitoring for this tab (console/network tooling).
  await ensureMonitoring(tabId);

  const tab = await browser.tabs.get(tabId);
  return success(cmd.id, { tabId, url: tab.url, title: tab.title });
}

async function handleScroll(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);
  const deltaX = (cmd.deltaX as number) || 0;
  const deltaY = (cmd.deltaY as number) || 0;
  const x = (cmd.x as number) || 0;
  const y = (cmd.y as number) || 0;

  await cdp.sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x,
    y,
    deltaX,
    deltaY,
  });

  return success(cmd.id, { scrolled: true });
}

async function handleResizeViewport(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);
  const width = cmd.width as number;
  const height = cmd.height as number;

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return failure(cmd.id, "width and height are required");
  }

  await cdp.sendCommand(tabId, "Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: (cmd.deviceScaleFactor as number) || 1,
    mobile: (cmd.mobile as boolean) || false,
  });

  return success(cmd.id, { resized: true, width, height });
}

async function handleConsoleGet(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);
  await ensureMonitoring(tabId);

  const level = cmd.level as ConsoleMessage["level"] | undefined;
  const limit = cmd.limit as number | undefined;
  const clear = cmd.clear as boolean | undefined;

  let messages = [...(consoleMessagesByTab.get(tabId) || [])];
  if (level) messages = messages.filter((m) => m.level === level);
  if (limit && limit > 0) messages = messages.slice(-limit);

  if (clear) consoleMessagesByTab.set(tabId, []);

  return success(cmd.id, { messages, count: messages.length });
}

async function handleNetworkGet(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);
  await ensureMonitoring(tabId);

  const urlPattern = cmd.urlPattern as string | undefined;
  const limit = cmd.limit as number | undefined;
  const clear = cmd.clear as boolean | undefined;

  let requests = [...(networkRequestsByTab.get(tabId) || [])];
  if (urlPattern) {
    const regex = new RegExp(urlPattern);
    requests = requests.filter((r) => regex.test(r.url));
  }
  if (limit && limit > 0) requests = requests.slice(-limit);

  if (clear) networkRequestsByTab.set(tabId, []);

  return success(cmd.id, { requests, count: requests.length });
}

// Cookie handlers
async function handleCookiesGet(cmd: Command): Promise<Response> {
  const url = cmd.url as string | undefined;
  const domain = cmd.domain as string | undefined;
  const name = cmd.name as string | undefined;

  const query: { url?: string; domain?: string; name?: string } = {};
  if (url) query.url = url;
  if (domain) query.domain = domain;
  if (name) query.name = name;

  const cookies = await browser.cookies.getAll(query);
  return success(cmd.id, { cookies });
}

async function handleCookiesSet(cmd: Command): Promise<Response> {
  const name = cmd.name as string;
  const value = cmd.value as string;
  const domain = cmd.domain as string | undefined;
  const path = cmd.path as string | undefined;
  const secure = cmd.secure as boolean | undefined;
  const httpOnly = cmd.httpOnly as boolean | undefined;
  const sameSite = cmd.sameSite as "no_restriction" | "lax" | "strict" | undefined;
  const expirationDate = cmd.expirationDate as number | undefined;

  // Need a URL for setting cookies
  const url =
    (cmd.url as string) || `https://${domain || "localhost"}${path || "/"}`;

  const cookie = await browser.cookies.set({
    url,
    name,
    value,
    domain,
    path: path || "/",
    secure,
    httpOnly,
    sameSite,
    expirationDate,
  });

  return success(cmd.id, { cookie });
}

async function handleCookiesRemove(cmd: Command): Promise<Response> {
  const name = cmd.name as string;

  if (!name) {
    return failure(cmd.id, "Cookie name is required");
  }

  // Chrome requires a URL when removing cookies. If not provided, infer one.
  let url = cmd.url as string | undefined;
  if (!url) {
    const domain = cmd.domain as string | undefined;
    if (domain) {
      url = `https://${domain}/`;
    } else {
      const sessionId = getSessionId(cmd);
      const tabId = await ensureActiveTab(sessionId);
      const tab = await browser.tabs.get(tabId);
      url = tab.url || undefined;
    }
  }

  if (!url) {
    return failure(cmd.id, "Cookie delete requires a url, a domain, or an active tab with a URL");
  }

  await browser.cookies.remove({ url, name });
  return success(cmd.id, { removed: true, name, url });
}

async function handleCookiesDelete(cmd: Command): Promise<Response> {
  // Alias for MCP tool naming consistency.
  return handleCookiesRemove(cmd);
}

// Storage handlers
async function handleStorageGet(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);
  const type = (cmd.type as "local" | "session") || "local";
  const key = cmd.key as string | undefined;

  const storageType = type === "session" ? "sessionStorage" : "localStorage";
  const script = key
    ? `${storageType}.getItem(${JSON.stringify(key)})`
    : `JSON.stringify(Object.fromEntries(Object.entries(${storageType})))`;

  const result = await cdp.sendCommand<{ result: { value: unknown } }>(
    tabId,
    "Runtime.evaluate",
    { expression: script, returnByValue: true }
  );

  return success(cmd.id, { value: result.result.value, type, key });
}

async function handleStorageSet(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);
  const type = (cmd.type as "local" | "session") || "local";
  const key = cmd.key as string;
  const value = cmd.value as string;

  const storageType = type === "session" ? "sessionStorage" : "localStorage";
  const script = `${storageType}.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)})`;

  await cdp.sendCommand(tabId, "Runtime.evaluate", { expression: script });

  return success(cmd.id, { set: true, key, type });
}

async function handleStorageRemove(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);
  const type = (cmd.type as "local" | "session") || "local";
  const key = cmd.key as string;

  const storageType = type === "session" ? "sessionStorage" : "localStorage";
  const script = `${storageType}.removeItem(${JSON.stringify(key)})`;

  await cdp.sendCommand(tabId, "Runtime.evaluate", { expression: script });

  return success(cmd.id, { removed: true, key, type });
}

async function handleStorageClear(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);
  const type = (cmd.type as "local" | "session") || "local";

  const storageType = type === "session" ? "sessionStorage" : "localStorage";
  const script = `${storageType}.clear()`;

  await cdp.sendCommand(tabId, "Runtime.evaluate", { expression: script });

  return success(cmd.id, { cleared: true, type });
}

// Media recording handlers
let offscreenDocumentReady = false;

async function ensureOffscreenDocument(): Promise<void> {
  if (offscreenDocumentReady) return;

  // Use browser API with type assertion for Chrome-specific features
  const contexts = await (browser.runtime as unknown as {
    getContexts: (filter: { contextTypes: string[] }) => Promise<unknown[]>;
  }).getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });

  if (contexts.length === 0) {
    await (browser as unknown as {
      offscreen: {
        createDocument: (options: {
          url: string;
          reasons: string[];
          justification: string;
        }) => Promise<void>;
      };
    }).offscreen.createDocument({
      url: "offscreen/index.html",
      reasons: ["USER_MEDIA"],
      justification: "Recording tab content for video capture",
    });
  }

  offscreenDocumentReady = true;
}

async function handleRecordingStart(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);

  // Get stream ID for tab capture using Chrome API with type assertion
  const tabCapture = (globalThis as unknown as {
    chrome: {
      tabCapture: {
        getMediaStreamId: (
          options: { targetTabId: number },
          callback: (streamId: string) => void
        ) => void;
      };
      runtime: {
        lastError?: { message: string };
      };
    };
  }).chrome;

  const streamId = await new Promise<string>((resolve, reject) => {
    tabCapture.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id: string) => {
      if (tabCapture.runtime.lastError) {
        reject(new Error(tabCapture.runtime.lastError.message));
      } else {
        resolve(id);
      }
    });
  });

  await ensureOffscreenDocument();

  const result = await browser.runtime.sendMessage({
    action: "recording:start",
    streamId,
  });

  if (!result.success) {
    return failure(cmd.id, result.error || "Failed to start recording");
  }

  return success(cmd.id, { started: true, tabId });
}

async function handleRecordingStop(cmd: Command): Promise<Response> {
  const result = await browser.runtime.sendMessage({
    action: "recording:stop",
  });

  if (!result.success) {
    return failure(cmd.id, result.error || "Failed to stop recording");
  }

  return success(cmd.id, { recording: result.data });
}

async function handleGifStart(cmd: Command): Promise<Response> {
  const width = (cmd.width as number) || 800;
  const height = (cmd.height as number) || 600;

  await ensureOffscreenDocument();

  const result = await browser.runtime.sendMessage({
    action: "gif:start",
    width,
    height,
  });

  if (!result.success) {
    return failure(cmd.id, result.error || "Failed to start GIF capture");
  }

  return success(cmd.id, { started: true, width, height });
}

async function handleGifAddFrame(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);

  // Capture screenshot
  const screenshot = await cdp.sendCommand<{ data: string }>(
    tabId,
    "Page.captureScreenshot",
    { format: "png" }
  );

  const result = await browser.runtime.sendMessage({
    action: "gif:addFrame",
    imageData: `data:image/png;base64,${screenshot.data}`,
  });

  if (!result.success) {
    return failure(cmd.id, result.error || "Failed to add GIF frame");
  }

  return success(cmd.id, { added: true });
}

async function handleGifGenerate(cmd: Command): Promise<Response> {
  const delay = (cmd.delay as number) || 100;

  const result = await browser.runtime.sendMessage({
    action: "gif:generate",
    delay,
  });

  if (!result.success) {
    return failure(cmd.id, result.error || "Failed to generate GIF");
  }

  return success(cmd.id, { gif: result.data });
}

// Page text handler - returns plain text content
async function handlePageText(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);

  const result = await callCoreBridge<{ success: boolean; text: string }>(
    tabId,
    "getPageText",
    {}
  );

  return success(cmd.id, { text: result.text });
}

// Form fill handler - sets value of a form field
async function handleFill(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);
  const ref = cmd.ref as string;
  const value = cmd.value as string;

  if (!ref) {
    return failure(cmd.id, "No ref provided for fill");
  }

  const result = await callCoreBridge<{ success: boolean; error?: string }>(
    tabId,
    "setValue",
    { ref, value }
  );

  if (!result.success) {
    return failure(cmd.id, result.error || "Failed to set value");
  }

  return success(cmd.id, { filled: true, ref, value });
}

// Double click handler
async function handleDblClick(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);
  let x = cmd.x as number | undefined;
  let y = cmd.y as number | undefined;

  // If ref is provided, get coordinates from core bridge
  if (cmd.ref) {
    const point = await callCoreBridge<{ success: boolean; x: number; y: number }>(
      tabId,
      "getClickablePoint",
      { ref: cmd.ref }
    );
    x = point.x;
    y = point.y;
  }

  if (x === undefined || y === undefined) {
    return failure(cmd.id, "No coordinates or ref provided for double click");
  }

  // Double click = two clicks with clickCount=2
  await cdp.sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 2,
  });

  await cdp.sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 2,
  });

  return success(cmd.id, { doubleClicked: true, x, y });
}

// GIF export handler - combines start, add frames, and generate
async function handleGifExport(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);
  const duration = (cmd.duration as number) || 3; // seconds
  const frameInterval = (cmd.frameInterval as number) || 100; // ms
  const width = (cmd.width as number) || 800;
  const height = (cmd.height as number) || 600;

  await ensureOffscreenDocument();

  // Start GIF capture
  const startResult = await browser.runtime.sendMessage({
    action: "gif:start",
    width,
    height,
  });

  if (!startResult.success) {
    return failure(cmd.id, startResult.error || "Failed to start GIF capture");
  }

  // Capture frames for the specified duration
  const frameCount = Math.ceil((duration * 1000) / frameInterval);
  for (let i = 0; i < frameCount; i++) {
    // Capture screenshot
    const screenshot = await cdp.sendCommand<{ data: string }>(
      tabId,
      "Page.captureScreenshot",
      { format: "png" }
    );

    // Add frame to GIF
    const frameResult = await browser.runtime.sendMessage({
      action: "gif:addFrame",
      imageData: `data:image/png;base64,${screenshot.data}`,
    });

    if (!frameResult.success) {
      return failure(cmd.id, frameResult.error || "Failed to add GIF frame");
    }

    // Wait before next frame
    if (i < frameCount - 1) {
      await new Promise((r) => setTimeout(r, frameInterval));
    }
  }

  // Generate final GIF
  const generateResult = await browser.runtime.sendMessage({
    action: "gif:generate",
    delay: frameInterval,
  });

  if (!generateResult.success) {
    return failure(cmd.id, generateResult.error || "Failed to generate GIF");
  }

  return success(cmd.id, { gif: generateResult.data });
}

// DOM stability handler - wait for element to stop moving/resizing
async function handleWaitForStable(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);

  const result = await callCoreBridge<{
    success: boolean;
    stable?: boolean;
    reason?: string;
    error?: string;
  }>(tabId, "waitForStable", {
    ref: cmd.ref,
    timeout: cmd.timeout || 5000,
    frameCount: cmd.frameCount || 2,
  });

  if (!result.success) {
    return failure(cmd.id, result.error || "Stability check failed");
  }

  return success(cmd.id, { stable: result.stable, reason: result.reason });
}

// Hit target check - verify click point will hit expected element
async function handleCheckHitTarget(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);

  const result = await callCoreBridge<{
    success: boolean;
    willHit?: boolean;
    blocked?: boolean;
    blockedBy?: string;
    error?: string;
  }>(tabId, "checkHitTarget", {
    ref: cmd.ref,
    x: cmd.x,
    y: cmd.y,
  });

  if (!result.success) {
    return failure(cmd.id, result.error || "Hit target check failed");
  }

  return success(cmd.id, {
    willHit: result.willHit,
    blocked: result.blocked,
    blockedBy: result.blockedBy,
  });
}

// Describe element - get human-readable description
async function handleDescribeElement(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);

  const result = await callCoreBridge<{
    success: boolean;
    description?: string;
    error?: string;
  }>(tabId, "describeElement", {
    ref: cmd.ref,
  });

  if (!result.success) {
    return failure(cmd.id, result.error || "Failed to describe element");
  }

  return success(cmd.id, { description: result.description });
}

// Selector query handler - Playwright-style selectors
async function handleQuerySelector(cmd: Command): Promise<Response> {
  const sessionId = getSessionId(cmd);
  const tabId = await ensureActiveTab(sessionId);

  const result = await callCoreBridge<{
    success: boolean;
    ref?: string;
    refs?: string[];
    count?: number;
    error?: string;
  }>(tabId, "querySelector", {
    selector: cmd.selector,
    all: cmd.all || false,
  });

  if (!result.success) {
    return failure(cmd.id, result.error || "Selector query failed");
  }

  return success(
    cmd.id,
    cmd.all ? { refs: result.refs, count: result.count } : { ref: result.ref }
  );
}

// Main command dispatcher
async function handleCommand(cmd: Command): Promise<Response> {
  try {
    switch (cmd.action) {
      case "navigate":
        return await handleNavigate(cmd);
      case "click":
        return await handleClick(cmd);
      case "type":
        return await handleType(cmd);
      case "keyboard":
        return await handleKeyboard(cmd);
      case "screenshot":
        return await handleScreenshot(cmd);
      case "snapshot":
        return await handleSnapshot(cmd);
      case "evaluate":
        return await handleEvaluate(cmd);
      case "tab_list":
        return await handleTabList(cmd);
      case "tab_new":
        return await handleTabNew(cmd);
      case "tab_close":
        return await handleTabClose(cmd);
      case "tab_switch":
        return await handleTabSwitch(cmd);
      case "scroll":
        return await handleScroll(cmd);
      case "resize_viewport":
        return await handleResizeViewport(cmd);
      case "console_get":
        return await handleConsoleGet(cmd);
      case "network_get":
        return await handleNetworkGet(cmd);
      // Cookie commands
      case "cookies_get":
        return await handleCookiesGet(cmd);
      case "cookies_set":
        return await handleCookiesSet(cmd);
      case "cookies_delete":
        return await handleCookiesDelete(cmd);
      case "cookies_remove":
        return await handleCookiesRemove(cmd);
      // Storage commands
      case "storage_get":
        return await handleStorageGet(cmd);
      case "storage_set":
        return await handleStorageSet(cmd);
      case "storage_remove":
        return await handleStorageRemove(cmd);
      case "storage_clear":
        return await handleStorageClear(cmd);
      // Recording commands
      case "recording_start":
        return await handleRecordingStart(cmd);
      case "recording_stop":
        return await handleRecordingStop(cmd);
      case "gif_start":
        return await handleGifStart(cmd);
      case "gif_add_frame":
        return await handleGifAddFrame(cmd);
      case "gif_generate":
        return await handleGifGenerate(cmd);
      case "gif_export":
        return await handleGifExport(cmd);
      // Page content commands
      case "pagetext":
        return await handlePageText(cmd);
      // Form commands
      case "fill":
        return await handleFill(cmd);
      // Additional click handlers
      case "dblclick":
        return await handleDblClick(cmd);
      case "close":
        return success(cmd.id, { closed: true });
      // Selector query
      case "querySelector":
        return await handleQuerySelector(cmd);
      // DOM utilities
      case "waitForStable":
        return await handleWaitForStable(cmd);
      case "checkHitTarget":
        return await handleCheckHitTarget(cmd);
      case "describeElement":
        return await handleDescribeElement(cmd);
      default:
        return failure(cmd.id, `Unknown action: ${cmd.action}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(cmd.id, message);
  }
}

// Native message handler
function onNativeMessage(message: unknown): void {
  const msg = message as NativeMessage;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "ping") {
    native.send({ type: "pong" });
    return;
  }

  if (msg.type === "command_request" && msg.command) {
    handleCommand(msg.command)
      .then((response) => {
        native.send({
          type: "command_response",
          id: msg.id,
          response,
        });
      })
      .catch((err) => {
        native.send({
          type: "command_response",
          id: msg.id,
          response: failure(msg.command!.id, err.message || String(err)),
        });
      });
  }
}

// Initialize
export default defineBackground({
  type: "module",
  main() {
    // Event listeners - must be inside main() to avoid running during WXT prepare
    browser.tabs.onRemoved.addListener((tabId) => {
      tabs.removeTab(tabId);
      for (const [sessionId, active] of activeTabIdBySession.entries()) {
        if (active === tabId) activeTabIdBySession.delete(sessionId);
      }
      consoleMessagesByTab.delete(tabId);
      networkRequestsByTab.delete(tabId);
      monitoringEnabledTabs.delete(tabId);
      cdp.detach(tabId).catch(() => {});
    });

    if (browser.tabGroups?.onRemoved) {
      browser.tabGroups.onRemoved.addListener((group) => {
        tabs.clearGroup(group.id);
      });
    }

    browser.debugger.onEvent.addListener((source, method, params) => {
      const tabId = source.tabId;
      if (!tabId) return;

      if (method === "Log.entryAdded") {
        const entry = (params as { entry?: { level?: string; text?: string; timestamp?: number; url?: string; lineNumber?: number } }).entry;
        if (!entry) return;

        const levelMap: Record<string, ConsoleMessage["level"]> = {
          verbose: "debug",
          info: "info",
          warning: "warning",
          error: "error",
        };

        const list = consoleMessagesByTab.get(tabId) || [];
        pushBounded(
          list,
          {
            level: levelMap[entry.level || "info"] || "log",
            text: entry.text || "",
            timestamp: (entry.timestamp as number | undefined) || Date.now(),
            url: entry.url,
            lineNumber: entry.lineNumber,
          },
          MAX_CONSOLE_MESSAGES
        );
        consoleMessagesByTab.set(tabId, list);
        return;
      }

      if (method === "Runtime.consoleAPICalled") {
        const p = params as {
          type?: string;
          args?: Array<{ value?: unknown; description?: string }>;
          timestamp?: number;
        };

        const apiType = p.type || "log";
        const level = apiType === "warn" ? "warning" : apiType === "debug" ? "debug" : apiType === "error" ? "error" : apiType === "info" ? "info" : "log";
        const text = (p.args || [])
          .map((a) => {
            if ("value" in a && a.value !== undefined) return String(a.value);
            if (a.description) return a.description;
            return "";
          })
          .filter(Boolean)
          .join(" ");

        const list = consoleMessagesByTab.get(tabId) || [];
        pushBounded(
          list,
          {
            level,
            text,
            timestamp: (p.timestamp as number | undefined) || Date.now(),
          },
          MAX_CONSOLE_MESSAGES
        );
        consoleMessagesByTab.set(tabId, list);
        return;
      }

      if (method === "Network.requestWillBeSent") {
        const p = params as {
          requestId?: string;
          request?: { url?: string; method?: string };
          type?: string;
          timestamp?: number;
        };
        if (!p.requestId || !p.request) return;

        const list = networkRequestsByTab.get(tabId) || [];
        pushBounded(
          list,
          {
            requestId: p.requestId,
            url: p.request.url || "",
            method: p.request.method || "GET",
            type: p.type,
            timestamp: (p.timestamp as number | undefined) || Date.now(),
          },
          MAX_NETWORK_REQUESTS
        );
        networkRequestsByTab.set(tabId, list);
        return;
      }

      if (method === "Network.responseReceived") {
        const p = params as {
          requestId?: string;
          response?: { status?: number; statusText?: string };
          timestamp?: number;
        };
        if (!p.requestId || !p.response) return;

        const list = networkRequestsByTab.get(tabId) || [];
        const req = list.find((r) => r.requestId === p.requestId);
        if (req) {
          req.status = p.response.status;
          req.statusText = p.response.statusText;
          req.responseTimestamp = (p.timestamp as number | undefined) || Date.now();
        }
        networkRequestsByTab.set(tabId, list);
      }
    });

    browser.debugger.onDetach.addListener((source) => {
      if (source.tabId) {
        consoleMessagesByTab.delete(source.tabId);
        networkRequestsByTab.delete(source.tabId);
        monitoringEnabledTabs.delete(source.tabId);
        cdp.detach(source.tabId).catch(() => {});
      }
    });

    // Native messaging setup
    native.onMessage(onNativeMessage);
    native.onBridgeStatus((status) => {
      console.log(`[background] Bridge status: ${status}`);
    });
    native.connect();
  },
});
