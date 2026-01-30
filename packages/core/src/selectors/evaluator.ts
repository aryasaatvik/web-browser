import { parseSelector, selectorEngines, type SelectorRoot, type SelectorEngine } from './engine.js';
import { cssEngine } from './css.js';
import { xpathEngine } from './xpath.js';
import { textEngine } from './text.js';
import { roleEngine } from './role.js';
import { registerInternalEngines, internalEngines } from './internal.js';
import { isElementVisible } from '../dom/visibility.js';
import { selectorCache, createCacheKey } from './cache.js';

// Register built-in engines
selectorEngines.register(cssEngine);
selectorEngines.register(xpathEngine);
selectorEngines.register(textEngine);
selectorEngines.register(roleEngine);

// Register internal engines
registerInternalEngines();

export interface QueryOptions {
  /**
   * Whether to include elements in shadow DOM
   */
  piercesShadowDom?: boolean;

  /**
   * Whether to only return visible elements
   */
  visibleOnly?: boolean;
}

/**
 * Query a single element using any registered selector engine.
 * Supports chained selectors with ">>" (e.g., "css=.parent >> text=child")
 *
 * When selector caching is active (via beginSelectorCaches/withSelectorCache),
 * results are cached based on the selector and root element combination.
 */
export function querySelector(
  root: SelectorRoot,
  selector: string,
  options: QueryOptions = {}
): Element | null {
  // For visibleOnly, we need to use querySelectorAll and filter
  if (options.visibleOnly) {
    const results = querySelectorAll(root, selector, options);
    return results[0] || null;
  }

  // Create cache key for this query
  const cacheKey = createCacheKey(
    `${selector}:${options.piercesShadowDom ? 'shadow' : 'light'}`,
    root
  );

  return selectorCache.cachedQuery(cacheKey, () => {
    return executeQuery(root, selector, options);
  });
}

/**
 * Execute the actual query logic (uncached).
 */
function executeQuery(
  root: SelectorRoot,
  selector: string,
  options: QueryOptions
): Element | null {
  const parts = splitSelector(selector);

  let current: SelectorRoot = root;
  for (const part of parts) {
    const { engine: engineName, body } = parseSelector(part.trim());
    const engine = selectorEngines.get(engineName);

    if (!engine) {
      console.warn(`Unknown selector engine: ${engineName}`);
      return null;
    }

    const element = options.piercesShadowDom
      ? queryShadowDom(current, body, engine)
      : engine.query(current, body);

    if (!element) return null;
    current = element;
  }

  return current instanceof Element ? current : null;
}

/**
 * Query all elements using any registered selector engine.
 *
 * When selector caching is active (via beginSelectorCaches/withSelectorCache),
 * results are cached based on the selector and root element combination.
 */
export function querySelectorAll(
  root: SelectorRoot,
  selector: string,
  options: QueryOptions = {}
): Element[] {
  // Create cache key for this query (before visibility filter)
  const cacheKey = createCacheKey(
    `all:${selector}:${options.piercesShadowDom ? 'shadow' : 'light'}`,
    root
  );

  let results = selectorCache.cachedQueryAll(cacheKey, () => {
    return executeQueryAll(root, selector, options);
  });

  // Apply visibleOnly filter if requested
  // Note: visibleOnly is not included in cache key because visibility can change
  // and we want to re-filter on each call while still caching the base query
  if (options.visibleOnly) {
    results = results.filter(isElementVisible);
  }

  return results;
}

/**
 * Execute the actual queryAll logic (uncached).
 */
function executeQueryAll(
  root: SelectorRoot,
  selector: string,
  options: QueryOptions
): Element[] {
  const parts = splitSelector(selector);

  let results: Element[];

  if (parts.length === 1) {
    const { engine: engineName, body } = parseSelector(parts[0].trim());
    const engine = selectorEngines.get(engineName);

    if (!engine) {
      console.warn(`Unknown selector engine: ${engineName}`);
      return [];
    }

    results = options.piercesShadowDom
      ? queryShadowDomAll(root, body, engine)
      : engine.queryAll(root, body);
  } else {
    // For chained selectors, we need to find all matching paths
    results = [];
    querySelectorChain(root, parts, 0, options, results);
  }

  return results;
}

function splitSelector(selector: string): string[] {
  // Split on ">>" but not inside quotes
  const parts: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];

    if (!inQuote && (char === '"' || char === "'")) {
      inQuote = true;
      quoteChar = char;
      current += char;
    } else if (inQuote && char === quoteChar) {
      inQuote = false;
      quoteChar = '';
      current += char;
    } else if (!inQuote && selector.slice(i, i + 2) === '>>') {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = '';
      i++; // Skip the second '>'
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function queryShadowDom(
  root: SelectorRoot,
  selector: string,
  engine: SelectorEngine
): Element | null {
  // First try the light DOM
  const lightResult = engine.query(root, selector);
  if (lightResult) return lightResult;

  // Then traverse shadow DOMs
  const shadows = collectShadowRoots(root);
  for (const shadow of shadows) {
    const result = engine.query(shadow, selector);
    if (result) return result;
  }

  return null;
}

function queryShadowDomAll(
  root: SelectorRoot,
  selector: string,
  engine: SelectorEngine
): Element[] {
  const results: Element[] = [];

  // Collect from light DOM
  results.push(...engine.queryAll(root, selector));

  // Collect from shadow DOMs
  const shadows = collectShadowRoots(root);
  for (const shadow of shadows) {
    results.push(...engine.queryAll(shadow, selector));
  }

  return results;
}

function collectShadowRoots(root: SelectorRoot): ShadowRoot[] {
  const shadows: ShadowRoot[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);

  let node: Element | null;
  while ((node = walker.nextNode() as Element | null)) {
    if (node.shadowRoot) {
      shadows.push(node.shadowRoot);
      shadows.push(...collectShadowRoots(node.shadowRoot));
    }
  }

  return shadows;
}

function querySelectorChain(
  root: SelectorRoot,
  parts: string[],
  index: number,
  options: QueryOptions,
  results: Element[]
): void {
  if (index >= parts.length) return;

  const { engine: engineName, body } = parseSelector(parts[index].trim());
  const engine = selectorEngines.get(engineName);

  if (!engine) return;

  const elements = options.piercesShadowDom
    ? queryShadowDomAll(root, body, engine)
    : engine.queryAll(root, body);

  if (index === parts.length - 1) {
    results.push(...elements);
  } else {
    for (const element of elements) {
      querySelectorChain(element, parts, index + 1, options, results);
    }
  }
}
