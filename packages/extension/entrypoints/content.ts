/**
 * Content script relay for Browser MCP extension.
 * Bridges messages from background script to main world core bridge.
 * Runs in isolated world, relays messages via postMessage.
 */

interface BridgeResponse {
  type: string;
  id: string;
  success: boolean;
  [key: string]: unknown;
}

// Pending requests waiting for responses from core bridge
const pending = new Map<string, (result: Record<string, unknown>) => void>();

// Listen for responses from the main-world core bridge
window.addEventListener('message', (event) => {
  // Only accept messages from the same window
  if (event.source !== window) return;
  if (!event.data || event.data.type !== 'BROWSER_MCP_RESPONSE') return;

  const { id, ...result } = event.data as BridgeResponse;
  const resolver = pending.get(id);
  if (resolver) {
    pending.delete(id);
    resolver(result);
  }
});

// Listen for messages from background script
browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { action, params } = message as { action: string; params?: Record<string, unknown> };

  // Generate a unique ID for this request
  const id = crypto.randomUUID();

  // Store the resolver for this request
  pending.set(id, (result) => {
    sendResponse(result);
  });

  // Set a timeout to avoid hanging forever
  const timeout = setTimeout(() => {
    if (pending.has(id)) {
      pending.delete(id);
      sendResponse({ success: false, error: 'Timeout waiting for core bridge response' });
    }
  }, 10000);

  // Clean up timeout when resolved
  const originalResolver = pending.get(id)!;
  pending.set(id, (result) => {
    clearTimeout(timeout);
    originalResolver(result);
  });

  // Forward the request to the main-world core bridge
  window.postMessage(
    {
      type: 'BROWSER_MCP_REQUEST',
      id,
      action,
      params: params || {},
    },
    '*'
  );

  // Return true to indicate we'll call sendResponse asynchronously
  return true;
});

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    console.log('[Browser MCP] Content script relay loaded');
  },
});
