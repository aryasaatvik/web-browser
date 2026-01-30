/**
 * DOM Caching System
 *
 * A reference-counted cache system for expensive DOM operations like getComputedStyle().
 * Based on Playwright's caching pattern from packages/injected/src/domUtils.ts.
 *
 * Usage:
 * ```ts
 * beginDOMCaches();
 * try {
 *   // Multiple calls to getCachedStyle with same element
 *   // will only call getComputedStyle once
 *   const style1 = getCachedStyle(element);
 *   const style2 = getCachedStyle(element);
 * } finally {
 *   endDOMCaches();
 * }
 *
 * // Or use the helper:
 * withCache(() => {
 *   const style = getCachedStyle(element);
 * });
 * ```
 */

/** Reference counter for nested cache sessions */
let cacheCounter = 0;

/** Cache for regular computed styles (no pseudo element) */
let styleCache: Map<Element, CSSStyleDeclaration> | undefined;

/** Cache for ::before pseudo element styles */
let styleBeforeCache: Map<Element, CSSStyleDeclaration> | undefined;

/** Cache for ::after pseudo element styles */
let styleAfterCache: Map<Element, CSSStyleDeclaration> | undefined;

/** Cache for pseudo element content values */
let pseudoContentCache: Map<Element, Map<string, string>> | undefined;

/**
 * Begin a caching session. Calls can be nested (reference counted).
 * Use this before batch DOM operations to improve performance.
 */
export function beginDOMCaches(): void {
  if (++cacheCounter === 1) {
    styleCache = new Map();
    styleBeforeCache = new Map();
    styleAfterCache = new Map();
    pseudoContentCache = new Map();
  }
}

/**
 * End a caching session. When counter reaches 0, caches are cleared.
 */
export function endDOMCaches(): void {
  // Protect against calling end without begin
  if (cacheCounter <= 0) {
    cacheCounter = 0;
    return;
  }

  if (--cacheCounter === 0) {
    styleCache = undefined;
    styleBeforeCache = undefined;
    styleAfterCache = undefined;
    pseudoContentCache = undefined;
  }
}

/**
 * Get the appropriate cache for the given pseudo selector.
 */
function getStyleCache(pseudo?: string | null): Map<Element, CSSStyleDeclaration> | undefined {
  if (pseudo === '::before') return styleBeforeCache;
  if (pseudo === '::after') return styleAfterCache;
  return styleCache;
}

/**
 * Get cached computed style for an element.
 * Returns cached value if in a cache session, otherwise calls getComputedStyle.
 *
 * @param element - The element to get computed style for
 * @param pseudo - Optional pseudo element selector (e.g., '::before', '::after')
 * @returns The computed style declaration
 */
export function getCachedStyle(
  element: Element,
  pseudo?: string | null
): CSSStyleDeclaration {
  const cache = getStyleCache(pseudo);

  if (cache) {
    let style = cache.get(element);
    if (!style) {
      const win = element.ownerDocument?.defaultView;
      if (win) {
        style = win.getComputedStyle(element, pseudo);
        cache.set(element, style);
      } else {
        // Fallback if no window available (e.g., detached element)
        return getComputedStyle(element, pseudo);
      }
    }
    return style;
  }

  // No active cache, call getComputedStyle directly
  return getComputedStyle(element, pseudo);
}

/**
 * Get cached pseudo-element content (::before, ::after).
 * Returns the 'content' property value.
 *
 * @param element - The element to get pseudo content for
 * @param pseudo - The pseudo element ('::before' or '::after')
 * @returns The content property value (e.g., '"text"', 'none', 'attr(data-label)')
 */
export function getCachedPseudoContent(
  element: Element,
  pseudo: '::before' | '::after'
): string {
  if (pseudoContentCache) {
    let elementCache = pseudoContentCache.get(element);
    if (!elementCache) {
      elementCache = new Map();
      pseudoContentCache.set(element, elementCache);
    }

    let content = elementCache.get(pseudo);
    if (content === undefined) {
      const style = getCachedStyle(element, pseudo);
      content = style.content || 'none';
      elementCache.set(pseudo, content);
    }
    return content;
  }

  // No active cache, compute directly
  const style = getComputedStyle(element, pseudo);
  return style.content || 'none';
}

/**
 * Check if caching is currently active.
 *
 * @returns true if we're inside a beginDOMCaches/endDOMCaches block
 */
export function isCachingActive(): boolean {
  return cacheCounter > 0;
}

/**
 * Get cache statistics (for debugging/testing).
 *
 * @returns Object with cache state information
 */
export function getCacheStats(): {
  active: boolean;
  depth: number;
  styleEntries: number;
  pseudoEntries: number;
} {
  const styleEntries =
    (styleCache?.size ?? 0) +
    (styleBeforeCache?.size ?? 0) +
    (styleAfterCache?.size ?? 0);

  let pseudoEntries = 0;
  if (pseudoContentCache) {
    for (const elementMap of pseudoContentCache.values()) {
      pseudoEntries += elementMap.size;
    }
  }

  return {
    active: cacheCounter > 0,
    depth: cacheCounter,
    styleEntries,
    pseudoEntries,
  };
}

/**
 * Execute a function within a cache session.
 * Automatically calls beginDOMCaches/endDOMCaches.
 *
 * @param fn - The function to execute within the cache session
 * @returns The return value of the function
 * @throws Re-throws any error from the function after clearing cache
 *
 * @example
 * ```ts
 * const result = withCache(() => {
 *   const style1 = getCachedStyle(element1);
 *   const style2 = getCachedStyle(element2);
 *   return style1.display === style2.display;
 * });
 * ```
 */
export function withCache<T>(fn: () => T): T {
  beginDOMCaches();
  try {
    return fn();
  } finally {
    endDOMCaches();
  }
}

/**
 * Async version of withCache.
 * Execute an async function within a cache session.
 *
 * Note: Be careful with long-running async operations as the cache
 * will persist until the promise resolves/rejects. This is typically
 * fine for batch DOM operations but may cause stale data if the DOM
 * changes during the async operation.
 *
 * @param fn - The async function to execute within the cache session
 * @returns A promise that resolves to the return value of the function
 * @throws Re-throws any error from the function after clearing cache
 *
 * @example
 * ```ts
 * const result = await withCacheAsync(async () => {
 *   const elements = document.querySelectorAll('.item');
 *   const results = [];
 *   for (const el of elements) {
 *     const style = getCachedStyle(el);
 *     results.push(await processStyle(style));
 *   }
 *   return results;
 * });
 * ```
 */
export async function withCacheAsync<T>(fn: () => Promise<T>): Promise<T> {
  beginDOMCaches();
  try {
    return await fn();
  } finally {
    endDOMCaches();
  }
}

/**
 * Clear all caches immediately, regardless of reference count.
 * Use this for cleanup in error scenarios or tests.
 * This resets the counter to 0.
 */
export function clearAllCaches(): void {
  cacheCounter = 0;
  styleCache = undefined;
  styleBeforeCache = undefined;
  styleAfterCache = undefined;
  pseudoContentCache = undefined;
}
