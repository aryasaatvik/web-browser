/**
 * Tests for DOM caching utilities.
 *
 * Note: happy-dom doesn't fully support getComputedStyle,
 * so we mock it for most tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  beginDOMCaches,
  endDOMCaches,
  getCachedStyle,
  getCachedPseudoContent,
  isCachingActive,
  getCacheStats,
  withCache,
  withCacheAsync,
  clearAllCaches,
} from './cache.js';

describe('DOM Cache', () => {
  let container: HTMLDivElement;
  let getComputedStyleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    // Spy on getComputedStyle to track calls
    getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle');
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
    // Always clean up cache state
    clearAllCaches();
  });

  // Helper to create a mock CSSStyleDeclaration
  function createMockStyle(overrides: Partial<CSSStyleDeclaration> = {}): CSSStyleDeclaration {
    return {
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      content: 'none',
      getPropertyValue: vi.fn((prop: string) => (overrides as Record<string, string>)[prop] || ''),
      ...overrides,
    } as unknown as CSSStyleDeclaration;
  }

  describe('beginDOMCaches / endDOMCaches', () => {
    it('should activate caching on begin', () => {
      expect(isCachingActive()).toBe(false);

      beginDOMCaches();
      expect(isCachingActive()).toBe(true);

      endDOMCaches();
      expect(isCachingActive()).toBe(false);
    });

    it('should support nested begin/end calls', () => {
      expect(getCacheStats().depth).toBe(0);

      beginDOMCaches();
      expect(getCacheStats().depth).toBe(1);

      beginDOMCaches();
      expect(getCacheStats().depth).toBe(2);

      beginDOMCaches();
      expect(getCacheStats().depth).toBe(3);

      endDOMCaches();
      expect(getCacheStats().depth).toBe(2);
      expect(isCachingActive()).toBe(true);

      endDOMCaches();
      expect(getCacheStats().depth).toBe(1);
      expect(isCachingActive()).toBe(true);

      endDOMCaches();
      expect(getCacheStats().depth).toBe(0);
      expect(isCachingActive()).toBe(false);
    });

    it('should clear cache when counter reaches 0', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const mockStyle = createMockStyle({ display: 'flex' });
      getComputedStyleSpy.mockReturnValue(mockStyle);

      beginDOMCaches();
      getCachedStyle(element);
      expect(getCacheStats().styleEntries).toBe(1);

      endDOMCaches();
      expect(getCacheStats().styleEntries).toBe(0);
    });

    it('should preserve cache during nested calls', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const mockStyle = createMockStyle({ display: 'flex' });
      getComputedStyleSpy.mockReturnValue(mockStyle);

      beginDOMCaches();
      getCachedStyle(element);
      expect(getCacheStats().styleEntries).toBe(1);

      beginDOMCaches();
      expect(getCacheStats().styleEntries).toBe(1); // Still cached

      endDOMCaches();
      expect(getCacheStats().styleEntries).toBe(1); // Still cached (depth is 1)

      endDOMCaches();
      expect(getCacheStats().styleEntries).toBe(0); // Now cleared
    });

    it('should protect against negative counter', () => {
      expect(getCacheStats().depth).toBe(0);

      // Call end without begin
      endDOMCaches();
      expect(getCacheStats().depth).toBe(0);

      endDOMCaches();
      expect(getCacheStats().depth).toBe(0);

      // Should still work normally after
      beginDOMCaches();
      expect(getCacheStats().depth).toBe(1);

      endDOMCaches();
      expect(getCacheStats().depth).toBe(0);
    });
  });

  describe('getCachedStyle', () => {
    it('should return computed style when cache is inactive', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const mockStyle = createMockStyle({ display: 'inline' });
      getComputedStyleSpy.mockReturnValue(mockStyle);

      const style = getCachedStyle(element);
      expect(style.display).toBe('inline');
      expect(getComputedStyleSpy).toHaveBeenCalledTimes(1);
    });

    it('should cache style and return same result on subsequent calls', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const mockStyle = createMockStyle({ display: 'grid' });
      getComputedStyleSpy.mockReturnValue(mockStyle);

      beginDOMCaches();

      const style1 = getCachedStyle(element);
      const style2 = getCachedStyle(element);
      const style3 = getCachedStyle(element);

      expect(style1).toBe(style2);
      expect(style2).toBe(style3);
      expect(style1.display).toBe('grid');
      // Only one call to getComputedStyle
      expect(getComputedStyleSpy).toHaveBeenCalledTimes(1);

      endDOMCaches();
    });

    it('should cache different elements separately', () => {
      const element1 = document.createElement('div');
      const element2 = document.createElement('span');
      container.appendChild(element1);
      container.appendChild(element2);

      const mockStyle1 = createMockStyle({ display: 'block' });
      const mockStyle2 = createMockStyle({ display: 'inline' });

      getComputedStyleSpy
        .mockReturnValueOnce(mockStyle1)
        .mockReturnValueOnce(mockStyle2);

      beginDOMCaches();

      const style1 = getCachedStyle(element1);
      const style2 = getCachedStyle(element2);

      expect(style1.display).toBe('block');
      expect(style2.display).toBe('inline');
      expect(getComputedStyleSpy).toHaveBeenCalledTimes(2);

      // Subsequent calls should use cache
      getCachedStyle(element1);
      getCachedStyle(element2);
      expect(getComputedStyleSpy).toHaveBeenCalledTimes(2);

      expect(getCacheStats().styleEntries).toBe(2);

      endDOMCaches();
    });

    it('should cache pseudo element styles separately', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const regularStyle = createMockStyle({ display: 'block' });
      const beforeStyle = createMockStyle({ content: '"before"' });
      const afterStyle = createMockStyle({ content: '"after"' });

      getComputedStyleSpy
        .mockReturnValueOnce(regularStyle)
        .mockReturnValueOnce(beforeStyle)
        .mockReturnValueOnce(afterStyle);

      beginDOMCaches();

      const style = getCachedStyle(element);
      const styleBefore = getCachedStyle(element, '::before');
      const styleAfter = getCachedStyle(element, '::after');

      expect(style.display).toBe('block');
      expect(styleBefore.content).toBe('"before"');
      expect(styleAfter.content).toBe('"after"');

      // Each pseudo selector is cached separately
      expect(getComputedStyleSpy).toHaveBeenCalledTimes(3);
      expect(getCacheStats().styleEntries).toBe(3);

      // Subsequent calls use cache
      getCachedStyle(element);
      getCachedStyle(element, '::before');
      getCachedStyle(element, '::after');
      expect(getComputedStyleSpy).toHaveBeenCalledTimes(3);

      endDOMCaches();
    });

    it('should handle null pseudo parameter same as undefined', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const mockStyle = createMockStyle({ display: 'flex' });
      getComputedStyleSpy.mockReturnValue(mockStyle);

      beginDOMCaches();

      const style1 = getCachedStyle(element);
      const style2 = getCachedStyle(element, null);
      const style3 = getCachedStyle(element, undefined);

      expect(style1).toBe(style2);
      expect(style2).toBe(style3);
      expect(getComputedStyleSpy).toHaveBeenCalledTimes(1);

      endDOMCaches();
    });

    it('should call getComputedStyle each time when cache is inactive', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const mockStyle = createMockStyle();
      getComputedStyleSpy.mockReturnValue(mockStyle);

      getCachedStyle(element);
      getCachedStyle(element);
      getCachedStyle(element);

      // Each call goes directly to getComputedStyle
      expect(getComputedStyleSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('getCachedPseudoContent', () => {
    it('should return pseudo content when cache is inactive', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const mockStyle = createMockStyle({ content: '"Hello"' });
      getComputedStyleSpy.mockReturnValue(mockStyle);

      const content = getCachedPseudoContent(element, '::before');
      expect(content).toBe('"Hello"');
    });

    it('should cache pseudo content', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const beforeStyle = createMockStyle({ content: '"Before Text"' });
      const afterStyle = createMockStyle({ content: '"After Text"' });

      getComputedStyleSpy
        .mockReturnValueOnce(beforeStyle)
        .mockReturnValueOnce(afterStyle);

      beginDOMCaches();

      const before1 = getCachedPseudoContent(element, '::before');
      const after1 = getCachedPseudoContent(element, '::after');
      const before2 = getCachedPseudoContent(element, '::before');
      const after2 = getCachedPseudoContent(element, '::after');

      expect(before1).toBe('"Before Text"');
      expect(after1).toBe('"After Text"');
      expect(before2).toBe(before1);
      expect(after2).toBe(after1);

      // Only 2 calls for ::before and ::after
      expect(getComputedStyleSpy).toHaveBeenCalledTimes(2);
      expect(getCacheStats().pseudoEntries).toBe(2);

      endDOMCaches();
    });

    it('should return "none" for empty content', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const mockStyle = createMockStyle({ content: '' });
      getComputedStyleSpy.mockReturnValue(mockStyle);

      beginDOMCaches();

      const content = getCachedPseudoContent(element, '::before');
      expect(content).toBe('none');

      endDOMCaches();
    });

    it('should cache different elements separately', () => {
      const element1 = document.createElement('div');
      const element2 = document.createElement('div');
      container.appendChild(element1);
      container.appendChild(element2);

      const style1 = createMockStyle({ content: '"A"' });
      const style2 = createMockStyle({ content: '"B"' });

      getComputedStyleSpy
        .mockReturnValueOnce(style1)
        .mockReturnValueOnce(style2);

      beginDOMCaches();

      const content1 = getCachedPseudoContent(element1, '::before');
      const content2 = getCachedPseudoContent(element2, '::before');

      expect(content1).toBe('"A"');
      expect(content2).toBe('"B"');

      endDOMCaches();
    });
  });

  describe('isCachingActive', () => {
    it('should return false by default', () => {
      expect(isCachingActive()).toBe(false);
    });

    it('should return true after beginDOMCaches', () => {
      beginDOMCaches();
      expect(isCachingActive()).toBe(true);
      endDOMCaches();
    });

    it('should return false after matching endDOMCaches', () => {
      beginDOMCaches();
      endDOMCaches();
      expect(isCachingActive()).toBe(false);
    });

    it('should return true during nested calls', () => {
      beginDOMCaches();
      beginDOMCaches();
      endDOMCaches();
      expect(isCachingActive()).toBe(true);
      endDOMCaches();
      expect(isCachingActive()).toBe(false);
    });
  });

  describe('getCacheStats', () => {
    it('should report correct active state', () => {
      expect(getCacheStats().active).toBe(false);

      beginDOMCaches();
      expect(getCacheStats().active).toBe(true);

      endDOMCaches();
      expect(getCacheStats().active).toBe(false);
    });

    it('should report correct depth', () => {
      expect(getCacheStats().depth).toBe(0);

      beginDOMCaches();
      expect(getCacheStats().depth).toBe(1);

      beginDOMCaches();
      expect(getCacheStats().depth).toBe(2);

      endDOMCaches();
      expect(getCacheStats().depth).toBe(1);

      endDOMCaches();
      expect(getCacheStats().depth).toBe(0);
    });

    it('should report correct style entry count', () => {
      const element1 = document.createElement('div');
      const element2 = document.createElement('span');
      container.appendChild(element1);
      container.appendChild(element2);

      getComputedStyleSpy.mockReturnValue(createMockStyle());

      beginDOMCaches();

      expect(getCacheStats().styleEntries).toBe(0);

      getCachedStyle(element1);
      expect(getCacheStats().styleEntries).toBe(1);

      getCachedStyle(element2);
      expect(getCacheStats().styleEntries).toBe(2);

      getCachedStyle(element1, '::before');
      expect(getCacheStats().styleEntries).toBe(3);

      getCachedStyle(element1, '::after');
      expect(getCacheStats().styleEntries).toBe(4);

      endDOMCaches();

      expect(getCacheStats().styleEntries).toBe(0);
    });

    it('should report correct pseudo entry count', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      getComputedStyleSpy.mockReturnValue(createMockStyle({ content: '"test"' }));

      beginDOMCaches();

      expect(getCacheStats().pseudoEntries).toBe(0);

      getCachedPseudoContent(element, '::before');
      expect(getCacheStats().pseudoEntries).toBe(1);

      getCachedPseudoContent(element, '::after');
      expect(getCacheStats().pseudoEntries).toBe(2);

      endDOMCaches();

      expect(getCacheStats().pseudoEntries).toBe(0);
    });
  });

  describe('withCache', () => {
    it('should execute function within cache session', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const mockStyle = createMockStyle({ display: 'flex' });
      getComputedStyleSpy.mockReturnValue(mockStyle);

      const result = withCache(() => {
        expect(isCachingActive()).toBe(true);
        const style = getCachedStyle(element);
        return style.display;
      });

      expect(result).toBe('flex');
      expect(isCachingActive()).toBe(false);
    });

    it('should cache styles within the session', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      getComputedStyleSpy.mockReturnValue(createMockStyle());

      withCache(() => {
        getCachedStyle(element);
        getCachedStyle(element);
        getCachedStyle(element);
      });

      expect(getComputedStyleSpy).toHaveBeenCalledTimes(1);
    });

    it('should clear cache after function completes', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      getComputedStyleSpy.mockReturnValue(createMockStyle());

      withCache(() => {
        getCachedStyle(element);
        expect(getCacheStats().styleEntries).toBe(1);
      });

      expect(getCacheStats().styleEntries).toBe(0);
    });

    it('should clear cache even if function throws', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      getComputedStyleSpy.mockReturnValue(createMockStyle());

      expect(() => {
        withCache(() => {
          getCachedStyle(element);
          expect(getCacheStats().styleEntries).toBe(1);
          throw new Error('Test error');
        });
      }).toThrow('Test error');

      expect(isCachingActive()).toBe(false);
      expect(getCacheStats().styleEntries).toBe(0);
    });

    it('should support nested withCache calls', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      getComputedStyleSpy.mockReturnValue(createMockStyle());

      withCache(() => {
        getCachedStyle(element);
        expect(getCacheStats().depth).toBe(1);

        withCache(() => {
          expect(getCacheStats().depth).toBe(2);
          // Should still use outer cache
          getCachedStyle(element);
          expect(getComputedStyleSpy).toHaveBeenCalledTimes(1);
        });

        expect(getCacheStats().depth).toBe(1);
        expect(getCacheStats().styleEntries).toBe(1);
      });

      expect(getCacheStats().depth).toBe(0);
    });
  });

  describe('withCacheAsync', () => {
    it('should execute async function within cache session', async () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const mockStyle = createMockStyle({ display: 'grid' });
      getComputedStyleSpy.mockReturnValue(mockStyle);

      const result = await withCacheAsync(async () => {
        expect(isCachingActive()).toBe(true);
        await Promise.resolve(); // Simulate async operation
        const style = getCachedStyle(element);
        return style.display;
      });

      expect(result).toBe('grid');
      expect(isCachingActive()).toBe(false);
    });

    it('should cache styles across async operations', async () => {
      const element = document.createElement('div');
      container.appendChild(element);

      getComputedStyleSpy.mockReturnValue(createMockStyle());

      await withCacheAsync(async () => {
        getCachedStyle(element);
        await Promise.resolve();
        getCachedStyle(element);
        await new Promise((resolve) => setTimeout(resolve, 0));
        getCachedStyle(element);
      });

      expect(getComputedStyleSpy).toHaveBeenCalledTimes(1);
    });

    it('should clear cache after async function completes', async () => {
      const element = document.createElement('div');
      container.appendChild(element);

      getComputedStyleSpy.mockReturnValue(createMockStyle());

      await withCacheAsync(async () => {
        getCachedStyle(element);
        await Promise.resolve();
        expect(getCacheStats().styleEntries).toBe(1);
      });

      expect(getCacheStats().styleEntries).toBe(0);
    });

    it('should clear cache even if async function rejects', async () => {
      const element = document.createElement('div');
      container.appendChild(element);

      getComputedStyleSpy.mockReturnValue(createMockStyle());

      await expect(
        withCacheAsync(async () => {
          getCachedStyle(element);
          expect(getCacheStats().styleEntries).toBe(1);
          await Promise.resolve();
          throw new Error('Async test error');
        })
      ).rejects.toThrow('Async test error');

      expect(isCachingActive()).toBe(false);
      expect(getCacheStats().styleEntries).toBe(0);
    });

    it('should support nested async cache calls', async () => {
      const element = document.createElement('div');
      container.appendChild(element);

      getComputedStyleSpy.mockReturnValue(createMockStyle());

      await withCacheAsync(async () => {
        getCachedStyle(element);
        expect(getCacheStats().depth).toBe(1);

        await withCacheAsync(async () => {
          expect(getCacheStats().depth).toBe(2);
          await Promise.resolve();
          getCachedStyle(element);
          expect(getComputedStyleSpy).toHaveBeenCalledTimes(1);
        });

        expect(getCacheStats().depth).toBe(1);
      });

      expect(getCacheStats().depth).toBe(0);
    });
  });

  describe('clearAllCaches', () => {
    it('should clear all caches immediately', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      getComputedStyleSpy.mockReturnValue(createMockStyle());

      beginDOMCaches();
      beginDOMCaches();
      getCachedStyle(element);

      expect(getCacheStats().depth).toBe(2);
      expect(getCacheStats().styleEntries).toBe(1);

      clearAllCaches();

      expect(getCacheStats().depth).toBe(0);
      expect(getCacheStats().styleEntries).toBe(0);
      expect(isCachingActive()).toBe(false);
    });

    it('should allow normal operation after clearing', () => {
      clearAllCaches();

      beginDOMCaches();
      expect(isCachingActive()).toBe(true);
      expect(getCacheStats().depth).toBe(1);

      endDOMCaches();
      expect(isCachingActive()).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle elements removed during caching', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      getComputedStyleSpy.mockReturnValue(createMockStyle({ display: 'block' }));

      beginDOMCaches();

      const style1 = getCachedStyle(element);
      expect(style1.display).toBe('block');

      // Remove element from DOM
      element.remove();

      // Should still return cached value
      const style2 = getCachedStyle(element);
      expect(style2).toBe(style1);

      endDOMCaches();
    });

    it('should handle multiple pseudo selectors for same element', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      const regularStyle = createMockStyle({ display: 'block' });
      const beforeStyle = createMockStyle({ content: '"*"' });
      const afterStyle = createMockStyle({ content: '":"' });

      getComputedStyleSpy
        .mockReturnValueOnce(regularStyle)
        .mockReturnValueOnce(beforeStyle)
        .mockReturnValueOnce(afterStyle);

      beginDOMCaches();

      const regular = getCachedStyle(element);
      const before = getCachedStyle(element, '::before');
      const after = getCachedStyle(element, '::after');

      // All different style objects
      expect(regular).not.toBe(before);
      expect(before).not.toBe(after);
      expect(regular).not.toBe(after);

      // But same values when retrieved again
      expect(getCachedStyle(element)).toBe(regular);
      expect(getCachedStyle(element, '::before')).toBe(before);
      expect(getCachedStyle(element, '::after')).toBe(after);

      endDOMCaches();
    });

    it('should handle rapid begin/end cycles', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      getComputedStyleSpy.mockReturnValue(createMockStyle());

      for (let i = 0; i < 100; i++) {
        beginDOMCaches();
        getCachedStyle(element);
        endDOMCaches();
      }

      expect(isCachingActive()).toBe(false);
      expect(getCacheStats().depth).toBe(0);
      expect(getCacheStats().styleEntries).toBe(0);
    });

    it('should handle mixed sync/async cache operations', async () => {
      const element = document.createElement('div');
      container.appendChild(element);

      getComputedStyleSpy.mockReturnValue(createMockStyle());

      beginDOMCaches();

      await withCacheAsync(async () => {
        withCache(() => {
          getCachedStyle(element);
        });
        await Promise.resolve();
      });

      // Original begin is still active
      expect(isCachingActive()).toBe(true);
      expect(getCacheStats().depth).toBe(1);

      endDOMCaches();
      expect(isCachingActive()).toBe(false);
    });
  });

  describe('performance verification', () => {
    it('should reduce getComputedStyle calls with caching', () => {
      const elements: Element[] = [];
      for (let i = 0; i < 10; i++) {
        const el = document.createElement('div');
        container.appendChild(el);
        elements.push(el);
      }

      getComputedStyleSpy.mockReturnValue(createMockStyle());

      // Without caching - each call goes to getComputedStyle
      for (const el of elements) {
        getCachedStyle(el);
        getCachedStyle(el);
        getCachedStyle(el);
      }
      expect(getComputedStyleSpy).toHaveBeenCalledTimes(30);

      getComputedStyleSpy.mockClear();

      // With caching - only one call per element
      beginDOMCaches();
      for (const el of elements) {
        getCachedStyle(el);
        getCachedStyle(el);
        getCachedStyle(el);
      }
      endDOMCaches();
      expect(getComputedStyleSpy).toHaveBeenCalledTimes(10);
    });
  });
});
