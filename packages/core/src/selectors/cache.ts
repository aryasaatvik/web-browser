/**
 * Selector Query Cache System
 *
 * A reference-counted cache system for expensive selector operations.
 * Based on Playwright's caching pattern from packages/injected/src/selectorEvaluator.ts.
 *
 * This cache improves performance when the same selectors are queried multiple times
 * within a single operation (e.g., during accessibility tree construction).
 *
 * Usage:
 * ```ts
 * beginSelectorCaches();
 * try {
 *   // Multiple calls with same selector will use cached results
 *   const el1 = querySelector(root, '.btn');
 *   const el2 = querySelector(root, '.btn'); // Returns cached result
 * } finally {
 *   endSelectorCaches();
 * }
 *
 * // Or use the helper:
 * withSelectorCache(() => {
 *   const el = querySelector(root, '.btn');
 * });
 * ```
 */

import type { SelectorRoot } from './engine.js';

/**
 * Cache key type combining selector and root element identifier.
 */
export type CacheKey = string;

/** Counter for generating unique cache IDs for root elements */
let cacheIdCounter = 0;

/** Symbol for storing cache ID on elements */
const CACHE_ID_SYMBOL = Symbol('selectorCacheId');

/**
 * Check if a node is a Document.
 * Uses nodeType check for compatibility with different DOM implementations.
 */
function isDocument(node: Node): node is Document {
  return node.nodeType === 9; // Node.DOCUMENT_NODE
}

/**
 * Check if a node is a ShadowRoot.
 * Uses nodeType check for compatibility with different DOM implementations.
 */
function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === 11 && 'host' in node; // Node.DOCUMENT_FRAGMENT_NODE with host
}

/**
 * Create a cache key from selector and root element.
 * Uses a stable element identifier to enable cache hits across calls.
 *
 * @param selector - The selector string
 * @param root - The root element or document to query from
 * @returns A unique cache key string
 */
export function createCacheKey(selector: string, root: SelectorRoot): CacheKey {
  let rootId: string | number;

  if (isDocument(root)) {
    rootId = 'document';
  } else if (isShadowRoot(root)) {
    // ShadowRoot doesn't have a stable identity, use the host element's ID
    const host = root.host;
    rootId = `shadow:${getCacheId(host)}`;
  } else {
    // Element - use or create a cache ID
    rootId = getCacheId(root as Element);
  }

  return `${rootId}:${selector}`;
}

/**
 * Get or create a cache ID for an element.
 */
function getCacheId(element: Element): number {
  const cached = (element as Element & { [CACHE_ID_SYMBOL]?: number })[CACHE_ID_SYMBOL];
  if (cached !== undefined) {
    return cached;
  }
  const id = ++cacheIdCounter;
  (element as Element & { [CACHE_ID_SYMBOL]?: number })[CACHE_ID_SYMBOL] = id;
  return id;
}

/**
 * Cache statistics for monitoring and debugging.
 */
export interface SelectorCacheStats {
  /** Whether caching is currently active */
  active: boolean;
  /** Current nesting depth of cache sessions */
  depth: number;
  /** Number of cache hits for querySelector */
  queryHits: number;
  /** Number of cache misses for querySelector */
  queryMisses: number;
  /** Number of cache hits for querySelectorAll */
  queryAllHits: number;
  /** Number of cache misses for querySelectorAll */
  queryAllMisses: number;
  /** Number of cache hits for matches */
  matchesHits: number;
  /** Number of cache misses for matches */
  matchesMisses: number;
  /** Number of cache hits for text content */
  textHits: number;
  /** Number of cache misses for text content */
  textMisses: number;
  /** Number of entries in query cache */
  queryEntries: number;
  /** Number of entries in queryAll cache */
  queryAllEntries: number;
  /** Number of entries in matches cache */
  matchesEntries: number;
  /** Number of entries in text cache */
  textEntries: number;
}

/**
 * Selector query cache manager with reference counting.
 *
 * Manages caches for different query patterns:
 * - query: Single element results from querySelector
 * - queryAll: Array results from querySelectorAll
 * - matches: Boolean results from element.matches()
 * - text: Cached text content for elements
 */
export class SelectorCacheManager {
  private cacheCounter = 0;

  // Different cache types for different query patterns
  private queryCache: Map<CacheKey, Element | null> | undefined;
  private queryAllCache: Map<CacheKey, Element[]> | undefined;
  private matchesCache: Map<CacheKey, boolean> | undefined;
  private textCache: Map<Element, string> | undefined;

  // Statistics tracking
  private _queryHits = 0;
  private _queryMisses = 0;
  private _queryAllHits = 0;
  private _queryAllMisses = 0;
  private _matchesHits = 0;
  private _matchesMisses = 0;
  private _textHits = 0;
  private _textMisses = 0;

  /**
   * Begin a caching session. Can be nested.
   * Each begin() must be paired with an end() call.
   */
  begin(): void {
    if (++this.cacheCounter === 1) {
      this.queryCache = new Map();
      this.queryAllCache = new Map();
      this.matchesCache = new Map();
      this.textCache = new Map();
      // Reset statistics for new session
      this._queryHits = 0;
      this._queryMisses = 0;
      this._queryAllHits = 0;
      this._queryAllMisses = 0;
      this._matchesHits = 0;
      this._matchesMisses = 0;
      this._textHits = 0;
      this._textMisses = 0;
    }
  }

  /**
   * End a caching session. Clears caches when counter reaches 0.
   */
  end(): void {
    // Protect against calling end without begin
    if (this.cacheCounter <= 0) {
      this.cacheCounter = 0;
      return;
    }

    if (--this.cacheCounter === 0) {
      this.queryCache = undefined;
      this.queryAllCache = undefined;
      this.matchesCache = undefined;
      this.textCache = undefined;
    }
  }

  /**
   * Check if caching is currently active.
   */
  isActive(): boolean {
    return this.cacheCounter > 0;
  }

  /**
   * Get cached query result or execute and cache.
   *
   * @param key - Cache key from createCacheKey
   * @param executor - Function to execute if not cached
   * @returns The cached or newly computed result
   */
  cachedQuery(key: CacheKey, executor: () => Element | null): Element | null {
    if (!this.queryCache) {
      return executor();
    }

    if (this.queryCache.has(key)) {
      this._queryHits++;
      return this.queryCache.get(key) ?? null;
    }

    this._queryMisses++;
    const result = executor();
    this.queryCache.set(key, result);
    return result;
  }

  /**
   * Get cached queryAll result or execute and cache.
   *
   * @param key - Cache key from createCacheKey
   * @param executor - Function to execute if not cached
   * @returns The cached or newly computed result array
   */
  cachedQueryAll(key: CacheKey, executor: () => Element[]): Element[] {
    if (!this.queryAllCache) {
      return executor();
    }

    const cached = this.queryAllCache.get(key);
    if (cached !== undefined) {
      this._queryAllHits++;
      return cached;
    }

    this._queryAllMisses++;
    const result = executor();
    this.queryAllCache.set(key, result);
    return result;
  }

  /**
   * Get cached matches result or execute and cache.
   *
   * @param key - Cache key (typically element + selector based)
   * @param executor - Function to execute if not cached
   * @returns The cached or newly computed boolean result
   */
  cachedMatches(key: CacheKey, executor: () => boolean): boolean {
    if (!this.matchesCache) {
      return executor();
    }

    const cached = this.matchesCache.get(key);
    if (cached !== undefined) {
      this._matchesHits++;
      return cached;
    }

    this._matchesMisses++;
    const result = executor();
    this.matchesCache.set(key, result);
    return result;
  }

  /**
   * Get cached text content or compute and cache.
   *
   * @param element - The element to get text content for
   * @param executor - Function to compute text if not cached
   * @returns The cached or newly computed text content
   */
  cachedText(element: Element, executor: () => string): string {
    if (!this.textCache) {
      return executor();
    }

    const cached = this.textCache.get(element);
    if (cached !== undefined) {
      this._textHits++;
      return cached;
    }

    this._textMisses++;
    const result = executor();
    this.textCache.set(element, result);
    return result;
  }

  /**
   * Get cache statistics for debugging.
   */
  getStats(): SelectorCacheStats {
    return {
      active: this.cacheCounter > 0,
      depth: this.cacheCounter,
      queryHits: this._queryHits,
      queryMisses: this._queryMisses,
      queryAllHits: this._queryAllHits,
      queryAllMisses: this._queryAllMisses,
      matchesHits: this._matchesHits,
      matchesMisses: this._matchesMisses,
      textHits: this._textHits,
      textMisses: this._textMisses,
      queryEntries: this.queryCache?.size ?? 0,
      queryAllEntries: this.queryAllCache?.size ?? 0,
      matchesEntries: this.matchesCache?.size ?? 0,
      textEntries: this.textCache?.size ?? 0,
    };
  }

  /**
   * Clear all caches immediately, regardless of reference count.
   * Resets the counter to 0.
   */
  clearAll(): void {
    this.cacheCounter = 0;
    this.queryCache = undefined;
    this.queryAllCache = undefined;
    this.matchesCache = undefined;
    this.textCache = undefined;
    this._queryHits = 0;
    this._queryMisses = 0;
    this._queryAllHits = 0;
    this._queryAllMisses = 0;
    this._matchesHits = 0;
    this._matchesMisses = 0;
    this._textHits = 0;
    this._textMisses = 0;
  }
}

/**
 * Global selector cache manager instance.
 */
export const selectorCache = new SelectorCacheManager();

/**
 * Begin selector caching session.
 * Calls can be nested (reference counted).
 */
export function beginSelectorCaches(): void {
  selectorCache.begin();
}

/**
 * End selector caching session.
 * When counter reaches 0, caches are cleared.
 */
export function endSelectorCaches(): void {
  selectorCache.end();
}

/**
 * Check if selector caching is currently active.
 */
export function isSelectorCachingActive(): boolean {
  return selectorCache.isActive();
}

/**
 * Get selector cache statistics.
 */
export function getSelectorCacheStats(): SelectorCacheStats {
  return selectorCache.getStats();
}

/**
 * Execute function within a cache session.
 * Automatically calls begin/end.
 *
 * @param fn - The function to execute within the cache session
 * @returns The return value of the function
 * @throws Re-throws any error from the function after clearing cache
 *
 * @example
 * ```ts
 * const result = withSelectorCache(() => {
 *   const btn = querySelector(root, 'button');
 *   const inputs = querySelectorAll(root, 'input');
 *   return { btn, inputs };
 * });
 * ```
 */
export function withSelectorCache<T>(fn: () => T): T {
  beginSelectorCaches();
  try {
    return fn();
  } finally {
    endSelectorCaches();
  }
}

/**
 * Async version of withSelectorCache.
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
 * const results = await withSelectorCacheAsync(async () => {
 *   const items = querySelectorAll(root, '.item');
 *   return Promise.all(items.map(processItem));
 * });
 * ```
 */
export async function withSelectorCacheAsync<T>(
  fn: () => Promise<T>
): Promise<T> {
  beginSelectorCaches();
  try {
    return await fn();
  } finally {
    endSelectorCaches();
  }
}

/**
 * Clear all selector caches immediately.
 * Use for cleanup in error scenarios or tests.
 */
export function clearSelectorCaches(): void {
  selectorCache.clearAll();
}
