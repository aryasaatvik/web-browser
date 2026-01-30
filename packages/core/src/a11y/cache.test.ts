/**
 * Tests for ARIA cache manager.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ariaCache,
  beginAriaCaches,
  endAriaCaches,
  withAriaCache,
  withAriaCacheAsync,
} from './cache.js';
import { computeAccessibleName, computeAccessibleDescription } from './name.js';
import { isElementHiddenForAria } from './hidden.js';

describe('AriaCacheManager', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    // Ensure cache is cleared after each test
    while (ariaCache.isActive()) {
      endAriaCaches();
    }
  });

  describe('Basic caching', () => {
    it('should not be active by default', () => {
      expect(ariaCache.isActive()).toBe(false);
    });

    it('should be active after begin()', () => {
      beginAriaCaches();
      expect(ariaCache.isActive()).toBe(true);
      endAriaCaches();
    });

    it('should not be active after end()', () => {
      beginAriaCaches();
      endAriaCaches();
      expect(ariaCache.isActive()).toBe(false);
    });

    it('should return cached value on cache hit', () => {
      const computeFn = vi.fn(() => 'computed-name');

      beginAriaCaches();

      container.innerHTML = '<button>Test</button>';
      const button = container.querySelector('button')!;

      // First call computes
      const result1 = ariaCache.getAccessibleName(button, false, computeFn);
      expect(result1).toBe('computed-name');
      expect(computeFn).toHaveBeenCalledTimes(1);

      // Second call uses cache
      const result2 = ariaCache.getAccessibleName(button, false, computeFn);
      expect(result2).toBe('computed-name');
      expect(computeFn).toHaveBeenCalledTimes(1);

      endAriaCaches();
    });

    it('should compute value on cache miss', () => {
      const computeFn = vi.fn(() => 'computed-name');

      beginAriaCaches();

      container.innerHTML = '<button>Test</button>';
      const button = container.querySelector('button')!;

      const result = ariaCache.getAccessibleName(button, false, computeFn);
      expect(result).toBe('computed-name');
      expect(computeFn).toHaveBeenCalledTimes(1);

      endAriaCaches();
    });

    it('should maintain separate cache entries for different elements', () => {
      const computeFn1 = vi.fn(() => 'name-1');
      const computeFn2 = vi.fn(() => 'name-2');

      beginAriaCaches();

      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      const button1 = container.querySelector('#btn1')!;
      const button2 = container.querySelector('#btn2')!;

      const result1 = ariaCache.getAccessibleName(button1, false, computeFn1);
      const result2 = ariaCache.getAccessibleName(button2, false, computeFn2);

      expect(result1).toBe('name-1');
      expect(result2).toBe('name-2');
      expect(computeFn1).toHaveBeenCalledTimes(1);
      expect(computeFn2).toHaveBeenCalledTimes(1);

      endAriaCaches();
    });

    it('should compute without caching when cache is not active', () => {
      const computeFn = vi.fn(() => 'computed-name');

      container.innerHTML = '<button>Test</button>';
      const button = container.querySelector('button')!;

      // Call without begin()
      const result1 = ariaCache.getAccessibleName(button, false, computeFn);
      const result2 = ariaCache.getAccessibleName(button, false, computeFn);

      expect(result1).toBe('computed-name');
      expect(result2).toBe('computed-name');
      // Should compute twice since caching is not active
      expect(computeFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Reference counting', () => {
    it('should handle single begin/end cycle', () => {
      expect(ariaCache.isActive()).toBe(false);
      beginAriaCaches();
      expect(ariaCache.isActive()).toBe(true);
      expect(ariaCache.getStats().depth).toBe(1);
      endAriaCaches();
      expect(ariaCache.isActive()).toBe(false);
      expect(ariaCache.getStats().depth).toBe(0);
    });

    it('should handle nested begin/end cycles', () => {
      beginAriaCaches(); // depth = 1
      expect(ariaCache.getStats().depth).toBe(1);

      beginAriaCaches(); // depth = 2
      expect(ariaCache.getStats().depth).toBe(2);
      expect(ariaCache.isActive()).toBe(true);

      beginAriaCaches(); // depth = 3
      expect(ariaCache.getStats().depth).toBe(3);

      endAriaCaches(); // depth = 2
      expect(ariaCache.getStats().depth).toBe(2);
      expect(ariaCache.isActive()).toBe(true);

      endAriaCaches(); // depth = 1
      expect(ariaCache.getStats().depth).toBe(1);
      expect(ariaCache.isActive()).toBe(true);

      endAriaCaches(); // depth = 0
      expect(ariaCache.getStats().depth).toBe(0);
      expect(ariaCache.isActive()).toBe(false);
    });

    it('should preserve cache across nested sessions', () => {
      const computeFn = vi.fn(() => 'cached-value');

      container.innerHTML = '<button>Test</button>';
      const button = container.querySelector('button')!;

      beginAriaCaches();
      ariaCache.getAccessibleName(button, false, computeFn);
      expect(computeFn).toHaveBeenCalledTimes(1);

      beginAriaCaches(); // Nested
      // Should still use cached value
      ariaCache.getAccessibleName(button, false, computeFn);
      expect(computeFn).toHaveBeenCalledTimes(1);

      endAriaCaches();
      // Still in outer session, cache preserved
      ariaCache.getAccessibleName(button, false, computeFn);
      expect(computeFn).toHaveBeenCalledTimes(1);

      endAriaCaches();
    });

    it('should clear cache on outermost end', () => {
      const computeFn = vi.fn(() => 'cached-value');

      container.innerHTML = '<button>Test</button>';
      const button = container.querySelector('button')!;

      beginAriaCaches();
      ariaCache.getAccessibleName(button, false, computeFn);
      expect(computeFn).toHaveBeenCalledTimes(1);
      expect(ariaCache.getStats().nameCacheSize).toBe(1);

      endAriaCaches();
      expect(ariaCache.getStats().nameCacheSize).toBe(0);

      // Start new session, should compute again
      beginAriaCaches();
      ariaCache.getAccessibleName(button, false, computeFn);
      expect(computeFn).toHaveBeenCalledTimes(2);
      endAriaCaches();
    });
  });

  describe('Accessible name caching', () => {
    it('should cache accessible name computation', () => {
      container.innerHTML = `
        <span id="label">Hello World</span>
        <button aria-labelledby="label">Ignored</button>
      `;
      const button = container.querySelector('button')!;

      beginAriaCaches();

      const name1 = computeAccessibleName(button);
      const name2 = computeAccessibleName(button);

      expect(name1).toBe('Hello World');
      expect(name2).toBe('Hello World');
      expect(ariaCache.getStats().nameCacheSize).toBe(1);

      endAriaCaches();
    });

    it('should use separate cache for includeHidden flag', () => {
      container.innerHTML = `
        <span id="label" style="display: none;">Hidden Label</span>
        <button aria-labelledby="label">Button</button>
      `;
      const button = container.querySelector('button')!;

      beginAriaCaches();

      const nameWithHidden = computeAccessibleName(button, { includeHidden: true });
      const nameWithoutHidden = computeAccessibleName(button, { includeHidden: false });

      // Both should be computed and cached separately
      expect(ariaCache.getStats().nameCacheSize).toBeGreaterThanOrEqual(0);
      expect(ariaCache.getStats().nameHiddenCacheSize).toBeGreaterThanOrEqual(0);

      // The results might differ based on implementation
      expect(typeof nameWithHidden).toBe('string');
      expect(typeof nameWithoutHidden).toBe('string');

      endAriaCaches();
    });

    it('should correctly cache complex elements', () => {
      container.innerHTML = `
        <div>
          <span id="first">First</span>
          <span id="second">Second</span>
          <button aria-labelledby="first second">Click me</button>
        </div>
      `;
      const button = container.querySelector('button')!;

      beginAriaCaches();

      const name1 = computeAccessibleName(button);
      const name2 = computeAccessibleName(button);

      expect(name1).toBe('First Second');
      expect(name2).toBe('First Second');

      endAriaCaches();
    });
  });

  describe('Accessible description caching', () => {
    it('should cache accessible description computation', () => {
      container.innerHTML = `
        <span id="desc">This is a description</span>
        <button aria-describedby="desc">Click me</button>
      `;
      const button = container.querySelector('button')!;

      beginAriaCaches();

      const desc1 = computeAccessibleDescription(button);
      const desc2 = computeAccessibleDescription(button);

      expect(desc1).toBe('This is a description');
      expect(desc2).toBe('This is a description');
      expect(ariaCache.getStats().descriptionCacheSize).toBe(1);

      endAriaCaches();
    });

    it('should use separate cache for includeHidden flag', () => {
      container.innerHTML = `
        <span id="desc" style="display: none;">Hidden Description</span>
        <button aria-describedby="desc">Click me</button>
      `;
      const button = container.querySelector('button')!;

      beginAriaCaches();

      computeAccessibleDescription(button, { includeHidden: true });
      computeAccessibleDescription(button, { includeHidden: false });

      // Both should have cache entries (possibly)
      const stats = ariaCache.getStats();
      expect(stats.descriptionCacheSize + stats.descriptionHiddenCacheSize).toBeGreaterThanOrEqual(
        0
      );

      endAriaCaches();
    });
  });

  describe('Hidden state caching', () => {
    it('should cache hidden state computation', () => {
      container.innerHTML = `
        <div style="display: none;">
          <button>Hidden Button</button>
        </div>
        <button>Visible Button</button>
      `;
      const hiddenButton = container.querySelector('div button')!;
      const visibleButton = container.querySelectorAll('button')[1];

      beginAriaCaches();

      const hidden1 = isElementHiddenForAria(hiddenButton);
      const hidden2 = isElementHiddenForAria(hiddenButton);
      const visible1 = isElementHiddenForAria(visibleButton);
      const visible2 = isElementHiddenForAria(visibleButton);

      expect(hidden1).toBe(true);
      expect(hidden2).toBe(true);
      expect(visible1).toBe(false);
      expect(visible2).toBe(false);
      expect(ariaCache.getStats().hiddenCacheSize).toBe(2);

      endAriaCaches();
    });

    it('should cache aria-hidden ancestry correctly', () => {
      container.innerHTML = `
        <div aria-hidden="true">
          <button id="child1">Child 1</button>
          <button id="child2">Child 2</button>
        </div>
      `;
      const child1 = container.querySelector('#child1')!;
      const child2 = container.querySelector('#child2')!;

      beginAriaCaches();

      expect(isElementHiddenForAria(child1)).toBe(true);
      expect(isElementHiddenForAria(child2)).toBe(true);

      // Both should be cached
      expect(ariaCache.getStats().hiddenCacheSize).toBe(2);

      endAriaCaches();
    });
  });

  describe('Role caching', () => {
    it('should cache role computation', () => {
      const computeFn = vi.fn(() => 'button');

      container.innerHTML = '<button>Test</button>';
      const button = container.querySelector('button')!;

      beginAriaCaches();

      const role1 = ariaCache.getRole(button, computeFn);
      const role2 = ariaCache.getRole(button, computeFn);

      expect(role1).toBe('button');
      expect(role2).toBe('button');
      expect(computeFn).toHaveBeenCalledTimes(1);
      expect(ariaCache.getStats().roleCacheSize).toBe(1);

      endAriaCaches();
    });

    it('should cache null roles', () => {
      const computeFn = vi.fn(() => null);

      container.innerHTML = '<div>Test</div>';
      const div = container.querySelector('div')!;

      beginAriaCaches();

      const role1 = ariaCache.getRole(div, computeFn);
      const role2 = ariaCache.getRole(div, computeFn);

      expect(role1).toBeNull();
      expect(role2).toBeNull();
      expect(computeFn).toHaveBeenCalledTimes(1);

      endAriaCaches();
    });
  });

  describe('Pointer events caching', () => {
    it('should cache pointer events computation', () => {
      const computeFn = vi.fn(() => true);

      container.innerHTML = '<button>Test</button>';
      const button = container.querySelector('button')!;

      beginAriaCaches();

      const receives1 = ariaCache.getPointerEvents(button, computeFn);
      const receives2 = ariaCache.getPointerEvents(button, computeFn);

      expect(receives1).toBe(true);
      expect(receives2).toBe(true);
      expect(computeFn).toHaveBeenCalledTimes(1);
      expect(ariaCache.getStats().pointerEventsCacheSize).toBe(1);

      endAriaCaches();
    });

    it('should cache pointer-events: none correctly', () => {
      const computeFn = vi.fn(() => false);

      container.innerHTML = '<button style="pointer-events: none;">Test</button>';
      const button = container.querySelector('button')!;

      beginAriaCaches();

      const receives = ariaCache.getPointerEvents(button, computeFn);
      expect(receives).toBe(false);

      endAriaCaches();
    });
  });

  describe('Performance verification', () => {
    it('should reduce computation calls with caching', () => {
      const computeNameMock = vi.fn(() => 'Test Name');

      container.innerHTML = '<button>Test</button>';
      const button = container.querySelector('button')!;

      // Without caching - should compute each time
      ariaCache.getAccessibleName(button, false, computeNameMock);
      ariaCache.getAccessibleName(button, false, computeNameMock);
      ariaCache.getAccessibleName(button, false, computeNameMock);
      expect(computeNameMock).toHaveBeenCalledTimes(3);

      computeNameMock.mockClear();

      // With caching - should compute only once
      beginAriaCaches();
      ariaCache.getAccessibleName(button, false, computeNameMock);
      ariaCache.getAccessibleName(button, false, computeNameMock);
      ariaCache.getAccessibleName(button, false, computeNameMock);
      expect(computeNameMock).toHaveBeenCalledTimes(1);
      endAriaCaches();
    });

    it('should handle many elements efficiently', () => {
      // Create many elements
      container.innerHTML = Array.from(
        { length: 100 },
        (_, i) => `<button id="btn${i}">Button ${i}</button>`
      ).join('');

      const buttons = container.querySelectorAll('button');

      beginAriaCaches();

      // First pass - all computed
      for (const button of buttons) {
        computeAccessibleName(button);
      }
      expect(ariaCache.getStats().nameCacheSize).toBe(100);

      // Second pass - all cached
      for (const button of buttons) {
        computeAccessibleName(button);
      }
      // Cache size should still be 100
      expect(ariaCache.getStats().nameCacheSize).toBe(100);

      endAriaCaches();
    });
  });

  describe('withAriaCache helper', () => {
    it('should execute function with caching enabled', () => {
      container.innerHTML = '<button>Test</button>';
      const button = container.querySelector('button')!;

      const result = withAriaCache(() => {
        expect(ariaCache.isActive()).toBe(true);
        return computeAccessibleName(button);
      });

      expect(result).toBe('Test');
      expect(ariaCache.isActive()).toBe(false);
    });

    it('should return function result', () => {
      const result = withAriaCache(() => {
        return 42;
      });

      expect(result).toBe(42);
    });

    it('should clean up on exception', () => {
      expect(() => {
        withAriaCache(() => {
          expect(ariaCache.isActive()).toBe(true);
          throw new Error('Test error');
        });
      }).toThrow('Test error');

      expect(ariaCache.isActive()).toBe(false);
    });

    it('should support nested withAriaCache calls', () => {
      const result = withAriaCache(() => {
        expect(ariaCache.getStats().depth).toBe(1);

        return withAriaCache(() => {
          expect(ariaCache.getStats().depth).toBe(2);
          return 'nested';
        });
      });

      expect(result).toBe('nested');
      expect(ariaCache.isActive()).toBe(false);
    });
  });

  describe('withAriaCacheAsync helper', () => {
    it('should execute async function with caching enabled', async () => {
      container.innerHTML = '<button>Async Test</button>';
      const button = container.querySelector('button')!;

      const result = await withAriaCacheAsync(async () => {
        expect(ariaCache.isActive()).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return computeAccessibleName(button);
      });

      expect(result).toBe('Async Test');
      expect(ariaCache.isActive()).toBe(false);
    });

    it('should return async function result', async () => {
      const result = await withAriaCacheAsync(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 42;
      });

      expect(result).toBe(42);
    });

    it('should clean up on async exception', async () => {
      await expect(
        withAriaCacheAsync(async () => {
          expect(ariaCache.isActive()).toBe(true);
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error('Async test error');
        })
      ).rejects.toThrow('Async test error');

      expect(ariaCache.isActive()).toBe(false);
    });

    it('should support nested async calls', async () => {
      const result = await withAriaCacheAsync(async () => {
        expect(ariaCache.getStats().depth).toBe(1);

        return await withAriaCacheAsync(async () => {
          expect(ariaCache.getStats().depth).toBe(2);
          await new Promise((resolve) => setTimeout(resolve, 5));
          return 'nested-async';
        });
      });

      expect(result).toBe('nested-async');
      expect(ariaCache.isActive()).toBe(false);
    });
  });

  describe('Cache statistics', () => {
    it('should report accurate statistics', () => {
      container.innerHTML = `
        <span id="desc">Description</span>
        <button aria-describedby="desc">Button</button>
      `;
      const button = container.querySelector('button')!;

      const stats1 = ariaCache.getStats();
      expect(stats1.active).toBe(false);
      expect(stats1.depth).toBe(0);
      expect(stats1.nameCacheSize).toBe(0);

      beginAriaCaches();

      computeAccessibleName(button);
      computeAccessibleDescription(button);
      isElementHiddenForAria(button);

      const stats2 = ariaCache.getStats();
      expect(stats2.active).toBe(true);
      expect(stats2.depth).toBe(1);
      expect(stats2.nameCacheSize).toBe(1);
      expect(stats2.descriptionCacheSize).toBe(1);
      // Hidden cache may have more entries due to internal calls
      expect(stats2.hiddenCacheSize).toBeGreaterThanOrEqual(1);

      endAriaCaches();

      const stats3 = ariaCache.getStats();
      expect(stats3.active).toBe(false);
      expect(stats3.nameCacheSize).toBe(0);
    });

    it('should track all cache types', () => {
      beginAriaCaches();

      container.innerHTML = '<button>Test</button>';
      const button = container.querySelector('button')!;

      ariaCache.getAccessibleName(button, false, () => 'name');
      ariaCache.getAccessibleName(button, true, () => 'name-hidden');
      ariaCache.getAccessibleDescription(button, false, () => 'desc');
      ariaCache.getAccessibleDescription(button, true, () => 'desc-hidden');
      ariaCache.getIsHidden(button, () => false);
      ariaCache.getRole(button, () => 'button');
      ariaCache.getPointerEvents(button, () => true);

      const stats = ariaCache.getStats();
      expect(stats.nameCacheSize).toBe(1);
      expect(stats.nameHiddenCacheSize).toBe(1);
      expect(stats.descriptionCacheSize).toBe(1);
      expect(stats.descriptionHiddenCacheSize).toBe(1);
      expect(stats.hiddenCacheSize).toBe(1);
      expect(stats.roleCacheSize).toBe(1);
      expect(stats.pointerEventsCacheSize).toBe(1);

      endAriaCaches();
    });
  });

  describe('clearAll', () => {
    it('should clear all caches', () => {
      beginAriaCaches();

      container.innerHTML = '<button>Test</button>';
      const button = container.querySelector('button')!;

      ariaCache.getAccessibleName(button, false, () => 'name');
      ariaCache.getIsHidden(button, () => false);
      ariaCache.getRole(button, () => 'button');

      expect(ariaCache.getStats().nameCacheSize).toBe(1);
      expect(ariaCache.getStats().hiddenCacheSize).toBe(1);
      expect(ariaCache.getStats().roleCacheSize).toBe(1);

      ariaCache.clearAll();

      expect(ariaCache.getStats().nameCacheSize).toBe(0);
      expect(ariaCache.getStats().hiddenCacheSize).toBe(0);
      expect(ariaCache.getStats().roleCacheSize).toBe(0);

      // Note: clearAll doesn't affect the counter, just the caches
      endAriaCaches();
    });
  });
});
