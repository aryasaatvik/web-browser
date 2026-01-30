/**
 * Tests for visibility utilities.
 *
 * Note: happy-dom doesn't support layout calculations (getBoundingClientRect),
 * so we mock these for layout-dependent tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isElementVisible,
  isElementStyleVisible,
  isVisibleTextNode,
  isInViewport,
  getViewportRatio,
  isElementInteractable,
  isElementActionable,
  getElementCenter,
  computeElementBox,
  receivesPointerEvents,
} from './visibility.js';

describe('Visibility Utilities', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  // Helper to mock getBoundingClientRect
  function mockBoundingRect(element: Element, rect: Partial<DOMRect>) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      top: 0,
      right: 100,
      bottom: 50,
      left: 0,
      toJSON: () => ({}),
      ...rect,
    } as DOMRect);
  }

  describe('isElementVisible', () => {
    it('should return true for a visible element', () => {
      const element = document.createElement('button');
      element.textContent = 'Click me';
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      expect(isElementVisible(element)).toBe(true);
    });

    it('should return false for element with display:none', () => {
      const element = document.createElement('button');
      element.style.display = 'none';
      container.appendChild(element);

      expect(isElementVisible(element)).toBe(false);
    });

    it('should return false for element with visibility:hidden', () => {
      const element = document.createElement('button');
      element.style.visibility = 'hidden';
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      expect(isElementVisible(element)).toBe(false);
    });

    it('should return false for element with opacity:0', () => {
      const element = document.createElement('button');
      element.style.opacity = '0';
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      expect(isElementVisible(element)).toBe(false);
    });

    it('should return false for element with zero dimensions', () => {
      const element = document.createElement('button');
      container.appendChild(element);
      mockBoundingRect(element, { width: 0, height: 0 });

      expect(isElementVisible(element)).toBe(false);
    });

    it('should return false for disconnected element', () => {
      const element = document.createElement('button');
      expect(isElementVisible(element)).toBe(false);
    });

    it('should return false for element with display:contents and no visible children', () => {
      const element = document.createElement('div');
      element.style.display = 'contents';
      container.appendChild(element);

      expect(isElementVisible(element)).toBe(false);
    });

    it('should return true for element with display:contents and visible children', () => {
      const parent = document.createElement('div');
      parent.style.display = 'contents';
      const child = document.createElement('span');
      child.textContent = 'visible';
      parent.appendChild(child);
      container.appendChild(parent);
      mockBoundingRect(child, { width: 100, height: 50 });

      expect(isElementVisible(parent)).toBe(true);
    });

    it('should return true for element with display:contents and visible text node', () => {
      const parent = document.createElement('div');
      parent.style.display = 'contents';
      parent.appendChild(document.createTextNode('visible text'));
      container.appendChild(parent);

      // Mock range.getBoundingClientRect for text node
      const originalCreateRange = document.createRange;
      const mockRange = {
        selectNode: vi.fn(),
        getBoundingClientRect: () => ({ width: 50, height: 20 }),
      };
      vi.spyOn(document, 'createRange').mockReturnValue(mockRange as unknown as Range);

      expect(isElementVisible(parent)).toBe(true);

      document.createRange = originalCreateRange;
    });
  });

  describe('isElementInteractable', () => {
    it('should return true for interactable element', () => {
      const element = document.createElement('button');
      element.textContent = 'Click me';
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      expect(isElementInteractable(element)).toBe(true);
    });

    it('should return false for element with pointer-events:none', () => {
      const element = document.createElement('button');
      element.textContent = 'Click me';
      element.style.pointerEvents = 'none';
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      expect(isElementInteractable(element)).toBe(false);
    });

    it('should return false for invisible element', () => {
      const element = document.createElement('button');
      element.style.display = 'none';
      container.appendChild(element);

      expect(isElementInteractable(element)).toBe(false);
    });
  });

  describe('isElementActionable', () => {
    it('should return true for actionable button', () => {
      const element = document.createElement('button');
      element.textContent = 'Click me';
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      expect(isElementActionable(element)).toBe(true);
    });

    it('should return false for disabled button', () => {
      const element = document.createElement('button');
      element.textContent = 'Click me';
      element.disabled = true;
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      expect(isElementActionable(element)).toBe(false);
    });

    it('should return false for disabled input', () => {
      const element = document.createElement('input');
      element.disabled = true;
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      expect(isElementActionable(element)).toBe(false);
    });

    it('should return false for aria-disabled element', () => {
      const element = document.createElement('button');
      element.textContent = 'Click me';
      element.setAttribute('aria-disabled', 'true');
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      expect(isElementActionable(element)).toBe(false);
    });
  });

  describe('getElementCenter', () => {
    it('should return the center of an element', () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { left: 100, top: 100, width: 100, height: 100 });

      const center = getElementCenter(element);
      expect(center.x).toBe(150);
      expect(center.y).toBe(150);
    });

    it('should handle zero-sized elements', () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { left: 50, top: 50, width: 0, height: 0 });

      const center = getElementCenter(element);
      expect(center.x).toBe(50);
      expect(center.y).toBe(50);
    });
  });

  describe('isInViewport', () => {
    it('should return true for element in viewport', () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { top: 10, bottom: 110, left: 10, right: 110, width: 100, height: 100 });

      // Mock window dimensions
      vi.stubGlobal('innerWidth', 1024);
      vi.stubGlobal('innerHeight', 768);

      expect(isInViewport(element)).toBe(true);
    });

    it('should return false for element above viewport', () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { top: -200, bottom: -100, left: 10, right: 110, width: 100, height: 100 });

      vi.stubGlobal('innerWidth', 1024);
      vi.stubGlobal('innerHeight', 768);

      expect(isInViewport(element)).toBe(false);
    });

    it('should return false for element below viewport', () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { top: 10000, bottom: 10100, left: 10, right: 110, width: 100, height: 100 });

      vi.stubGlobal('innerWidth', 1024);
      vi.stubGlobal('innerHeight', 768);

      expect(isInViewport(element)).toBe(false);
    });

    it('should return false for element with zero dimensions', () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { top: 10, bottom: 10, left: 10, right: 10, width: 0, height: 0 });

      expect(isInViewport(element)).toBe(false);
    });

    it('should respect threshold parameter', () => {
      const element = document.createElement('div');
      container.appendChild(element);
      // Element is 100x100, positioned so only half is in viewport
      mockBoundingRect(element, { top: -50, bottom: 50, left: 0, right: 100, width: 100, height: 100 });

      vi.stubGlobal('innerWidth', 1024);
      vi.stubGlobal('innerHeight', 768);

      // 50% visible, so threshold 0.4 should pass
      expect(isInViewport(element, 0.4)).toBe(true);
      // 50% visible, so threshold 0.6 should fail
      expect(isInViewport(element, 0.6)).toBe(false);
    });
  });

  describe('isElementStyleVisible', () => {
    it('should return true for visible element', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      expect(isElementStyleVisible(element)).toBe(true);
    });

    it('should return false for visibility:hidden', () => {
      const element = document.createElement('div');
      element.style.visibility = 'hidden';
      container.appendChild(element);

      expect(isElementStyleVisible(element)).toBe(false);
    });

    it('should return false for visibility:collapse', () => {
      const element = document.createElement('div');
      element.style.visibility = 'collapse';
      container.appendChild(element);

      expect(isElementStyleVisible(element)).toBe(false);
    });

    it('should use checkVisibility API when available', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      // Mock checkVisibility
      const mockCheckVisibility = vi.fn().mockReturnValue(true);
      (element as any).checkVisibility = mockCheckVisibility;

      expect(isElementStyleVisible(element)).toBe(true);
      expect(mockCheckVisibility).toHaveBeenCalledWith({
        checkVisibilityCSS: true,
        checkOpacity: false,
      });
    });

    it('should return false when checkVisibility returns false', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      // Mock checkVisibility to return false
      (element as any).checkVisibility = vi.fn().mockReturnValue(false);

      expect(isElementStyleVisible(element)).toBe(false);
    });
  });

  describe('content-visibility CSS property', () => {
    it('should handle content-visibility:hidden when checkVisibility not available', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      // Mock getComputedStyle to return content-visibility: hidden
      const originalGetComputedStyle = window.getComputedStyle;
      vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
        const style = originalGetComputedStyle(el);
        return {
          ...style,
          visibility: 'visible',
          getPropertyValue: (prop: string) => {
            if (prop === 'content-visibility') return 'hidden';
            return style.getPropertyValue(prop);
          },
        } as CSSStyleDeclaration;
      });

      // Ensure checkVisibility is not available
      delete (element as any).checkVisibility;

      expect(isElementStyleVisible(element)).toBe(false);
    });
  });

  describe('WebKit details workaround', () => {
    it('should return false for content inside closed details', () => {
      const details = document.createElement('details');
      const content = document.createElement('div');
      content.textContent = 'Hidden content';
      details.appendChild(content);
      container.appendChild(details);

      // Ensure checkVisibility is not available to test fallback
      delete (content as any).checkVisibility;

      expect(isElementStyleVisible(content)).toBe(false);
    });

    it('should return true for content inside open details', () => {
      const details = document.createElement('details');
      details.open = true;
      const content = document.createElement('div');
      content.textContent = 'Visible content';
      details.appendChild(content);
      container.appendChild(details);

      // Ensure checkVisibility is not available to test fallback
      delete (content as any).checkVisibility;

      expect(isElementStyleVisible(content)).toBe(true);
    });

    it('should return true for summary element inside closed details', () => {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Summary';
      details.appendChild(summary);
      container.appendChild(details);

      // Summary should be visible even when details is closed
      delete (summary as any).checkVisibility;

      expect(isElementStyleVisible(summary)).toBe(true);
    });
  });

  describe('getViewportRatio', () => {
    it('should return 0 for disconnected element', async () => {
      const element = document.createElement('div');
      const ratio = await getViewportRatio(element);
      expect(ratio).toBe(0);
    });

    it('should return 0 for element with zero dimensions', async () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { width: 0, height: 0 });

      // Mock IntersectionObserver not available
      const originalIO = (globalThis as any).IntersectionObserver;
      delete (globalThis as any).IntersectionObserver;

      const ratio = await getViewportRatio(element);
      expect(ratio).toBe(0);

      (globalThis as any).IntersectionObserver = originalIO;
    });

    it('should calculate ratio using manual fallback when IntersectionObserver unavailable', async () => {
      const element = document.createElement('div');
      container.appendChild(element);
      // Element fully in viewport
      mockBoundingRect(element, { left: 10, top: 10, right: 110, bottom: 110, width: 100, height: 100 });

      vi.stubGlobal('innerWidth', 1024);
      vi.stubGlobal('innerHeight', 768);

      // Remove IntersectionObserver
      const originalIO = (globalThis as any).IntersectionObserver;
      delete (globalThis as any).IntersectionObserver;

      const ratio = await getViewportRatio(element);
      expect(ratio).toBe(1);

      (globalThis as any).IntersectionObserver = originalIO;
    });

    it('should use IntersectionObserver when available', async () => {
      const element = document.createElement('div');
      container.appendChild(element);

      // Mock IntersectionObserver
      const mockObserve = vi.fn();
      const mockDisconnect = vi.fn();

      class MockIntersectionObserver {
        callback: IntersectionObserverCallback;
        constructor(callback: IntersectionObserverCallback) {
          this.callback = callback;
        }
        observe(target: Element) {
          mockObserve(target);
          // Simulate callback with 0.75 ratio
          setTimeout(() => {
            this.callback(
              [{ intersectionRatio: 0.75 } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver
            );
          }, 0);
        }
        disconnect() {
          mockDisconnect();
        }
      }

      const originalIO = (globalThis as any).IntersectionObserver;
      (globalThis as any).IntersectionObserver = MockIntersectionObserver;

      const ratio = await getViewportRatio(element);
      expect(ratio).toBe(0.75);
      expect(mockObserve).toHaveBeenCalledWith(element);
      expect(mockDisconnect).toHaveBeenCalled();

      (globalThis as any).IntersectionObserver = originalIO;
    });
  });

  describe('computeElementBox', () => {
    it('should return null for disconnected element', () => {
      const element = document.createElement('div');
      expect(computeElementBox(element)).toBe(null);
    });

    it('should return visible:true for visible element', () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      const box = computeElementBox(element);
      expect(box?.visible).toBe(true);
    });

    it('should return visible:false for hidden element', () => {
      const element = document.createElement('div');
      element.style.visibility = 'hidden';
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      const box = computeElementBox(element);
      expect(box?.visible).toBe(false);
    });

    it('should return visible:false for zero-sized element', () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { width: 0, height: 0 });

      const box = computeElementBox(element);
      expect(box?.visible).toBe(false);
    });

    it('should return inline:true for inline element', () => {
      const element = document.createElement('span');
      element.style.display = 'inline';
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 20 });

      const box = computeElementBox(element);
      expect(box?.inline).toBe(true);
    });

    it('should return inline:false for block element', () => {
      const element = document.createElement('div');
      element.style.display = 'block';
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      const box = computeElementBox(element);
      expect(box?.inline).toBe(false);
    });

    it('should return cursor style', () => {
      const element = document.createElement('a');
      element.href = '#';
      element.style.cursor = 'pointer';
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 20 });

      const box = computeElementBox(element);
      expect(box?.cursor).toBe('pointer');
    });

    it('should handle display:contents with visible children', () => {
      const parent = document.createElement('div');
      parent.style.display = 'contents';
      const child = document.createElement('span');
      child.textContent = 'visible';
      parent.appendChild(child);
      container.appendChild(parent);
      mockBoundingRect(child, { width: 100, height: 50 });

      const box = computeElementBox(parent);
      expect(box?.visible).toBe(true);
    });

    it('should handle display:contents with hidden children', () => {
      const parent = document.createElement('div');
      parent.style.display = 'contents';
      const child = document.createElement('span');
      child.style.display = 'none';
      parent.appendChild(child);
      container.appendChild(parent);

      const box = computeElementBox(parent);
      expect(box?.visible).toBe(false);
    });
  });

  describe('receivesPointerEvents', () => {
    it('should return true for normal visible element', () => {
      const element = document.createElement('button');
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      expect(receivesPointerEvents(element)).toBe(true);
    });

    it('should return false for disconnected element', () => {
      const element = document.createElement('button');
      expect(receivesPointerEvents(element)).toBe(false);
    });

    it('should return false for hidden element', () => {
      const element = document.createElement('button');
      element.style.display = 'none';
      container.appendChild(element);

      expect(receivesPointerEvents(element)).toBe(false);
    });

    it('should return false for pointer-events:none', () => {
      const element = document.createElement('button');
      element.style.pointerEvents = 'none';
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      expect(receivesPointerEvents(element)).toBe(false);
    });

    it('should return false for invisible element', () => {
      const element = document.createElement('button');
      element.style.visibility = 'hidden';
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      expect(receivesPointerEvents(element)).toBe(false);
    });

    it('should return false for zero-opacity element', () => {
      const element = document.createElement('button');
      element.style.opacity = '0';
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      expect(receivesPointerEvents(element)).toBe(false);
    });
  });

  describe('isVisibleTextNode', () => {
    it('should return true for visible text node', () => {
      const text = document.createTextNode('Hello');
      container.appendChild(text);

      // Mock range.getBoundingClientRect
      const mockRange = {
        selectNode: vi.fn(),
        getBoundingClientRect: () => ({ width: 50, height: 20 }),
      };
      vi.spyOn(document, 'createRange').mockReturnValue(mockRange as unknown as Range);

      expect(isVisibleTextNode(text)).toBe(true);
    });

    it('should return false for empty text node', () => {
      const text = document.createTextNode('');
      container.appendChild(text);

      // Mock range.getBoundingClientRect
      const mockRange = {
        selectNode: vi.fn(),
        getBoundingClientRect: () => ({ width: 0, height: 0 }),
      };
      vi.spyOn(document, 'createRange').mockReturnValue(mockRange as unknown as Range);

      expect(isVisibleTextNode(text)).toBe(false);
    });
  });

  describe('display:contents handling', () => {
    it('should handle nested display:contents', () => {
      const outer = document.createElement('div');
      outer.style.display = 'contents';
      const inner = document.createElement('div');
      inner.style.display = 'contents';
      const child = document.createElement('span');
      child.textContent = 'visible';

      inner.appendChild(child);
      outer.appendChild(inner);
      container.appendChild(outer);
      mockBoundingRect(child, { width: 100, height: 50 });

      // Outer should be visible because its descendant is visible
      expect(isElementVisible(outer)).toBe(true);
    });

    it('should return false for display:contents with all hidden children', () => {
      const parent = document.createElement('div');
      parent.style.display = 'contents';
      const child1 = document.createElement('span');
      child1.style.display = 'none';
      const child2 = document.createElement('span');
      child2.style.visibility = 'hidden';
      mockBoundingRect(child2, { width: 100, height: 50 });

      parent.appendChild(child1);
      parent.appendChild(child2);
      container.appendChild(parent);

      expect(isElementVisible(parent)).toBe(false);
    });
  });
});
