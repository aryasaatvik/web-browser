/**
 * Media capture utilities for recording and GIF generation.
 * Uses offscreen document for actual capture.
 */

let offscreenCreated = false;

/**
 * Ensure offscreen document exists.
 */
async function ensureOffscreen(): Promise<void> {
  if (offscreenCreated) return;

  // Check if offscreen document already exists
  const existingContexts = await browser.runtime.getContexts({
    contextTypes: [browser.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (existingContexts.length > 0) {
    offscreenCreated = true;
    return;
  }

  // Create offscreen document
  await browser.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [browser.offscreen.Reason.USER_MEDIA],
    justification: "Recording tab for video/GIF capture",
  });

  offscreenCreated = true;
}

/**
 * Send message to offscreen document.
 */
async function sendToOffscreen<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  await ensureOffscreen();

  return new Promise((resolve, reject) => {
    browser.runtime.sendMessage({ action, ...params }, (response) => {
      if (browser.runtime.lastError) {
        reject(new Error(browser.runtime.lastError.message));
        return;
      }
      if (!response.success) {
        reject(new Error(response.error || "Unknown error"));
        return;
      }
      resolve(response.data);
    });
  });
}

/**
 * Recording state.
 */
let isRecording = false;
let recordingTabId: number | null = null;

/**
 * Start recording a tab.
 */
export async function startRecording(tabId: number): Promise<void> {
  if (isRecording) {
    throw new Error("Recording already in progress");
  }

  // Get a media stream ID for the tab
  const streamId = await new Promise<string>((resolve, reject) => {
    browser.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      if (browser.runtime.lastError) {
        reject(new Error(browser.runtime.lastError.message));
        return;
      }
      resolve(id);
    });
  });

  await sendToOffscreen("recording:start", { streamId });

  isRecording = true;
  recordingTabId = tabId;
}

/**
 * Stop recording and return video data as base64.
 */
export async function stopRecording(): Promise<string> {
  if (!isRecording) {
    throw new Error("No recording in progress");
  }

  const data = await sendToOffscreen<string>("recording:stop", {});

  isRecording = false;
  recordingTabId = null;

  return data;
}

/**
 * Check if currently recording.
 */
export function getRecordingState(): { isRecording: boolean; tabId: number | null } {
  return { isRecording, tabId: recordingTabId };
}

/**
 * GIF capture state.
 */
let gifCapturing = false;
let gifTabId: number | null = null;

/**
 * Start GIF capture for a tab.
 */
export async function startGifCapture(tabId: number, width: number, height: number): Promise<void> {
  if (gifCapturing) {
    throw new Error("GIF capture already in progress");
  }

  await sendToOffscreen("gif:start", { width, height });

  gifCapturing = true;
  gifTabId = tabId;
}

/**
 * Add a frame to GIF capture from screenshot.
 */
export async function addGifFrame(tabId: number): Promise<void> {
  if (!gifCapturing || gifTabId !== tabId) {
    throw new Error("GIF capture not active for this tab");
  }

  // Take screenshot
  const imageData = await browser.tabs.captureVisibleTab({
    format: "png",
  });

  await sendToOffscreen("gif:addFrame", { imageData });
}

/**
 * Generate GIF from captured frames.
 */
export async function generateGif(delay: number = 100): Promise<string> {
  if (!gifCapturing) {
    throw new Error("GIF capture not active");
  }

  const data = await sendToOffscreen<string>("gif:generate", { delay });

  gifCapturing = false;
  gifTabId = null;

  return data;
}

/**
 * Check GIF capture state.
 */
export function getGifCaptureState(): { isCapturing: boolean; tabId: number | null } {
  return { isCapturing: gifCapturing, tabId: gifTabId };
}

/**
 * Take a single screenshot of a tab.
 */
export async function takeScreenshot(tabId: number, format: "png" | "jpeg" = "png", quality?: number): Promise<string> {
  // Focus the tab first
  await browser.tabs.update(tabId, { active: true });

  // Small delay to ensure tab is visible
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Capture
  const dataUrl = await browser.tabs.captureVisibleTab({
    format,
    quality: format === "jpeg" ? quality : undefined,
  });

  // Extract base64 from data URL
  return (dataUrl as string).split(",")[1];
}
