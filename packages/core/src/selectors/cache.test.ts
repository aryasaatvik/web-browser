/**
 * Tests for selector query caching system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SelectorCacheManager,
  selectorCache,
  createCacheKey,
  beginSelectorCaches,
  endSelectorCaches,
  isSelectorCachingActive,
  getSelectorCacheStats,
  withSelectorCache,
  withSelectorCacheAsync,
  clearSelectorCaches,
} from './cache.js';

describe('Selector Cache', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    // Always clean up cache state
    clearSelectorCaches();
  });

  describe('createCacheKey', () => {
    it('should create unique keys for different selectors on same root', () => {
      const key1 = createCacheKey('.foo', container);
      const key2 = createCacheKey('.bar', container);

      expect(key1).not.toBe(key2);
    });

    it('should create same key for same selector and root', () => {
      const key1 = createCacheKey('.foo', container);
      const key2 = createCacheKey('.foo', container);

      expect(key1).toBe(key2);
    });

    it('should create different keys for same selector on different roots', () => {
      const otherContainer = document.createElement('div');
      document.body.appendChild(otherContainer);

      const key1 = createCacheKey('.foo', container);
      const key2 = createCacheKey('.foo', otherContainer);

      expect(key1).not.toBe(key2);

      otherContainer.remove();
    });

    it('should handle document as root', () => {
      const key = createCacheKey('.foo', document);
      expect(key).toContain('document');
    });

    it('should handle shadow roots', () => {
      const host = document.createElement('div');
      container.appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });

      const key = createCacheKey('.foo', shadow);
      expect(key).toContain('shadow:');
    });

    it('should create stable keys across multiple calls', () => {
      const keys: string[] = [];
      for (let i = 0; i < 10; i++) {
        keys.push(createCacheKey('.selector', container));
      }

      // All keys should be identical
      expect(new Set(keys).size).toBe(1);
    });
  });

  describe('SelectorCacheManager', () => {
    let manager: SelectorCacheManager;

    beforeEach(() => {
      manager = new SelectorCacheManager();
    });

    describe('begin / end', () => {
      it('should activate caching on begin', () => {
        expect(manager.isActive()).toBe(false);

        manager.begin();
        expect(manager.isActive()).toBe(true);

        manager.end();
        expect(manager.isActive()).toBe(false);
      });

      it('should support nested begin/end calls', () => {
        expect(manager.getStats().depth).toBe(0);

        manager.begin();
        expect(manager.getStats().depth).toBe(1);

        manager.begin();
        expect(manager.getStats().depth).toBe(2);

        manager.begin();
        expect(manager.getStats().depth).toBe(3);

        manager.end();
        expect(manager.getStats().depth).toBe(2);
        expect(manager.isActive()).toBe(true);

        manager.end();
        expect(manager.getStats().depth).toBe(1);
        expect(manager.isActive()).toBe(true);

        manager.end();
        expect(manager.getStats().depth).toBe(0);
        expect(manager.isActive()).toBe(false);
      });

      it('should clear cache when counter reaches 0', () => {
        const executor = vi.fn(() => container);

        manager.begin();
        manager.cachedQuery('key1', executor);
        expect(manager.getStats().queryEntries).toBe(1);

        manager.end();
        expect(manager.getStats().queryEntries).toBe(0);
      });

      it('should preserve cache during nested calls', () => {
        const executor = vi.fn(() => container);

        manager.begin();
        manager.cachedQuery('key1', executor);
        expect(manager.getStats().queryEntries).toBe(1);

        manager.begin();
        expect(manager.getStats().queryEntries).toBe(1); // Still cached

        manager.end();
        expect(manager.getStats().queryEntries).toBe(1); // Still cached (depth is 1)

        manager.end();
        expect(manager.getStats().queryEntries).toBe(0); // Now cleared
      });

      it('should protect against negative counter', () => {
        expect(manager.getStats().depth).toBe(0);

        // Call end without begin
        manager.end();
        expect(manager.getStats().depth).toBe(0);

        manager.end();
        expect(manager.getStats().depth).toBe(0);

        // Should still work normally after
        manager.begin();
        expect(manager.getStats().depth).toBe(1);

        manager.end();
        expect(manager.getStats().depth).toBe(0);
      });
    });

    describe('cachedQuery', () => {
      it('should cache query results', () => {
        const executor = vi.fn(() => container);

        manager.begin();

        const result1 = manager.cachedQuery('key1', executor);
        const result2 = manager.cachedQuery('key1', executor);
        const result3 = manager.cachedQuery('key1', executor);

        expect(result1).toBe(container);
        expect(result2).toBe(container);
        expect(result3).toBe(container);

        // Executor should only be called once
        expect(executor).toHaveBeenCalledTimes(1);

        manager.end();
      });

      it('should cache null results', () => {
        const executor = vi.fn(() => null);

        manager.begin();

        const result1 = manager.cachedQuery('key1', executor);
        const result2 = manager.cachedQuery('key1', executor);

        expect(result1).toBeNull();
        expect(result2).toBeNull();

        // Executor should only be called once even for null
        expect(executor).toHaveBeenCalledTimes(1);

        manager.end();
      });

      it('should cache different keys separately', () => {
        const executor1 = vi.fn(() => container);
        const element2 = document.createElement('span');
        const executor2 = vi.fn(() => element2);

        manager.begin();

        manager.cachedQuery('key1', executor1);
        manager.cachedQuery('key2', executor2);

        expect(executor1).toHaveBeenCalledTimes(1);
        expect(executor2).toHaveBeenCalledTimes(1);

        expect(manager.getStats().queryEntries).toBe(2);

        manager.end();
      });

      it('should execute directly when cache is inactive', () => {
        const executor = vi.fn(() => container);

        // Cache is not active
        manager.cachedQuery('key1', executor);
        manager.cachedQuery('key1', executor);
        manager.cachedQuery('key1', executor);

        // Each call goes to executor
        expect(executor).toHaveBeenCalledTimes(3);
      });

      it('should track hits and misses', () => {
        const executor = vi.fn(() => container);

        manager.begin();

        manager.cachedQuery('key1', executor); // miss
        manager.cachedQuery('key1', executor); // hit
        manager.cachedQuery('key1', executor); // hit
        manager.cachedQuery('key2', executor); // miss

        expect(manager.getStats().queryHits).toBe(2);
        expect(manager.getStats().queryMisses).toBe(2);

        manager.end();
      });
    });

    describe('cachedQueryAll', () => {
      it('should cache queryAll results', () => {
        const elements = [document.createElement('div'), document.createElement('span')];
        const executor = vi.fn(() => elements);

        manager.begin();

        const result1 = manager.cachedQueryAll('key1', executor);
        const result2 = manager.cachedQueryAll('key1', executor);

        expect(result1).toBe(elements);
        expect(result2).toBe(elements);
        expect(executor).toHaveBeenCalledTimes(1);

        manager.end();
      });

      it('should cache empty arrays', () => {
        const executor = vi.fn(() => []);

        manager.begin();

        const result1 = manager.cachedQueryAll('key1', executor);
        const result2 = manager.cachedQueryAll('key1', executor);

        expect(result1).toEqual([]);
        expect(result2).toEqual([]);
        expect(executor).toHaveBeenCalledTimes(1);

        manager.end();
      });

      it('should track hits and misses', () => {
        const executor = vi.fn(() => []);

        manager.begin();

        manager.cachedQueryAll('key1', executor); // miss
        manager.cachedQueryAll('key1', executor); // hit
        manager.cachedQueryAll('key2', executor); // miss

        expect(manager.getStats().queryAllHits).toBe(1);
        expect(manager.getStats().queryAllMisses).toBe(2);

        manager.end();
      });
    });

    describe('cachedMatches', () => {
      it('should cache matches results', () => {
        const executor = vi.fn(() => true);

        manager.begin();

        const result1 = manager.cachedMatches('key1', executor);
        const result2 = manager.cachedMatches('key1', executor);

        expect(result1).toBe(true);
        expect(result2).toBe(true);
        expect(executor).toHaveBeenCalledTimes(1);

        manager.end();
      });

      it('should cache false results', () => {
        const executor = vi.fn(() => false);

        manager.begin();

        const result1 = manager.cachedMatches('key1', executor);
        const result2 = manager.cachedMatches('key1', executor);

        expect(result1).toBe(false);
        expect(result2).toBe(false);
        expect(executor).toHaveBeenCalledTimes(1);

        manager.end();
      });

      it('should track hits and misses', () => {
        manager.begin();

        manager.cachedMatches('key1', () => true); // miss
        manager.cachedMatches('key1', () => true); // hit
        manager.cachedMatches('key2', () => false); // miss
        manager.cachedMatches('key2', () => false); // hit

        expect(manager.getStats().matchesHits).toBe(2);
        expect(manager.getStats().matchesMisses).toBe(2);

        manager.end();
      });
    });

    describe('cachedText', () => {
      it('should cache text content per element', () => {
        const element = document.createElement('div');
        const executor = vi.fn(() => 'Hello World');

        manager.begin();

        const result1 = manager.cachedText(element, executor);
        const result2 = manager.cachedText(element, executor);

        expect(result1).toBe('Hello World');
        expect(result2).toBe('Hello World');
        expect(executor).toHaveBeenCalledTimes(1);

        manager.end();
      });

      it('should cache different elements separately', () => {
        const element1 = document.createElement('div');
        const element2 = document.createElement('span');
        const executor1 = vi.fn(() => 'Text 1');
        const executor2 = vi.fn(() => 'Text 2');

        manager.begin();

        expect(manager.cachedText(element1, executor1)).toBe('Text 1');
        expect(manager.cachedText(element2, executor2)).toBe('Text 2');
        expect(manager.cachedText(element1, executor1)).toBe('Text 1');

        expect(executor1).toHaveBeenCalledTimes(1);
        expect(executor2).toHaveBeenCalledTimes(1);

        manager.end();
      });

      it('should track hits and misses', () => {
        const element = document.createElement('div');

        manager.begin();

        manager.cachedText(element, () => 'text'); // miss
        manager.cachedText(element, () => 'text'); // hit
        manager.cachedText(element, () => 'text'); // hit

        expect(manager.getStats().textHits).toBe(2);
        expect(manager.getStats().textMisses).toBe(1);

        manager.end();
      });

      it('should clear text cache between sessions', () => {
        const element = document.createElement('div');
        let callCount = 0;
        const executor = () => `text-${++callCount}`;

        manager.begin();
        const result1 = manager.cachedText(element, executor);
        manager.end();

        manager.begin();
        const result2 = manager.cachedText(element, executor);
        manager.end();

        expect(result1).toBe('text-1');
        expect(result2).toBe('text-2'); // New session, new value
      });
    });

    describe('getStats', () => {
      it('should report correct active state', () => {
        expect(manager.getStats().active).toBe(false);

        manager.begin();
        expect(manager.getStats().active).toBe(true);

        manager.end();
        expect(manager.getStats().active).toBe(false);
      });

      it('should report correct depth', () => {
        expect(manager.getStats().depth).toBe(0);

        manager.begin();
        expect(manager.getStats().depth).toBe(1);

        manager.begin();
        expect(manager.getStats().depth).toBe(2);

        manager.end();
        expect(manager.getStats().depth).toBe(1);

        manager.end();
        expect(manager.getStats().depth).toBe(0);
      });

      it('should report all entry counts', () => {
        manager.begin();

        manager.cachedQuery('q1', () => container);
        manager.cachedQuery('q2', () => null);
        manager.cachedQueryAll('qa1', () => []);
        manager.cachedMatches('m1', () => true);
        manager.cachedMatches('m2', () => false);
        manager.cachedText(container, () => 'text');

        const stats = manager.getStats();
        expect(stats.queryEntries).toBe(2);
        expect(stats.queryAllEntries).toBe(1);
        expect(stats.matchesEntries).toBe(2);
        expect(stats.textEntries).toBe(1);

        manager.end();
      });

      it('should reset statistics on new session', () => {
        manager.begin();
        manager.cachedQuery('key', () => container);
        manager.cachedQuery('key', () => container);
        expect(manager.getStats().queryHits).toBe(1);
        expect(manager.getStats().queryMisses).toBe(1);
        manager.end();

        manager.begin();
        expect(manager.getStats().queryHits).toBe(0);
        expect(manager.getStats().queryMisses).toBe(0);
        manager.end();
      });
    });

    describe('clearAll', () => {
      it('should clear all caches immediately', () => {
        manager.begin();
        manager.begin();
        manager.cachedQuery('key', () => container);

        expect(manager.getStats().depth).toBe(2);
        expect(manager.getStats().queryEntries).toBe(1);

        manager.clearAll();

        expect(manager.getStats().depth).toBe(0);
        expect(manager.getStats().queryEntries).toBe(0);
        expect(manager.isActive()).toBe(false);
      });

      it('should allow normal operation after clearing', () => {
        manager.clearAll();

        manager.begin();
        expect(manager.isActive()).toBe(true);
        expect(manager.getStats().depth).toBe(1);

        manager.end();
        expect(manager.isActive()).toBe(false);
      });
    });
  });

  describe('Global selectorCache instance', () => {
    describe('beginSelectorCaches / endSelectorCaches', () => {
      it('should control global cache', () => {
        expect(isSelectorCachingActive()).toBe(false);

        beginSelectorCaches();
        expect(isSelectorCachingActive()).toBe(true);

        endSelectorCaches();
        expect(isSelectorCachingActive()).toBe(false);
      });

      it('should support nested calls', () => {
        beginSelectorCaches();
        beginSelectorCaches();

        expect(getSelectorCacheStats().depth).toBe(2);

        endSelectorCaches();
        expect(isSelectorCachingActive()).toBe(true);

        endSelectorCaches();
        expect(isSelectorCachingActive()).toBe(false);
      });
    });

    describe('isSelectorCachingActive', () => {
      it('should return false by default', () => {
        expect(isSelectorCachingActive()).toBe(false);
      });

      it('should return true during cache session', () => {
        beginSelectorCaches();
        expect(isSelectorCachingActive()).toBe(true);
        endSelectorCaches();
      });
    });

    describe('getSelectorCacheStats', () => {
      it('should return stats from global cache', () => {
        beginSelectorCaches();

        selectorCache.cachedQuery('key', () => container);
        const stats = getSelectorCacheStats();

        expect(stats.active).toBe(true);
        expect(stats.queryMisses).toBe(1);

        endSelectorCaches();
      });
    });
  });

  describe('withSelectorCache', () => {
    it('should execute function within cache session', () => {
      const result = withSelectorCache(() => {
        expect(isSelectorCachingActive()).toBe(true);
        return 42;
      });

      expect(result).toBe(42);
      expect(isSelectorCachingActive()).toBe(false);
    });

    it('should cache during the session', () => {
      const executor = vi.fn(() => container);

      withSelectorCache(() => {
        selectorCache.cachedQuery('key', executor);
        selectorCache.cachedQuery('key', executor);
        selectorCache.cachedQuery('key', executor);
      });

      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('should clear cache after function completes', () => {
      withSelectorCache(() => {
        selectorCache.cachedQuery('key', () => container);
        expect(getSelectorCacheStats().queryEntries).toBe(1);
      });

      expect(getSelectorCacheStats().queryEntries).toBe(0);
    });

    it('should clear cache even if function throws', () => {
      expect(() => {
        withSelectorCache(() => {
          selectorCache.cachedQuery('key', () => container);
          expect(getSelectorCacheStats().queryEntries).toBe(1);
          throw new Error('Test error');
        });
      }).toThrow('Test error');

      expect(isSelectorCachingActive()).toBe(false);
      expect(getSelectorCacheStats().queryEntries).toBe(0);
    });

    it('should support nested withSelectorCache calls', () => {
      withSelectorCache(() => {
        selectorCache.cachedQuery('key', () => container);
        expect(getSelectorCacheStats().depth).toBe(1);

        withSelectorCache(() => {
          expect(getSelectorCacheStats().depth).toBe(2);
          // Should still use outer cache
          selectorCache.cachedQuery('key', () => container);
        });

        expect(getSelectorCacheStats().depth).toBe(1);
        expect(getSelectorCacheStats().queryEntries).toBe(1);
      });

      expect(getSelectorCacheStats().depth).toBe(0);
    });
  });

  describe('withSelectorCacheAsync', () => {
    it('should execute async function within cache session', async () => {
      const result = await withSelectorCacheAsync(async () => {
        expect(isSelectorCachingActive()).toBe(true);
        await Promise.resolve();
        return 'async result';
      });

      expect(result).toBe('async result');
      expect(isSelectorCachingActive()).toBe(false);
    });

    it('should cache across async operations', async () => {
      const executor = vi.fn(() => container);

      await withSelectorCacheAsync(async () => {
        selectorCache.cachedQuery('key', executor);
        await Promise.resolve();
        selectorCache.cachedQuery('key', executor);
        await new Promise((resolve) => setTimeout(resolve, 0));
        selectorCache.cachedQuery('key', executor);
      });

      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('should clear cache after async function completes', async () => {
      await withSelectorCacheAsync(async () => {
        selectorCache.cachedQuery('key', () => container);
        await Promise.resolve();
        expect(getSelectorCacheStats().queryEntries).toBe(1);
      });

      expect(getSelectorCacheStats().queryEntries).toBe(0);
    });

    it('should clear cache even if async function rejects', async () => {
      await expect(
        withSelectorCacheAsync(async () => {
          selectorCache.cachedQuery('key', () => container);
          expect(getSelectorCacheStats().queryEntries).toBe(1);
          await Promise.resolve();
          throw new Error('Async test error');
        })
      ).rejects.toThrow('Async test error');

      expect(isSelectorCachingActive()).toBe(false);
      expect(getSelectorCacheStats().queryEntries).toBe(0);
    });

    it('should support nested async cache calls', async () => {
      await withSelectorCacheAsync(async () => {
        selectorCache.cachedQuery('key', () => container);
        expect(getSelectorCacheStats().depth).toBe(1);

        await withSelectorCacheAsync(async () => {
          expect(getSelectorCacheStats().depth).toBe(2);
          await Promise.resolve();
          selectorCache.cachedQuery('key', () => container);
        });

        expect(getSelectorCacheStats().depth).toBe(1);
      });

      expect(getSelectorCacheStats().depth).toBe(0);
    });
  });

  describe('clearSelectorCaches', () => {
    it('should clear global caches', () => {
      beginSelectorCaches();
      beginSelectorCaches();
      selectorCache.cachedQuery('key', () => container);

      expect(getSelectorCacheStats().depth).toBe(2);
      expect(getSelectorCacheStats().queryEntries).toBe(1);

      clearSelectorCaches();

      expect(getSelectorCacheStats().depth).toBe(0);
      expect(getSelectorCacheStats().queryEntries).toBe(0);
      expect(isSelectorCachingActive()).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle rapid begin/end cycles', () => {
      for (let i = 0; i < 100; i++) {
        beginSelectorCaches();
        selectorCache.cachedQuery('key', () => container);
        endSelectorCaches();
      }

      expect(isSelectorCachingActive()).toBe(false);
      expect(getSelectorCacheStats().depth).toBe(0);
    });

    it('should handle mixed sync/async cache operations', async () => {
      beginSelectorCaches();

      await withSelectorCacheAsync(async () => {
        withSelectorCache(() => {
          selectorCache.cachedQuery('key', () => container);
        });
        await Promise.resolve();
      });

      // Original begin is still active
      expect(isSelectorCachingActive()).toBe(true);
      expect(getSelectorCacheStats().depth).toBe(1);

      endSelectorCaches();
      expect(isSelectorCachingActive()).toBe(false);
    });

    it('should handle elements from different documents', () => {
      // Create an iframe for a different document
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      const iframeDoc = iframe.contentDocument!;
      const iframeElement = iframeDoc.createElement('div');

      const key1 = createCacheKey('.foo', container);
      const key2 = createCacheKey('.foo', iframeElement);

      // Different documents should have different cache keys
      expect(key1).not.toBe(key2);

      iframe.remove();
    });

    it('should maintain cache consistency during DOM mutations', () => {
      beginSelectorCaches();

      // Cache the current state
      const executor1 = vi.fn(() => container.firstElementChild);
      selectorCache.cachedQuery('first-child', executor1);

      // Mutate DOM
      const child = document.createElement('div');
      container.appendChild(child);

      // Cache still returns old result (this is expected - cache is for performance
      // within a single operation, not for tracking DOM changes)
      const result = selectorCache.cachedQuery('first-child', executor1);
      expect(result).toBeNull(); // Was null before mutation, still null from cache

      expect(executor1).toHaveBeenCalledTimes(1);

      endSelectorCaches();

      // After cache cleared, new query would see updated DOM
      beginSelectorCaches();
      const executor2 = vi.fn(() => container.firstElementChild);
      const result2 = selectorCache.cachedQuery('first-child', executor2);
      expect(result2).toBe(child);
      endSelectorCaches();
    });
  });

  describe('Performance verification', () => {
    it('should reduce executor calls with caching', () => {
      const selectors = ['.a', '.b', '.c', '.d', '.e'];
      const executors = selectors.map(() => vi.fn(() => container));

      // Without caching - each call executes
      for (let round = 0; round < 5; round++) {
        for (let i = 0; i < executors.length; i++) {
          selectorCache.cachedQuery(selectors[i], executors[i]);
        }
      }
      executors.forEach((exec) => expect(exec).toHaveBeenCalledTimes(5));

      // Reset
      executors.forEach((exec) => exec.mockClear());

      // With caching - only first round executes
      beginSelectorCaches();
      for (let round = 0; round < 5; round++) {
        for (let i = 0; i < executors.length; i++) {
          selectorCache.cachedQuery(selectors[i], executors[i]);
        }
      }
      endSelectorCaches();
      executors.forEach((exec) => expect(exec).toHaveBeenCalledTimes(1));
    });

    it('should have minimal overhead for cache lookups', () => {
      const executor = vi.fn(() => container);

      beginSelectorCaches();

      // First call caches
      selectorCache.cachedQuery('key', executor);

      // Subsequent calls should be fast
      const startTime = performance.now();
      for (let i = 0; i < 10000; i++) {
        selectorCache.cachedQuery('key', executor);
      }
      const endTime = performance.now();

      // Cache lookups should be very fast (< 50ms for 10k ops on most systems)
      // This is a loose bound to avoid flaky tests
      expect(endTime - startTime).toBeLessThan(500);

      expect(executor).toHaveBeenCalledTimes(1);

      endSelectorCaches();
    });
  });

  describe('Integration scenarios', () => {
    it('should handle typical accessibility tree traversal pattern', () => {
      // Setup: Create a nested structure
      container.innerHTML = `
        <div class="container">
          <button class="btn">Button 1</button>
          <button class="btn">Button 2</button>
          <div class="nested">
            <button class="btn">Button 3</button>
          </div>
        </div>
      `;

      const queryAllExecutor = vi.fn(() =>
        Array.from(container.querySelectorAll('.btn'))
      );

      // Simulate accessibility tree construction that queries same selectors multiple times
      withSelectorCache(() => {
        // First pass - gets all buttons
        const buttons = selectorCache.cachedQueryAll('all-buttons', queryAllExecutor);
        expect(buttons.length).toBe(3);

        // Simulating repeated queries during tree traversal
        for (const button of buttons) {
          // Each button might query siblings/children
          selectorCache.cachedQueryAll('all-buttons', queryAllExecutor);
        }

        // Final pass
        selectorCache.cachedQueryAll('all-buttons', queryAllExecutor);
      });

      // Only one actual DOM query despite 5 calls
      expect(queryAllExecutor).toHaveBeenCalledTimes(1);
    });

    it('should handle form validation pattern with multiple selectors', () => {
      container.innerHTML = `
        <form>
          <input type="text" name="username" required />
          <input type="email" name="email" required />
          <input type="password" name="password" required />
          <button type="submit">Submit</button>
        </form>
      `;

      const executors = {
        inputs: vi.fn(() => Array.from(container.querySelectorAll('input'))),
        required: vi.fn(() => Array.from(container.querySelectorAll('[required]'))),
        submit: vi.fn(() => container.querySelector('[type="submit"]')),
      };

      withSelectorCache(() => {
        // Initial form analysis
        const inputs = selectorCache.cachedQueryAll('inputs', executors.inputs);
        const required = selectorCache.cachedQueryAll('required', executors.required);
        const submit = selectorCache.cachedQuery('submit', executors.submit);

        // Validation pass 1
        for (const input of inputs) {
          selectorCache.cachedQueryAll('required', executors.required);
        }

        // Validation pass 2 (re-check)
        selectorCache.cachedQueryAll('inputs', executors.inputs);
        selectorCache.cachedQueryAll('required', executors.required);
        selectorCache.cachedQuery('submit', executors.submit);
      });

      // Each executor called only once
      expect(executors.inputs).toHaveBeenCalledTimes(1);
      expect(executors.required).toHaveBeenCalledTimes(1);
      expect(executors.submit).toHaveBeenCalledTimes(1);
    });
  });
});
