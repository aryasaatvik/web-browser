/**
 * ARIA cache manager for expensive accessibility computations.
 * Implements caching with reference counting for accessible name, description,
 * hidden state, role, and pointer events computations.
 *
 * Based on Playwright's roleUtils.ts caching patterns.
 */

/**
 * Statistics about the current cache state.
 */
export interface AriaCacheStats {
  /** Whether caching is currently active */
  active: boolean;
  /** Current nesting depth of begin/end calls */
  depth: number;
  /** Number of entries in the accessible name cache */
  nameCacheSize: number;
  /** Number of entries in the hidden-inclusive name cache */
  nameHiddenCacheSize: number;
  /** Number of entries in the accessible description cache */
  descriptionCacheSize: number;
  /** Number of entries in the hidden-inclusive description cache */
  descriptionHiddenCacheSize: number;
  /** Number of entries in the hidden state cache */
  hiddenCacheSize: number;
  /** Number of entries in the role cache */
  roleCacheSize: number;
  /** Number of entries in the pointer events cache */
  pointerEventsCacheSize: number;
}

/**
 * ARIA cache manager with reference counting.
 * Manages caches for expensive ARIA computations to improve performance.
 */
class AriaCacheManager {
  private cacheCounter = 0;

  // Separate caches for different computations
  private accessibleNameCache: Map<Element, string> | undefined;
  private accessibleNameHiddenCache: Map<Element, string> | undefined;
  private accessibleDescriptionCache: Map<Element, string> | undefined;
  private accessibleDescriptionHiddenCache: Map<Element, string> | undefined;
  private isHiddenCache: Map<Element, boolean> | undefined;
  private roleCache: Map<Element, string | null> | undefined;
  private pointerEventsCache: Map<Element, boolean> | undefined;

  /**
   * Begin an ARIA caching session.
   * Multiple calls can be nested; caches are only cleared when the
   * outermost session ends.
   */
  begin(): void {
    ++this.cacheCounter;
    this.accessibleNameCache ??= new Map();
    this.accessibleNameHiddenCache ??= new Map();
    this.accessibleDescriptionCache ??= new Map();
    this.accessibleDescriptionHiddenCache ??= new Map();
    this.isHiddenCache ??= new Map();
    this.roleCache ??= new Map();
    this.pointerEventsCache ??= new Map();
  }

  /**
   * End an ARIA caching session.
   * Caches are cleared when all nested sessions have ended.
   */
  end(): void {
    if (--this.cacheCounter === 0) {
      this.clearAll();
    }
  }

  /**
   * Check if caching is currently active.
   */
  isActive(): boolean {
    return this.cacheCounter > 0;
  }

  /**
   * Get or compute accessible name.
   * @param element The element to get the name for
   * @param includeHidden Whether hidden content should be included
   * @param compute Function to compute the name if not cached
   */
  getAccessibleName(
    element: Element,
    includeHidden: boolean,
    compute: () => string
  ): string {
    const cache = includeHidden ? this.accessibleNameHiddenCache : this.accessibleNameCache;
    if (!cache) {
      return compute();
    }

    let name = cache.get(element);
    if (name === undefined) {
      name = compute();
      cache.set(element, name);
    }
    return name;
  }

  /**
   * Get or compute accessible description.
   * @param element The element to get the description for
   * @param includeHidden Whether hidden content should be included
   * @param compute Function to compute the description if not cached
   */
  getAccessibleDescription(
    element: Element,
    includeHidden: boolean,
    compute: () => string
  ): string {
    const cache = includeHidden
      ? this.accessibleDescriptionHiddenCache
      : this.accessibleDescriptionCache;
    if (!cache) {
      return compute();
    }

    let description = cache.get(element);
    if (description === undefined) {
      description = compute();
      cache.set(element, description);
    }
    return description;
  }

  /**
   * Get or compute hidden state.
   * @param element The element to check
   * @param compute Function to compute the hidden state if not cached
   */
  getIsHidden(element: Element, compute: () => boolean): boolean {
    const cache = this.isHiddenCache;
    if (!cache) {
      return compute();
    }

    let hidden = cache.get(element);
    if (hidden === undefined) {
      hidden = compute();
      cache.set(element, hidden);
    }
    return hidden;
  }

  /**
   * Get or compute role.
   * @param element The element to get the role for
   * @param compute Function to compute the role if not cached
   */
  getRole(element: Element, compute: () => string | null): string | null {
    const cache = this.roleCache;
    if (!cache) {
      return compute();
    }

    // Use a special marker for null since Map.get returns undefined for missing keys
    if (cache.has(element)) {
      return cache.get(element) ?? null;
    }

    const role = compute();
    cache.set(element, role);
    return role;
  }

  /**
   * Get or compute pointer events capability.
   * @param element The element to check
   * @param compute Function to compute pointer events state if not cached
   */
  getPointerEvents(element: Element, compute: () => boolean): boolean {
    const cache = this.pointerEventsCache;
    if (!cache) {
      return compute();
    }

    let receivesPointerEvents = cache.get(element);
    if (receivesPointerEvents === undefined) {
      receivesPointerEvents = compute();
      cache.set(element, receivesPointerEvents);
    }
    return receivesPointerEvents;
  }

  /**
   * Clear all caches.
   */
  clearAll(): void {
    this.accessibleNameCache = undefined;
    this.accessibleNameHiddenCache = undefined;
    this.accessibleDescriptionCache = undefined;
    this.accessibleDescriptionHiddenCache = undefined;
    this.isHiddenCache = undefined;
    this.roleCache = undefined;
    this.pointerEventsCache = undefined;
  }

  /**
   * Get cache statistics.
   */
  getStats(): AriaCacheStats {
    return {
      active: this.isActive(),
      depth: this.cacheCounter,
      nameCacheSize: this.accessibleNameCache?.size ?? 0,
      nameHiddenCacheSize: this.accessibleNameHiddenCache?.size ?? 0,
      descriptionCacheSize: this.accessibleDescriptionCache?.size ?? 0,
      descriptionHiddenCacheSize: this.accessibleDescriptionHiddenCache?.size ?? 0,
      hiddenCacheSize: this.isHiddenCache?.size ?? 0,
      roleCacheSize: this.roleCache?.size ?? 0,
      pointerEventsCacheSize: this.pointerEventsCache?.size ?? 0,
    };
  }
}

/**
 * Global ARIA cache manager.
 */
export const ariaCache = new AriaCacheManager();

/**
 * Begin ARIA caching session.
 * Must be paired with endAriaCaches().
 */
export function beginAriaCaches(): void {
  ariaCache.begin();
}

/**
 * End ARIA caching session.
 * Caches are cleared when all nested sessions have ended.
 */
export function endAriaCaches(): void {
  ariaCache.end();
}

/**
 * Execute function within ARIA cache session.
 * Automatically manages begin/end calls.
 *
 * @param fn Function to execute with caching enabled
 * @returns The return value of the function
 */
export function withAriaCache<T>(fn: () => T): T {
  beginAriaCaches();
  try {
    return fn();
  } finally {
    endAriaCaches();
  }
}

/**
 * Async version of withAriaCache.
 * Execute async function within ARIA cache session.
 *
 * @param fn Async function to execute with caching enabled
 * @returns Promise resolving to the return value of the function
 */
export async function withAriaCacheAsync<T>(fn: () => Promise<T>): Promise<T> {
  beginAriaCaches();
  try {
    return await fn();
  } finally {
    endAriaCaches();
  }
}
