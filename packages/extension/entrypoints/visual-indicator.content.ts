/**
 * Visual indicator content script for Browser MCP.
 * Shows visual feedback for automation actions (clicks, highlights, etc.)
 */

// Indicator container
let indicatorContainer: HTMLDivElement | null = null;

/**
 * Initialize the indicator container.
 */
function ensureContainer(): HTMLDivElement {
  if (indicatorContainer && indicatorContainer.isConnected) {
    return indicatorContainer;
  }

  indicatorContainer = document.createElement("div");
  indicatorContainer.id = "browser-mcp-indicators";
  indicatorContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 2147483647;
  `;

  // Add styles
  const style = document.createElement("style");
  style.textContent = `
    #browser-mcp-indicators * {
      box-sizing: border-box;
    }

    .browser-mcp-click-indicator {
      position: absolute;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: rgba(59, 130, 246, 0.5);
      border: 2px solid rgb(59, 130, 246);
      transform: translate(-50%, -50%) scale(0);
      animation: browser-mcp-click 0.4s ease-out forwards;
    }

    @keyframes browser-mcp-click {
      0% {
        transform: translate(-50%, -50%) scale(0);
        opacity: 1;
      }
      100% {
        transform: translate(-50%, -50%) scale(2);
        opacity: 0;
      }
    }

    .browser-mcp-highlight {
      position: absolute;
      border: 3px solid rgb(59, 130, 246);
      background: rgba(59, 130, 246, 0.1);
      border-radius: 4px;
      animation: browser-mcp-pulse 1s ease-in-out infinite;
    }

    @keyframes browser-mcp-pulse {
      0%, 100% {
        border-color: rgb(59, 130, 246);
        box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
      }
      50% {
        border-color: rgb(99, 102, 241);
        box-shadow: 0 0 0 8px rgba(59, 130, 246, 0);
      }
    }

    .browser-mcp-tooltip {
      position: absolute;
      background: rgb(17, 24, 39);
      color: white;
      padding: 6px 10px;
      border-radius: 6px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      animation: browser-mcp-fade-in 0.2s ease-out;
    }

    @keyframes browser-mcp-fade-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .browser-mcp-typing-indicator {
      position: absolute;
      background: rgb(17, 24, 39);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 11px;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      animation: browser-mcp-fade-in 0.2s ease-out;
    }

    .browser-mcp-scroll-indicator {
      position: fixed;
      right: 20px;
      top: 50%;
      transform: translateY(-50%);
      width: 40px;
      height: 80px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(17, 24, 39, 0.8);
      border-radius: 20px;
      color: white;
      animation: browser-mcp-fade-in 0.2s ease-out;
    }

    .browser-mcp-scroll-arrow {
      width: 0;
      height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
    }

    .browser-mcp-scroll-arrow.up {
      border-bottom: 10px solid white;
      animation: browser-mcp-bounce-up 0.5s ease-in-out infinite;
    }

    .browser-mcp-scroll-arrow.down {
      border-top: 10px solid white;
      animation: browser-mcp-bounce-down 0.5s ease-in-out infinite;
    }

    @keyframes browser-mcp-bounce-up {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }

    @keyframes browser-mcp-bounce-down {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(4px); }
    }
  `;

  indicatorContainer.appendChild(style);
  document.body.appendChild(indicatorContainer);

  return indicatorContainer;
}

/**
 * Show a click indicator at the specified position.
 */
function showClickIndicator(x: number, y: number): void {
  const container = ensureContainer();

  const indicator = document.createElement("div");
  indicator.className = "browser-mcp-click-indicator";
  indicator.style.left = `${x}px`;
  indicator.style.top = `${y}px`;

  container.appendChild(indicator);

  // Remove after animation
  setTimeout(() => indicator.remove(), 400);
}

/**
 * Show a highlight around an element.
 */
function showHighlight(bounds: DOMRect, label?: string): () => void {
  const container = ensureContainer();

  const highlight = document.createElement("div");
  highlight.className = "browser-mcp-highlight";
  highlight.style.left = `${bounds.x - 3}px`;
  highlight.style.top = `${bounds.y - 3}px`;
  highlight.style.width = `${bounds.width + 6}px`;
  highlight.style.height = `${bounds.height + 6}px`;

  container.appendChild(highlight);

  // Add tooltip if label provided
  let tooltip: HTMLDivElement | null = null;
  if (label) {
    tooltip = document.createElement("div");
    tooltip.className = "browser-mcp-tooltip";
    tooltip.textContent = label;
    tooltip.style.left = `${bounds.x}px`;
    tooltip.style.top = `${bounds.y - 30}px`;
    container.appendChild(tooltip);
  }

  // Return cleanup function
  return () => {
    highlight.remove();
    tooltip?.remove();
  };
}

/**
 * Show typing indicator near an element.
 */
function showTypingIndicator(bounds: DOMRect, text: string): () => void {
  const container = ensureContainer();

  const indicator = document.createElement("div");
  indicator.className = "browser-mcp-typing-indicator";
  indicator.textContent = text;
  indicator.style.left = `${bounds.x}px`;
  indicator.style.top = `${bounds.y + bounds.height + 4}px`;

  container.appendChild(indicator);

  return () => indicator.remove();
}

/**
 * Show scroll indicator.
 */
function showScrollIndicator(direction: "up" | "down"): () => void {
  const container = ensureContainer();

  const indicator = document.createElement("div");
  indicator.className = "browser-mcp-scroll-indicator";

  const arrow = document.createElement("div");
  arrow.className = `browser-mcp-scroll-arrow ${direction}`;
  indicator.appendChild(arrow);

  container.appendChild(indicator);

  return () => indicator.remove();
}

/**
 * Clear all indicators.
 */
function clearIndicators(): void {
  if (indicatorContainer) {
    // Remove all children except the style element
    const style = indicatorContainer.querySelector("style");
    indicatorContainer.innerHTML = "";
    if (style) {
      indicatorContainer.appendChild(style);
    }
  }
}

// Active cleanups
const activeCleanups: Map<string, () => void> = new Map();

// Message handler
browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { action, ...params } = message;

  try {
    switch (action) {
      case "indicator:click": {
        showClickIndicator(params.x, params.y);
        sendResponse({ success: true });
        break;
      }
      case "indicator:highlight": {
        const id = params.id || `highlight_${Date.now()}`;
        const cleanup = showHighlight(params.bounds, params.label);
        activeCleanups.set(id, cleanup);
        sendResponse({ success: true, id });
        break;
      }
      case "indicator:typing": {
        const id = params.id || `typing_${Date.now()}`;
        const cleanup = showTypingIndicator(params.bounds, params.text);
        activeCleanups.set(id, cleanup);
        sendResponse({ success: true, id });
        break;
      }
      case "indicator:scroll": {
        const id = params.id || `scroll_${Date.now()}`;
        const cleanup = showScrollIndicator(params.direction);
        activeCleanups.set(id, cleanup);
        sendResponse({ success: true, id });
        break;
      }
      case "indicator:remove": {
        const cleanup = activeCleanups.get(params.id);
        if (cleanup) {
          cleanup();
          activeCleanups.delete(params.id);
        }
        sendResponse({ success: true });
        break;
      }
      case "indicator:clear": {
        for (const cleanup of activeCleanups.values()) {
          cleanup();
        }
        activeCleanups.clear();
        clearIndicators();
        sendResponse({ success: true });
        break;
      }
      default:
        // Not for us
        return false;
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    sendResponse({ success: false, error });
  }

  return true;
});

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  main() {
    // Visual indicators ready
  },
});
