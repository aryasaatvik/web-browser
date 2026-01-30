/**
 * Core bridge content script for Web Browser MCP extension.
 * Runs in the main world to access page's DOM with full capabilities.
 * Exposes @web-browser/core functionality via postMessage API.
 */

import {
  generateA11yTree,
  formatA11yTree,
  getElementByRef,
  getElementRef,
  clearElementRefs,
  getClickablePoint,
  isElementVisible,
  getElementCenter,
  isElementInteractable,
  // Selector engine
  querySelector as coreQuerySelector,
  querySelectorAll as coreQuerySelectorAll,
  // Keyboard input
  getKeyDefinition,
  parseKeyCombinationSmart,
  // DOM utilities
  waitForElementStable,
  expectHitTarget,
  describeElement,
} from '@web-browser/core';

interface BridgeRequest {
  type: 'BROWSER_MCP_REQUEST';
  id: string;
  action: string;
  params: Record<string, unknown>;
}

interface BridgeResponse {
  type: 'BROWSER_MCP_RESPONSE';
  id: string;
  success: boolean;
  [key: string]: unknown;
}

type HandlerResult = Record<string, unknown> & { success: boolean; error?: string };
type Handler = (params: Record<string, unknown>) => HandlerResult | Promise<HandlerResult>;

const handlers: Record<string, Handler> = {
  snapshot: (params) => {
    try {
      let root: Element | Document = document;

      // Support selector scoping using core's querySelector
      if (params.selector) {
        const element = coreQuerySelector(document.documentElement, params.selector as string, {
          piercesShadowDom: true,
        });
        if (!element) {
          return { success: false, error: `No elements match selector: ${params.selector}` };
        }
        root = element;
      }

      const nodes = generateA11yTree(root, {
        includeBbox: params.includeBbox as boolean,
        interactiveOnly: params.interactiveOnly as boolean,
        pierceShadowDom: true,
      });
      return { success: true, tree: formatA11yTree(nodes), nodeCount: nodes.length };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  getClickablePoint: (params) => {
    const element = getElementByRef(params.ref as string);
    if (!element) {
      return { success: false, error: `Element not found: ${params.ref}` };
    }
    if (!isElementInteractable(element)) {
      return { success: false, error: 'Element not interactable' };
    }
    const point = getClickablePoint(element);
    if (!point) {
      return { success: false, error: 'No clickable point found' };
    }
    return { success: true, x: point.x, y: point.y };
  },

  getElementCenter: (params) => {
    const element = getElementByRef(params.ref as string);
    if (!element) {
      return { success: false, error: `Element not found: ${params.ref}` };
    }
    const center = getElementCenter(element);
    return { success: true, x: center.x, y: center.y };
  },

  isVisible: (params) => {
    const element = getElementByRef(params.ref as string);
    if (!element) {
      return { success: false, error: `Element not found: ${params.ref}` };
    }
    return { success: true, visible: isElementVisible(element) };
  },

  isInteractable: (params) => {
    const element = getElementByRef(params.ref as string);
    if (!element) {
      return { success: false, error: `Element not found: ${params.ref}` };
    }
    return { success: true, interactable: isElementInteractable(element) };
  },

  getText: (params) => {
    const element = getElementByRef(params.ref as string);
    if (!element) {
      return { success: false, error: `Element not found: ${params.ref}` };
    }
    return { success: true, text: element.textContent?.trim() || '' };
  },

  getValue: (params) => {
    const element = getElementByRef(params.ref as string);
    if (!element) {
      return { success: false, error: `Element not found: ${params.ref}` };
    }
    const value = (element as HTMLInputElement).value ?? element.textContent ?? '';
    return { success: true, value };
  },

  getBounds: (params) => {
    const element = getElementByRef(params.ref as string);
    if (!element) {
      return { success: false, error: `Element not found: ${params.ref}` };
    }
    const rect = element.getBoundingClientRect();
    return {
      success: true,
      bounds: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      },
    };
  },

  scrollIntoView: (params) => {
    const element = getElementByRef(params.ref as string);
    if (!element) {
      return { success: false, error: `Element not found: ${params.ref}` };
    }
    element.scrollIntoView({
      behavior: (params.behavior as ScrollBehavior) || 'smooth',
      block: (params.block as ScrollLogicalPosition) || 'center',
    });
    return { success: true };
  },

  focus: (params) => {
    const element = getElementByRef(params.ref as string);
    if (!element) {
      return { success: false, error: `Element not found: ${params.ref}` };
    }
    if (element instanceof HTMLElement) {
      element.focus();
      return { success: true };
    }
    return { success: false, error: 'Element cannot be focused' };
  },

  click: (params) => {
    const element = getElementByRef(params.ref as string);
    if (!element) {
      return { success: false, error: `Element not found: ${params.ref}` };
    }
    if (element instanceof HTMLElement) {
      element.click();
      return { success: true };
    }
    return { success: false, error: 'Element cannot be clicked' };
  },

  setValue: (params) => {
    const element = getElementByRef(params.ref as string);
    if (!element) {
      return { success: false, error: `Element not found: ${params.ref}` };
    }
    const value = params.value as string;

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    }

    if (element instanceof HTMLSelectElement) {
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    }

    return { success: false, error: 'Element is not a form input' };
  },

  // Selector engine - Playwright-style selectors (css=, xpath=, text=, role=, >> chaining)
  querySelector: (params) => {
    const { selector, all, root } = params;
    const rootElement = root ? getElementByRef(root as string) : document.documentElement;

    if (!rootElement) {
      return { success: false, error: 'Root element not found' };
    }

    try {
      if (all) {
        const elements = coreQuerySelectorAll(rootElement, selector as string, {
          piercesShadowDom: true,
        });
        const refs = elements.map((el) => getElementRef(el));
        return { success: true, refs, count: refs.length };
      } else {
        const element = coreQuerySelector(rootElement, selector as string, {
          piercesShadowDom: true,
        });
        if (!element) {
          return { success: false, error: 'No element matches selector' };
        }
        const ref = getElementRef(element);
        return { success: true, ref };
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  // Key definition lookup for keyboard handling
  getKeyDefinition: (params) => {
    const { key } = params;
    const keyDef = getKeyDefinition(key as string);
    if (!keyDef) {
      return { success: false, error: `Unknown key: ${key}` };
    }
    return {
      success: true,
      key: keyDef.key,
      code: keyDef.code,
      keyCode: keyDef.keyCode,
      location: keyDef.location || 0,
      text: keyDef.text,
    };
  },

  // Parse key combination with smart modifier support (CmdOrCtrl, etc.)
  parseKeyCombination: (params) => {
    const { combo, platform } = params;
    try {
      const result = parseKeyCombinationSmart(
        combo as string,
        platform as 'mac' | 'windows' | 'linux' | undefined
      );
      return {
        success: true,
        modifiers: result.modifiers,
        key: result.key
          ? {
              key: result.key.key,
              code: result.key.code,
              keyCode: result.key.keyCode,
              location: result.key.location || 0,
            }
          : null,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  // DOM Stability - wait for element to stop moving/resizing
  waitForStable: async (params) => {
    const element = getElementByRef(params.ref as string);
    if (!element) {
      return { success: false, error: `Element not found: ${params.ref}` };
    }

    try {
      const result = await waitForElementStable(element, {
        timeout: (params.timeout as number) || 5000,
        frameCount: (params.frameCount as number) || 2,
      });

      return {
        success: result.stable,
        stable: result.stable,
        reason: result.reason,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  // Hit target check - verify a click point will hit the expected element
  checkHitTarget: (params) => {
    const element = getElementByRef(params.ref as string);
    if (!element) {
      return { success: false, error: `Element not found: ${params.ref}` };
    }

    const x = params.x as number;
    const y = params.y as number;

    if (typeof x !== 'number' || typeof y !== 'number') {
      return { success: false, error: 'x and y coordinates are required' };
    }

    try {
      const result = expectHitTarget({ x, y }, element);
      return {
        success: true,
        willHit: result.success,
        blocked: result.blocked,
        blockedBy: result.hitTargetDescription,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  // Describe element - get human-readable element description
  describeElement: (params) => {
    const element = getElementByRef(params.ref as string);
    if (!element) {
      return { success: false, error: `Element not found: ${params.ref}` };
    }

    return {
      success: true,
      description: describeElement(element),
    };
  },

  clearRefs: () => {
    clearElementRefs();
    return { success: true };
  },

  getPageText: () => {
    return { success: true, text: document.body?.innerText || '' };
  },

  getPageMetadata: () => {
    const description = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    return {
      success: true,
      url: window.location.href,
      title: document.title,
      description,
    };
  },
};

export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    // Listen for bridge requests from the isolated content script
    window.addEventListener('message', (event) => {
      // Only accept messages from the same window
      if (event.source !== window) return;
      if (!event.data || event.data.type !== 'BROWSER_MCP_REQUEST') return;

      const { id, action, params } = event.data as BridgeRequest;

      const handler = handlers[action];
      if (!handler) {
        const response: BridgeResponse = {
          type: 'BROWSER_MCP_RESPONSE',
          id,
          success: false,
          error: `Unknown action: ${action}`,
        };
        window.postMessage(response, '*');
        return;
      }

      // Handle both sync and async handlers
      Promise.resolve()
        .then(() => handler(params || {}))
        .then((result) => {
          const response: BridgeResponse = {
            type: 'BROWSER_MCP_RESPONSE',
            id,
            ...result,
          };
          window.postMessage(response, '*');
        })
        .catch((err) => {
          const response: BridgeResponse = {
            type: 'BROWSER_MCP_RESPONSE',
            id,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
          window.postMessage(response, '*');
        });
    });

    // Clear refs when page unloads to prevent stale references
    window.addEventListener('beforeunload', () => {
      clearElementRefs();
    });

    // Signal that the bridge is ready
    window.postMessage({ type: 'BROWSER_MCP_BRIDGE_READY' }, '*');
  },
});
