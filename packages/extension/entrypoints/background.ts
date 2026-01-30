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
let activeTabId: number | null = null;

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
async function ensureActiveTab(): Promise<number> {
  if (activeTabId !== null) {
    if (await tabs.isManaged(activeTabId)) {
      return activeTabId;
    }
    activeTabId = null;
  }

  // Check existing managed tabs
  const managedTabs = await tabs.listTabs();
  if (managedTabs.length > 0 && managedTabs[0].id) {
    const tabId = managedTabs[0].id;
    activeTabId = tabId;
    return tabId;
  }

  // Create new tab
  const tab = await tabs.createTab();
  if (!tab.id) throw new Error("Failed to create tab");
  const newTabId = tab.id;
  activeTabId = newTabId;
  return newTabId;
}

// Wait for tab to finish loading
async function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === "complete") {
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });
}

// Command handlers
async function handleNavigate(cmd: Command): Promise<Response> {
  const tabId = await ensureActiveTab();
  const url = cmd.url as string;

  await browser.tabs.update(tabId, { url });
  await waitForTabLoad(tabId);

  const tab = await browser.tabs.get(tabId);
  return success(cmd.id, { url: tab.url, title: tab.title });
}

async function handleClick(cmd: Command): Promise<Response> {
  const tabId = await ensureActiveTab();
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
  const tabId = await ensureActiveTab();
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
  const tabId = await ensureActiveTab();
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
  const tabId = await ensureActiveTab();
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
  const tabId = await ensureActiveTab();

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
  const tabId = await ensureActiveTab();
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
  const managedTabs = await tabs.listTabs();
  const tabInfos = managedTabs.map((tab, index) => ({
    index,
    id: tab.id,
    url: tab.url || "",
    title: tab.title || "",
    active: tab.active,
  }));

  return success(cmd.id, { tabs: tabInfos, active: activeTabId });
}

async function handleTabNew(cmd: Command): Promise<Response> {
  const url = cmd.url as string | undefined;
  const tab = await tabs.createTab(url);
  activeTabId = tab.id || null;

  return success(cmd.id, { tabId: tab.id, url: tab.url });
}

async function handleTabClose(cmd: Command): Promise<Response> {
  const tabId = (cmd.tabId as number) || activeTabId;
  if (tabId === null) {
    return failure(cmd.id, "No tab to close");
  }

  await tabs.closeTab(tabId);
  if (activeTabId === tabId) {
    activeTabId = null;
  }

  return success(cmd.id, { closed: tabId });
}

async function handleScroll(cmd: Command): Promise<Response> {
  const tabId = await ensureActiveTab();
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
  const url = cmd.url as string;
  const name = cmd.name as string;

  await browser.cookies.remove({ url, name });
  return success(cmd.id, { removed: true, name, url });
}

// Storage handlers
async function handleStorageGet(cmd: Command): Promise<Response> {
  const tabId = await ensureActiveTab();
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
  const tabId = await ensureActiveTab();
  const type = (cmd.type as "local" | "session") || "local";
  const key = cmd.key as string;
  const value = cmd.value as string;

  const storageType = type === "session" ? "sessionStorage" : "localStorage";
  const script = `${storageType}.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)})`;

  await cdp.sendCommand(tabId, "Runtime.evaluate", { expression: script });

  return success(cmd.id, { set: true, key, type });
}

async function handleStorageRemove(cmd: Command): Promise<Response> {
  const tabId = await ensureActiveTab();
  const type = (cmd.type as "local" | "session") || "local";
  const key = cmd.key as string;

  const storageType = type === "session" ? "sessionStorage" : "localStorage";
  const script = `${storageType}.removeItem(${JSON.stringify(key)})`;

  await cdp.sendCommand(tabId, "Runtime.evaluate", { expression: script });

  return success(cmd.id, { removed: true, key, type });
}

async function handleStorageClear(cmd: Command): Promise<Response> {
  const tabId = await ensureActiveTab();
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
  const tabId = await ensureActiveTab();

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
  const tabId = await ensureActiveTab();

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
  const tabId = await ensureActiveTab();

  const result = await callCoreBridge<{ success: boolean; text: string }>(
    tabId,
    "getPageText",
    {}
  );

  return success(cmd.id, { text: result.text });
}

// Form fill handler - sets value of a form field
async function handleFill(cmd: Command): Promise<Response> {
  const tabId = await ensureActiveTab();
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
  const tabId = await ensureActiveTab();
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
  const tabId = await ensureActiveTab();
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
  const tabId = await ensureActiveTab();

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
  const tabId = await ensureActiveTab();

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
  const tabId = await ensureActiveTab();

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
  const tabId = await ensureActiveTab();

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
      case "scroll":
        return await handleScroll(cmd);
      // Cookie commands
      case "cookies_get":
        return await handleCookiesGet(cmd);
      case "cookies_set":
        return await handleCookiesSet(cmd);
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
      if (activeTabId === tabId) {
        activeTabId = null;
      }
      cdp.detach(tabId).catch(() => {});
    });

    if (browser.tabGroups?.onRemoved) {
      browser.tabGroups.onRemoved.addListener((group) => {
        tabs.clearGroup(group.id);
      });
    }

    browser.debugger.onDetach.addListener((source) => {
      if (source.tabId) {
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
